/* eslint-disable react/prop-types */
/* eslint-disable no-unused-vars */
import { useEffect, useRef, useState } from "react";
import "./Player.css";

// ─── JW Player script loader (once per page) ─────────────────────────────────
let _jwLoading = false;
let _jwDone    = false;
let _jwQueue   = [];

function loadJWPlayerScripts(onReady) {
  if (_jwDone && typeof window.jwplayer !== "undefined") { onReady(); return; }
  _jwQueue.push(onReady);
  if (_jwLoading) return;
  _jwLoading = true;

  function addScript(src, next) {
    if (document.querySelector(`script[src="${src}"]`)) { next(); return; }
    const s = document.createElement("script");
    s.src = src; s.async = false;
    s.onload = next; s.onerror = next;
    document.head.appendChild(s);
  }

  addScript("/assets/hls.light.min.js", () =>
    addScript("/assets/provider.hlsjs.js", () =>
      addScript("https://ssl.p.jwpcdn.com/player/v/8.8.6/jwplayer.js", () => {
        if (window.jwplayer) {
          window.jwplayer.key = "64HPbvSQorQcd52B8XFuhMtEoitbvY/EXJmMBfKcXZQU2Rnn";
        }
        _jwDone = true; _jwLoading = false;
        _jwQueue.forEach((fn) => fn()); _jwQueue = [];
      })
    )
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Player({
  isFastServer,      // boolean — show iframe instead of JW Player
  fastServerUrl,     // string  — iframe src when isFastServer=true
  streamUrl,
  subtitles, thumbnail, intro, outro,
  autoSkipIntro, autoPlay, autoNext,
  episodeId, episodes, playNext,
  animeInfo, episodeNum, streamInfo,
}) {
  const wrapRef    = useRef(null);
  const iframeRef  = useRef(null);
  const playerRef  = useRef(null);
  const cleanupRef = useRef(null);
  const leftAtRef  = useRef(0);
  const epIdxRef   = useRef(-1);
  const introRef   = useRef(intro);
  const outroRef   = useRef(outro);

  const [jwLoaded, setJwLoaded] = useState(typeof window.jwplayer !== "undefined");

  const proxy     = import.meta.env.VITE_PROXY_URL ?? "";
  const m3u8proxy = (import.meta.env.VITE_M3U8_PROXY_URL ?? "").split(",").filter(Boolean);

  useEffect(() => { introRef.current = intro; }, [intro]);
  useEffect(() => { outroRef.current = outro; }, [outro]);

  useEffect(() => {
    if (episodes?.length > 0)
      epIdxRef.current = episodes.findIndex((ep) => ep.id.match(/ep=(\d+)/)?.[1] === episodeId);
  }, [episodeId, episodes]);

  // Load JW scripts once
  useEffect(() => {
    if (typeof window.jwplayer !== "undefined") { setJwLoaded(true); return; }
    loadJWPlayerScripts(() => setJwLoaded(true));
  }, []);

  // ── React to server / stream changes ──────────────────────────────────────
  useEffect(() => {
    if (isFastServer) {
      // Tear down JW Player if it was running
      teardown();
      // iframe src is handled by React prop — nothing else needed
    } else {
      // Tear down any previous JW Player instance first
      teardown();
      if (!jwLoaded || !streamUrl) return;

      const t = setTimeout(() => {
        if (!wrapRef.current) return;
        // Create a fresh inner element for JW Player to own
        const jw = document.createElement("div");
        jw.id = "jw_player_inner";
        jw.style.cssText = "width:100%;height:100%;position:absolute;inset:0;";
        const wrap = wrapRef.current;
        // Remove old JW inner if any
        const old = wrap.querySelector("#jw_player_inner");
        if (old) old.remove();
        wrap.appendChild(jw);
        mountJWPlayer(jw);
      }, 80);

      return () => { clearTimeout(t); teardown(); };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFastServer, jwLoaded, streamUrl, subtitles, intro, outro, episodeId]);

  // ── Teardown without destroying wrapper ───────────────────────────────────
  function teardown() {
    if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null; }
    saveProgress();
    // Kill any orphan JW instance
    try {
      const el = document.getElementById("jw_player_inner");
      if (el) { try { window.jwplayer("jw_player_inner").stop(); } catch (e) {} el.innerHTML = ""; }
    } catch (e) {}
    playerRef.current = null;
  }

  function saveProgress() {
    try {
      if (!leftAtRef.current || !animeInfo?.data_id) return;
      const cw = JSON.parse(localStorage.getItem("continueWatching")) || [];
      const entry = {
        id: animeInfo.id, data_id: animeInfo.data_id, episodeId, episodeNum,
        adultContent: animeInfo.adultContent, poster: animeInfo.poster,
        title: animeInfo.title, japanese_title: animeInfo.japanese_title,
        leftAt: leftAtRef.current, updatedAt: Date.now(),
      };
      const filtered = cw.filter((i) => i.data_id !== entry.data_id);
      filtered.unshift(entry);
      localStorage.setItem("continueWatching", JSON.stringify(filtered));
    } catch (e) {}
  }

  // ── Mount JW Player ───────────────────────────────────────────────────────
  function mountJWPlayer(el) {
    const id = el.id; // "jw_player_inner"

    const iframeUrl = streamInfo?.results?.streamingLink?.iframe ?? streamInfo?.streamingLink?.iframe;
    const referer   = iframeUrl ? new URL(iframeUrl).origin + "/" : "https://megacloud.club/";
    const hdrs      = JSON.stringify({ Referer: referer });
    const base      = m3u8proxy.length ? m3u8proxy[Math.floor(Math.random() * m3u8proxy.length)] : "";
    const videoUrl  = base ? base + encodeURIComponent(streamUrl) + "&headers=" + encodeURIComponent(hdrs) : streamUrl;

    const tracks = [];
    (subtitles || []).forEach((s) => {
      tracks.push({
        file:    proxy ? `${proxy}${encodeURIComponent(s.file)}&headers=${encodeURIComponent(hdrs)}` : s.file,
        kind:    "captions", label: s.label,
        default: !!(s.default || s.label?.toLowerCase() === "english"),
      });
    });
    if (thumbnail) tracks.push({ file: proxy ? `${proxy}${encodeURIComponent(thumbnail)}` : thumbnail, kind: "thumbnails" });

    const savedVol = localStorage.getItem("jwplayer_volume") !== null ? parseFloat(localStorage.getItem("jwplayer_volume")) : 100;

    const player = window.jwplayer(id).setup({
      file: videoUrl, autostart: autoPlay !== false,
      stretching: "uniform", aspectratio: "16:9",
      playbackRateControls: true, volume: savedVol,
      hlsjsdefault: true, width: "100%", height: "100%",
      primary: "html5", preload: "auto", tracks,
    });

    playerRef.current = player;

    player.on("ready", () => {
      // Restore position
      try {
        const cw = JSON.parse(localStorage.getItem("continueWatching")) || [];
        const en = cw.find((i) => i.episodeId === episodeId);
        if (en?.leftAt) player.seek(en.leftAt);
      } catch (e) {}

      // Captions
      const w = player.getWidth();
      player.setCaptionsStyles({ fontSize: (w > 500 ? w * 0.02 : w * 0.03) + "px", color: "#FFF", backgroundOpacity: 0, edgeStyle: "raised" });

      // Inject ±10s buttons — retry until DOM is stable
      injectForwardBtn(id);
      setTimeout(() => injectForwardBtn(id), 500);
      setTimeout(() => injectForwardBtn(id), 1500);

      // Draw timeline markers
      const mi = setInterval(() => {
        const sw = document.querySelector(`#${id} .jw-slider-time`)?.offsetWidth;
        if (sw > 0 && player.getDuration() > 0) {
          addMarkers(id, player, introRef.current, outroRef.current);
          clearInterval(mi);
        }
      }, 100);

      applyProgressColor(id);
    });

    player.on("time", () => {
      leftAtRef.current = Math.floor(player.getPosition());
      handleSkipBtns(player, introRef.current, outroRef.current, autoSkipIntro);
      applyProgressColor(id);
    });

    player.on("resize", () => {
      const w = player.getWidth();
      player.setCaptionsStyles({ fontSize: (w > 500 ? w * 0.02 : w * 0.03) + "px" });
      clearMarkers(id);
      setTimeout(() => addMarkers(id, player, introRef.current, outroRef.current), 300);
      // Re-inject forward button after resize (landscape switch)
      setTimeout(() => injectForwardBtn(id), 400);
    });

    player.on("volume", (e) => localStorage.setItem("jwplayer_volume", e.volume));

    player.on("complete", () => {
      const idx = epIdxRef.current;
      if (idx >= 0 && idx < (episodes?.length ?? 0) - 1 && autoNext)
        playNext(episodes[idx + 1].id.match(/ep=(\d+)/)?.[1]);
      if (new URLSearchParams(window.location.search).get("an") === "1")
        parent.postMessage("clickBtnNext", "*");
    });

    player.on("click", (e) => {
      if (e.detail === 2) {
        const rect = document.getElementById(id)?.getBoundingClientRect();
        if (!rect) return;
        (e.clientX - rect.left) > rect.width / 2
          ? player.seek(Math.min(player.getPosition() + 10, player.getDuration()))
          : player.seek(Math.max(player.getPosition() - 10, 0));
      }
    });

    player.on("fullscreen", (e) => {
      if (e.fullscreen) {
        try { screen.orientation?.lock?.("landscape").catch(() => {}); } catch (er) {}
        // Re-inject buttons after going fullscreen
        setTimeout(() => injectForwardBtn(id), 600);
      } else {
        try { screen.orientation?.unlock?.(); } catch (er) {}
      }
    });

    // Forward btn click (delegated to document)
    const onFwdClick = (e) => {
      if (e.target?.closest?.(`#${id} .jw-icon-rewind.forward`))
        player.seek(Math.min(player.getPosition() + 10, player.getDuration()));
    };
    document.addEventListener("click", onFwdClick);

    // Keyboard
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;
      const pc = document.getElementById(id);
      if (!pc?.contains(document.activeElement) && document.activeElement !== pc) return;
      switch (e.code) {
        case "Space": case "Spacebar": e.preventDefault(); player.getState() === "playing" ? player.pause() : player.play(); break;
        case "ArrowRight": e.preventDefault(); player.seek(Math.min(player.getPosition() + 10, player.getDuration())); break;
        case "ArrowLeft":  e.preventDefault(); player.seek(Math.max(player.getPosition() - 10, 0)); break;
        case "ArrowUp":    e.preventDefault(); player.setVolume(Math.min((player.getVolume() || 0) + 10, 100)); break;
        case "ArrowDown":  e.preventDefault(); player.setVolume(Math.max((player.getVolume() || 0) - 10, 0)); break;
        case "KeyM": player.setMute(!player.getMute()); break;
        case "KeyF": e.preventDefault(); player.setFullscreen(!player.getFullscreen()); break;
      }
    };
    document.addEventListener("keydown", onKey);

    const colorInt = setInterval(() => applyProgressColor(id), 1000);
    const onResize = () => { clearMarkers(id); setTimeout(() => addMarkers(id, player, introRef.current, outroRef.current), 500); setTimeout(() => injectForwardBtn(id), 600); };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);

    el.setAttribute("tabindex", "0"); el.style.outline = "none"; el.focus();

    cleanupRef.current = () => {
      document.removeEventListener("click", onFwdClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      clearInterval(colorInt);
      try { player.stop(); } catch (e) {}
      try { const c = document.getElementById(id); if (c) c.innerHTML = ""; } catch (e) {}
      playerRef.current = null;
    };
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      ref={wrapRef}
      className="w-full h-full"
      style={{ position: "absolute", inset: 0, background: "#000" }}
    >
      {/* Fast server iframe — always in DOM, shown/hidden via CSS */}
      <iframe
        ref={iframeRef}
        src={isFastServer && fastServerUrl ? fastServerUrl : "about:blank"}
        width="100%"
        height="100%"
        frameBorder="0"
        scrolling="no"
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
        style={{
          position: "absolute", inset: 0, border: "none",
          display: isFastServer ? "block" : "none",
        }}
      />

      {/* JW Player target — always in DOM as well */}
      {/* The actual inner div is injected by mountJWPlayer() */}
      {!isFastServer && (
        <>
          {/* Skip buttons */}
          <div className="jw-skip-container" style={{ pointerEvents: "none" }}>
            <span
              className="jw-skip-btn"
              id="jw-skip-intro"
              style={{ pointerEvents: "all" }}
              onClick={() => { const p = playerRef.current; if (p) p.seek(introRef.current?.end ?? 0); }}
            >⏭ Skip Intro</span>
            <span
              className="jw-skip-btn"
              id="jw-skip-outro"
              style={{ pointerEvents: "all" }}
              onClick={() => { const p = playerRef.current; if (p) p.seek(outroRef.current?.end ?? 0); }}
            >⏭ Skip Outro</span>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function injectForwardBtn(id) {
  const pc = document.getElementById(id);
  if (!pc) return;

  // Display bar (center mobile icons)
  const dispRew = pc.querySelector(".jw-display-icon-rewind .jw-icon-rewind");
  if (dispRew) {
    const dispNext = pc.querySelector(".jw-display-icon-next");
    if (dispNext && !dispNext.querySelector(".jw-icon-rewind.forward")) {
      const fwd = dispRew.cloneNode(true);
      fwd.classList.add("forward"); fwd.style.transform = "scaleX(-1)";
      fwd.setAttribute("aria-label", "Forward 10 Seconds");
      dispNext.prepend(fwd);
      const nxt = dispNext.querySelector(".jw-icon-next");
      if (nxt) nxt.style.display = "none";
    }
  }

  // Control bar (bottom bar)
  const barRew = pc.querySelector(".jw-button-container .jw-icon-rewind:not(.forward)");
  if (barRew && !barRew.nextElementSibling?.classList.contains("forward")) {
    const fwd2 = barRew.cloneNode(true);
    fwd2.classList.add("forward"); fwd2.style.transform = "scaleX(-1)";
    fwd2.setAttribute("aria-label", "Forward 10 Seconds");
    barRew.after(fwd2);
  }
}

function applyProgressColor(id) {
  document.querySelectorAll(`#${id} .jw-slider-time .jw-progress`).forEach((el) => (el.style.background = "#0088CC"));
}
function clearMarkers(id) {
  document.querySelectorAll(`#${id} .jw-custom-marker`).forEach((el) => el.remove());
}
function addMarkers(id, player, intro, outro) {
  const dur = player.getDuration(); if (!dur || dur <= 0) return;
  const slider = document.querySelector(`#${id} .jw-slider-time`); if (!slider?.offsetWidth) return;
  clearMarkers(id);
  const iS = intro?.start ?? 0, iE = intro?.end ?? 0;
  const oS = outro?.start ?? 0, oE = outro?.end ?? 0;
  if (iE > iS) { const m = document.createElement("div"); m.className = "jw-custom-marker"; m.style.cssText = `position:absolute;top:0;height:8%;left:${(iS/dur)*100}%;width:${((iE-iS)/dur)*100}%;background:#fdd253;opacity:.7;z-index:10;pointer-events:none;`; slider.appendChild(m); }
  if (oS > 0 && oE > oS) { const m = document.createElement("div"); m.className = "jw-custom-marker"; m.style.cssText = `position:absolute;top:0;height:8%;left:${(oS/dur)*100}%;width:${((oE-oS)/dur)*100}%;background:#ff545c;opacity:.7;z-index:10;pointer-events:none;`; slider.appendChild(m); }
}
function handleSkipBtns(player, intro, outro, autoSkipIntro) {
  const t = player.getPosition();
  const iS = intro?.start ?? 0, iE = intro?.end ?? 0;
  const oS = outro?.start ?? 0, oE = outro?.end ?? 0;
  const si = document.getElementById("jw-skip-intro");
  const so = document.getElementById("jw-skip-outro");
  if (si) { if (iE > 0 && t >= iS && t <= iE) { si.style.display = "block"; if (autoSkipIntro) player.seek(iE); } else si.style.display = "none"; }
  if (so) { if (oS > 0 && oE > 0 && t >= oS && t <= oE) { so.style.display = "block"; if (autoSkipIntro) player.seek(oE); } else so.style.display = "none"; }
}

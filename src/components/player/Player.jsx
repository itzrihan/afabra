/* eslint-disable react/prop-types */
/* eslint-disable no-unused-vars */
import { useEffect, useRef, useState } from "react";
import "./Player.css";

// ─── JW Player script loader (runs once per page) ────────────────────────────
let _jwScriptsLoading = false;
let _jwScriptsDone    = false;
let _jwQueue          = [];

function loadJWPlayerScripts(onReady) {
  if (_jwScriptsDone && typeof window.jwplayer !== "undefined") { onReady(); return; }
  _jwQueue.push(onReady);
  if (_jwScriptsLoading) return;
  _jwScriptsLoading = true;

  function appendScript(src, next) {
    if (document.querySelector(`script[src="${src}"]`)) { next(); return; }
    const s = document.createElement("script");
    s.src = src; s.async = false;
    s.onload = next; s.onerror = next;
    document.head.appendChild(s);
  }

  // /assets/ must be in your React project's /public/assets/ folder
  appendScript("/assets/hls.light.min.js", () => {
    appendScript("/assets/provider.hlsjs.js", () => {
      appendScript("https://ssl.p.jwpcdn.com/player/v/8.8.6/jwplayer.js", () => {
        if (window.jwplayer) {
          window.jwplayer.key = "64HPbvSQorQcd52B8XFuhMtEoitbvY/EXJmMBfKcXZQU2Rnn";
        }
        _jwScriptsDone    = true;
        _jwScriptsLoading = false;
        _jwQueue.forEach((fn) => fn());
        _jwQueue = [];
      });
    });
  });
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Player({
  streamUrl, subtitles, thumbnail, intro, outro,
  autoSkipIntro, autoPlay, autoNext,
  episodeId, episodes, playNext,
  animeInfo, episodeNum, streamInfo,
}) {
  const containerRef = useRef(null);
  const playerRef    = useRef(null);
  const leftAtRef    = useRef(0);
  const cleanupRef   = useRef(null);
  const epIndexRef   = useRef(-1);

  const [jwLoaded, setJwLoaded] = useState(typeof window.jwplayer !== "undefined");

  const proxy     = import.meta.env.VITE_PROXY_URL ?? "";
  const m3u8proxy = (import.meta.env.VITE_M3U8_PROXY_URL ?? "").split(",").filter(Boolean);

  useEffect(() => {
    if (episodes?.length > 0) {
      epIndexRef.current = episodes.findIndex(
        (ep) => ep.id.match(/ep=(\d+)/)?.[1] === episodeId
      );
    }
  }, [episodeId, episodes]);

  // Load scripts once
  useEffect(() => {
    if (typeof window.jwplayer !== "undefined") { setJwLoaded(true); return; }
    loadJWPlayerScripts(() => setJwLoaded(true));
  }, []);

  // Init player
  useEffect(() => {
    if (!jwLoaded || !streamUrl) return;
    let rafId; let cancelled = false;

    function tryInit() {
      if (cancelled) return;
      const el = containerRef.current;
      if (!el || !document.body.contains(el)) { rafId = requestAnimationFrame(tryInit); return; }
      mountPlayer(el);
    }
    rafId = requestAnimationFrame(tryInit);

    return () => { cancelled = true; cancelAnimationFrame(rafId); doCleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jwLoaded, streamUrl, subtitles, intro, outro]);

  function mountPlayer(el) {
    doCleanup();

    const containerId = "jw_player_container";
    el.id = containerId;

    // Proxy URL
    const iframeUrl   = streamInfo?.results?.streamingLink?.iframe ?? streamInfo?.streamingLink?.iframe;
    const referer     = iframeUrl ? new URL(iframeUrl).origin + "/" : "https://megacloud.club/";
    const hdrs        = JSON.stringify({ Referer: referer });
    const base        = m3u8proxy.length ? m3u8proxy[Math.floor(Math.random() * m3u8proxy.length)] : "";
    const videoUrl    = base
      ? base + encodeURIComponent(streamUrl) + "&headers=" + encodeURIComponent(hdrs)
      : streamUrl;

    // Tracks
    const tracks = [];
    (subtitles || []).forEach((s) => {
      tracks.push({
        file:    proxy ? `${proxy}${encodeURIComponent(s.file)}&headers=${encodeURIComponent(hdrs)}` : s.file,
        kind:    "captions",
        label:   s.label,
        default: !!(s.default || s.label?.toLowerCase() === "english"),
      });
    });
    if (thumbnail) {
      tracks.push({ file: proxy ? `${proxy}${encodeURIComponent(thumbnail)}` : thumbnail, kind: "thumbnails" });
    }

    const savedVolume = localStorage.getItem("jwplayer_volume") !== null
      ? parseFloat(localStorage.getItem("jwplayer_volume")) : 100;

    const player = window.jwplayer(containerId).setup({
      file: videoUrl, autostart: autoPlay !== false,
      stretching: "uniform", aspectratio: "16:9",
      playbackRateControls: true, volume: savedVolume,
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

      // Caption size
      const w = player.getWidth();
      player.setCaptionsStyles({ fontSize: (w > 500 ? w * 0.02 : w * 0.03) + "px", color: "#FFF", backgroundOpacity: 0, edgeStyle: "raised" });

      // Forward button
      const pc = document.getElementById(containerId);
      if (pc) {
        const rewDisp = pc.querySelector(".jw-display-icon-rewind .jw-icon-rewind");
        if (rewDisp) {
          const fwd = rewDisp.cloneNode(true);
          fwd.classList.add("forward"); fwd.style.transform = "scaleX(-1)"; fwd.setAttribute("aria-label", "Forward 10 Seconds");
          pc.querySelector(".jw-display-icon-next")?.prepend(fwd);
          const nxt = pc.querySelector(".jw-display-icon-next .jw-icon-next");
          if (nxt) nxt.style.display = "none";
        }
        const barRew = pc.querySelector(".jw-button-container .jw-icon-rewind");
        if (barRew) {
          const fwd2 = barRew.cloneNode(true);
          fwd2.classList.add("forward"); fwd2.style.transform = "scaleX(-1)"; fwd2.setAttribute("aria-label", "Forward 10 Seconds");
          barRew.after(fwd2);
        }
      }

      // Markers
      const mi = setInterval(() => {
        const sw = document.querySelector(`#${containerId} .jw-slider-time`)?.offsetWidth;
        if (sw > 0 && player.getDuration() > 0) { addCustomMarkers(containerId, player, intro, outro); clearInterval(mi); }
      }, 100);
      applyProgressColor(containerId);
    });

    player.on("time", () => {
      leftAtRef.current = Math.floor(player.getPosition());
      handleSkipButtons(player, intro, outro, autoSkipIntro);
      applyProgressColor(containerId);
    });

    player.on("resize", () => {
      const w = player.getWidth();
      player.setCaptionsStyles({ fontSize: (w > 500 ? w * 0.02 : w * 0.03) + "px" });
      clearMarkers(containerId);
      setTimeout(() => addCustomMarkers(containerId, player, intro, outro), 300);
    });

    player.on("volume", (e) => { localStorage.setItem("jwplayer_volume", e.volume); });

    player.on("complete", () => {
      const idx = epIndexRef.current;
      if (idx >= 0 && idx < (episodes?.length ?? 0) - 1 && autoNext)
        playNext(episodes[idx + 1].id.match(/ep=(\d+)/)?.[1]);
      if (new URLSearchParams(window.location.search).get("an") === "1")
        parent.postMessage("clickBtnNext", "*");
    });

    player.on("click", (e) => {
      if (e.detail === 2) {
        const rect = document.getElementById(containerId)?.getBoundingClientRect();
        if (!rect) return;
        (e.clientX - rect.left) > rect.width / 2
          ? player.seek(Math.min(player.getPosition() + 10, player.getDuration()))
          : player.seek(Math.max(player.getPosition() - 10, 0));
      }
    });

    player.on("fullscreen", (e) => {
      e.fullscreen ? screen.orientation?.lock?.("landscape").catch(() => {}) : screen.orientation?.unlock?.();
    });

    const onFwdClick = (e) => {
      if (e.target?.closest?.(".jw-icon-rewind.forward"))
        player.seek(Math.min(player.getPosition() + 10, player.getDuration()));
    };
    document.addEventListener("click", onFwdClick);

    const onKeyDown = (e) => {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;
      const pc = document.getElementById(containerId);
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
    document.addEventListener("keydown", onKeyDown);

    const colorInterval = setInterval(() => applyProgressColor(containerId), 1000);
    const onWinResize = () => { clearMarkers(containerId); setTimeout(() => addCustomMarkers(containerId, player, intro, outro), 500); };
    window.addEventListener("resize", onWinResize);

    const pc = document.getElementById(containerId);
    if (pc) { pc.setAttribute("tabindex", "0"); pc.style.outline = "none"; pc.focus(); }

    cleanupRef.current = () => {
      try {
        const cw = JSON.parse(localStorage.getItem("continueWatching")) || [];
        const entry = { id: animeInfo?.id, data_id: animeInfo?.data_id, episodeId, episodeNum, adultContent: animeInfo?.adultContent, poster: animeInfo?.poster, title: animeInfo?.title, japanese_title: animeInfo?.japanese_title, leftAt: leftAtRef.current, updatedAt: Date.now() };
        if (entry.data_id) { const f = cw.filter((i) => i.data_id !== entry.data_id); f.unshift(entry); localStorage.setItem("continueWatching", JSON.stringify(f)); }
      } catch (err) { console.error("continueWatching save failed:", err); }
      document.removeEventListener("click", onFwdClick);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onWinResize);
      clearInterval(colorInterval);
      try { player.remove(); } catch (e) {}
      playerRef.current = null; cleanupRef.current = null;
    };
  }

  function doCleanup() {
    if (cleanupRef.current) cleanupRef.current();
    else if (playerRef.current) { try { playerRef.current.remove(); } catch (e) {} playerRef.current = null; }
  }

  return (
    <div ref={containerRef} id="jw_player_container" className="w-full h-full"
      tabIndex={0} style={{ outline: "none", background: "#000", position: "absolute", inset: 0 }} />
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function applyProgressColor(id) {
  document.querySelectorAll(`#${id} .jw-slider-time .jw-progress`).forEach((el) => (el.style.background = "#0088CC"));
}
function clearMarkers(id) {
  document.querySelectorAll(`#${id} .jw-custom-marker`).forEach((el) => el.remove());
}
function addCustomMarkers(id, player, intro, outro) {
  const dur = player.getDuration(); if (!dur || dur <= 0) return;
  const slider = document.querySelector(`#${id} .jw-slider-time`); if (!slider?.offsetWidth) return;
  clearMarkers(id);
  const iS = intro?.start ?? 0, iE = intro?.end ?? 0;
  const oS = outro?.start ?? 0, oE = outro?.end ?? 0;
  if (iE > iS) { const m = document.createElement("div"); m.className = "jw-custom-marker"; m.style.cssText = `position:absolute;top:0;height:8%;left:${(iS/dur)*100}%;width:${((iE-iS)/dur)*100}%;background:#fdd253;opacity:.7;z-index:10;pointer-events:none;`; slider.appendChild(m); }
  if (oS > 0 && oE > oS) { const m = document.createElement("div"); m.className = "jw-custom-marker"; m.style.cssText = `position:absolute;top:0;height:8%;left:${(oS/dur)*100}%;width:${((oE-oS)/dur)*100}%;background:#ff545c;opacity:.7;z-index:10;pointer-events:none;`; slider.appendChild(m); }
}
function handleSkipButtons(player, intro, outro, autoSkipIntro) {
  const t = player.getPosition();
  const iS = intro?.start ?? 0, iE = intro?.end ?? 0;
  const oS = outro?.start ?? 0, oE = outro?.end ?? 0;
  const si = document.getElementById("jw-skip-intro");
  const so = document.getElementById("jw-skip-outro");
  if (si) { if (iE > 0 && t >= iS && t <= iE) { si.style.display = "block"; if (autoSkipIntro) player.seek(iE); } else si.style.display = "none"; }
  if (so) { if (oS > 0 && oE > 0 && t >= oS && t <= oE) { so.style.display = "block"; if (autoSkipIntro) player.seek(oE); } else so.style.display = "none"; }
}

/* eslint-disable react/prop-types */
/* eslint-disable no-unused-vars */
import { useEffect, useRef, useState } from "react";
import "./Player.css";

// ─── JW Player script loader (runs once per page) ────────────────────────────
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
    const s   = document.createElement("script");
    s.src     = src;
    s.async   = false;          // preserve load order
    s.onload  = next;
    s.onerror = next;           // continue even on failure
    document.head.appendChild(s);
  }

  // Load order matters: hls → provider → jwplayer
  addScript("/assets/hls.light.min.js", () =>
    addScript("/assets/provider.hlsjs.js", () =>
      addScript("https://ssl.p.jwpcdn.com/player/v/8.8.6/jwplayer.js", () => {
        if (window.jwplayer) {
          window.jwplayer.key = "64HPbvSQorQcd52B8XFuhMtEoitbvY/EXJmMBfKcXZQU2Rnn";
        }
        _jwDone    = true;
        _jwLoading = false;
        _jwQueue.forEach((fn) => fn());
        _jwQueue   = [];
      })
    )
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Player({
  streamUrl, subtitles, thumbnail, intro, outro,
  autoSkipIntro, autoPlay, autoNext,
  episodeId, episodes, playNext,
  animeInfo, episodeNum, streamInfo,
}) {
  const wrapRef      = useRef(null);   // stable outer wrapper — never destroyed
  const playerRef    = useRef(null);
  const leftAtRef    = useRef(0);
  const cleanupRef   = useRef(null);
  const epIndexRef   = useRef(-1);
  const introRef     = useRef(intro);
  const outroRef     = useRef(outro);

  const [jwLoaded, setJwLoaded] = useState(typeof window.jwplayer !== "undefined");

  const proxy     = import.meta.env.VITE_PROXY_URL ?? "";
  const m3u8proxy = (import.meta.env.VITE_M3U8_PROXY_URL ?? "").split(",").filter(Boolean);

  // Keep intro/outro refs current for callbacks
  useEffect(() => { introRef.current = intro; }, [intro]);
  useEffect(() => { outroRef.current = outro; }, [outro]);

  useEffect(() => {
    if (episodes?.length > 0) {
      epIndexRef.current = episodes.findIndex(
        (ep) => ep.id.match(/ep=(\d+)/)?.[1] === episodeId
      );
    }
  }, [episodeId, episodes]);

  // Load JW scripts once
  useEffect(() => {
    if (typeof window.jwplayer !== "undefined") { setJwLoaded(true); return; }
    loadJWPlayerScripts(() => setJwLoaded(true));
  }, []);

  // Mount / remount player when stream changes
  useEffect(() => {
    if (!jwLoaded) return;

    // Always destroy old player first, but keep the wrapper DOM node alive
    destroyPlayer();

    if (!streamUrl) return;

    // Small delay so React finishes any DOM reconciliation
    const t = setTimeout(() => {
      const wrap = wrapRef.current;
      if (!wrap) return;

      // Create a fresh inner div for JW Player to own
      const inner = document.createElement("div");
      inner.id = "jw_player_container";
      inner.style.cssText = "width:100%;height:100%;";
      wrap.innerHTML = "";   // clear previous
      wrap.appendChild(inner);

      mountPlayer(inner);
    }, 50);

    return () => {
      clearTimeout(t);
      destroyPlayer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jwLoaded, streamUrl, subtitles, intro, outro]);

  // ── Destroy without touching the wrapper ref ───────────────────────────
  function destroyPlayer() {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    // Save continue-watching on destroy
    saveProgress();
  }

  function saveProgress() {
    try {
      if (!leftAtRef.current || !animeInfo?.data_id) return;
      const cw    = JSON.parse(localStorage.getItem("continueWatching")) || [];
      const entry = {
        id: animeInfo?.id, data_id: animeInfo?.data_id,
        episodeId, episodeNum,
        adultContent: animeInfo?.adultContent, poster: animeInfo?.poster,
        title: animeInfo?.title, japanese_title: animeInfo?.japanese_title,
        leftAt: leftAtRef.current, updatedAt: Date.now(),
      };
      const filtered = cw.filter((i) => i.data_id !== entry.data_id);
      filtered.unshift(entry);
      localStorage.setItem("continueWatching", JSON.stringify(filtered));
    } catch (e) { /* ignore */ }
  }

  // ── Actually set up JW Player ──────────────────────────────────────────
  function mountPlayer(el) {
    const containerId = el.id;

    // Build m3u8 proxy URL
    const iframeUrl = streamInfo?.results?.streamingLink?.iframe
                   ?? streamInfo?.streamingLink?.iframe;
    const referer   = iframeUrl ? new URL(iframeUrl).origin + "/" : "https://megacloud.club/";
    const hdrs      = JSON.stringify({ Referer: referer });
    const base      = m3u8proxy.length
      ? m3u8proxy[Math.floor(Math.random() * m3u8proxy.length)] : "";
    const videoUrl  = base
      ? base + encodeURIComponent(streamUrl) + "&headers=" + encodeURIComponent(hdrs)
      : streamUrl;

    // Subtitle + thumbnail tracks
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
      tracks.push({
        file: proxy ? `${proxy}${encodeURIComponent(thumbnail)}` : thumbnail,
        kind: "thumbnails",
      });
    }

    const savedVolume = localStorage.getItem("jwplayer_volume") !== null
      ? parseFloat(localStorage.getItem("jwplayer_volume")) : 100;

    const player = window.jwplayer(containerId).setup({
      file: videoUrl,
      autostart: autoPlay !== false,
      stretching: "uniform",
      aspectratio: "16:9",
      playbackRateControls: true,
      volume: savedVolume,
      hlsjsdefault: true,
      width: "100%",
      height: "100%",
      primary: "html5",
      preload: "auto",
      tracks,
    });

    playerRef.current = player;

    // ── ready ──────────────────────────────────────────────────────────
    player.on("ready", () => {
      // Restore continue-watching position
      try {
        const cw = JSON.parse(localStorage.getItem("continueWatching")) || [];
        const en = cw.find((i) => i.episodeId === episodeId);
        if (en?.leftAt) player.seek(en.leftAt);
      } catch (e) {}

      // Caption size
      const w = player.getWidth();
      player.setCaptionsStyles({
        fontSize: (w > 500 ? w * 0.02 : w * 0.03) + "px",
        color: "#FFF", backgroundOpacity: 0, edgeStyle: "raised",
      });

      injectForwardButton(containerId);

      // Draw markers once slider is ready
      const mi = setInterval(() => {
        const sw  = document.querySelector(`#${containerId} .jw-slider-time`)?.offsetWidth;
        const dur = player.getDuration();
        if (sw > 0 && dur > 0) {
          addCustomMarkers(containerId, player, introRef.current, outroRef.current);
          clearInterval(mi);
        }
      }, 100);

      applyProgressColor(containerId);
    });

    // ── time ───────────────────────────────────────────────────────────
    player.on("time", () => {
      leftAtRef.current = Math.floor(player.getPosition());
      handleSkipButtons(player, introRef.current, outroRef.current, autoSkipIntro);
      applyProgressColor(containerId);
    });

    // ── resize ─────────────────────────────────────────────────────────
    player.on("resize", () => {
      const w = player.getWidth();
      player.setCaptionsStyles({ fontSize: (w > 500 ? w * 0.02 : w * 0.03) + "px" });
      clearMarkers(containerId);
      setTimeout(() => addCustomMarkers(containerId, player, introRef.current, outroRef.current), 300);
    });

    // ── volume ─────────────────────────────────────────────────────────
    player.on("volume", (e) => localStorage.setItem("jwplayer_volume", e.volume));

    // ── complete / auto-next ───────────────────────────────────────────
    player.on("complete", () => {
      const idx = epIndexRef.current;
      if (idx >= 0 && idx < (episodes?.length ?? 0) - 1 && autoNext)
        playNext(episodes[idx + 1].id.match(/ep=(\d+)/)?.[1]);
      if (new URLSearchParams(window.location.search).get("an") === "1")
        parent.postMessage("clickBtnNext", "*");
    });

    // ── double-click seek ──────────────────────────────────────────────
    player.on("click", (e) => {
      if (e.detail === 2) {
        const rect = document.getElementById(containerId)?.getBoundingClientRect();
        if (!rect) return;
        (e.clientX - rect.left) > rect.width / 2
          ? player.seek(Math.min(player.getPosition() + 10, player.getDuration()))
          : player.seek(Math.max(player.getPosition() - 10, 0));
      }
    });

    // ── fullscreen → auto landscape on mobile ──────────────────────────
    player.on("fullscreen", (e) => {
      if (e.fullscreen) {
        // Force landscape
        if (screen.orientation?.lock) {
          screen.orientation.lock("landscape").catch(() => {});
        } else if (window.screen?.orientation?.lock) {
          window.screen.orientation.lock("landscape").catch(() => {});
        }
      } else {
        try { screen.orientation?.unlock?.(); } catch (e2) {}
      }
    });

    // ── forward button (delegated) ─────────────────────────────────────
    const onFwdClick = (e) => {
      if (e.target?.closest?.(".jw-icon-rewind.forward"))
        player.seek(Math.min(player.getPosition() + 10, player.getDuration()));
    };
    document.addEventListener("click", onFwdClick);

    // ── keyboard ───────────────────────────────────────────────────────
    const onKeyDown = (e) => {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;
      const pc = document.getElementById(containerId);
      if (!pc?.contains(document.activeElement) && document.activeElement !== pc) return;
      switch (e.code) {
        case "Space": case "Spacebar":
          e.preventDefault();
          player.getState() === "playing" ? player.pause() : player.play(); break;
        case "ArrowRight":
          e.preventDefault();
          player.seek(Math.min(player.getPosition() + 10, player.getDuration())); break;
        case "ArrowLeft":
          e.preventDefault();
          player.seek(Math.max(player.getPosition() - 10, 0)); break;
        case "ArrowUp":
          e.preventDefault();
          player.setVolume(Math.min((player.getVolume() || 0) + 10, 100)); break;
        case "ArrowDown":
          e.preventDefault();
          player.setVolume(Math.max((player.getVolume() || 0) - 10, 0)); break;
        case "KeyM": player.setMute(!player.getMute()); break;
        case "KeyF": e.preventDefault(); player.setFullscreen(!player.getFullscreen()); break;
      }
    };
    document.addEventListener("keydown", onKeyDown);

    // ── periodic progress bar colour ───────────────────────────────────
    const colorInterval = setInterval(() => applyProgressColor(containerId), 1000);

    // ── window resize → redraw markers ────────────────────────────────
    const onWinResize = () => {
      clearMarkers(containerId);
      setTimeout(() => addCustomMarkers(containerId, player, introRef.current, outroRef.current), 500);
    };
    window.addEventListener("resize", onWinResize);

    // Focus for keyboard
    el.setAttribute("tabindex", "0");
    el.style.outline = "none";
    el.focus();

    // Store cleanup — does NOT remove the wrapper, only stops JW Player
    cleanupRef.current = () => {
      document.removeEventListener("click", onFwdClick);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onWinResize);
      clearInterval(colorInterval);
      // Use stop() not remove() — remove() deletes the DOM node and breaks React
      try { player.stop(); } catch (e) {}
      // Manually clear JW Player's injected markup inside the container
      try {
        const c = document.getElementById(containerId);
        if (c) c.innerHTML = "";
      } catch (e) {}
      playerRef.current = null;
    };
  }

  return (
    <div
      ref={wrapRef}
      className="w-full h-full"
      style={{ position: "absolute", inset: 0, background: "#000" }}
    />
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function injectForwardButton(containerId) {
  const pc = document.getElementById(containerId);
  if (!pc) return;

  // Display bar (center of screen on mobile)
  const rewDisp = pc.querySelector(".jw-display-icon-rewind .jw-icon-rewind");
  if (rewDisp && !pc.querySelector(".jw-display-icon-next .jw-icon-rewind.forward")) {
    const fwd = rewDisp.cloneNode(true);
    fwd.classList.add("forward");
    fwd.style.transform = "scaleX(-1)";
    fwd.setAttribute("aria-label", "Forward 10 Seconds");
    const nextBtn = pc.querySelector(".jw-display-icon-next");
    if (nextBtn) {
      nextBtn.prepend(fwd);
      const nxt = nextBtn.querySelector(".jw-icon-next");
      if (nxt) nxt.style.display = "none";
    }
  }

  // Control bar (bottom)
  const barRew = pc.querySelector(".jw-button-container .jw-icon-rewind:not(.forward)");
  if (barRew && !barRew.nextElementSibling?.classList.contains("forward")) {
    const fwd2 = barRew.cloneNode(true);
    fwd2.classList.add("forward");
    fwd2.style.transform = "scaleX(-1)";
    fwd2.setAttribute("aria-label", "Forward 10 Seconds");
    barRew.after(fwd2);
  }
}

function applyProgressColor(id) {
  document.querySelectorAll(`#${id} .jw-slider-time .jw-progress`)
    .forEach((el) => (el.style.background = "#0088CC"));
}

function clearMarkers(id) {
  document.querySelectorAll(`#${id} .jw-custom-marker`).forEach((el) => el.remove());
}

function addCustomMarkers(id, player, intro, outro) {
  const dur = player.getDuration();
  if (!dur || dur <= 0) return;
  const slider = document.querySelector(`#${id} .jw-slider-time`);
  if (!slider?.offsetWidth) return;
  clearMarkers(id);

  const iS = intro?.start ?? 0, iE = intro?.end ?? 0;
  const oS = outro?.start ?? 0, oE = outro?.end ?? 0;

  if (iE > iS) {
    const m = document.createElement("div");
    m.className = "jw-custom-marker";
    m.style.cssText = `position:absolute;top:0;height:8%;left:${(iS/dur)*100}%;width:${((iE-iS)/dur)*100}%;background:#fdd253;opacity:.7;z-index:10;pointer-events:none;`;
    slider.appendChild(m);
  }
  if (oS > 0 && oE > oS) {
    const m = document.createElement("div");
    m.className = "jw-custom-marker";
    m.style.cssText = `position:absolute;top:0;height:8%;left:${(oS/dur)*100}%;width:${((oE-oS)/dur)*100}%;background:#ff545c;opacity:.7;z-index:10;pointer-events:none;`;
    slider.appendChild(m);
  }
}

function handleSkipButtons(player, intro, outro, autoSkipIntro) {
  const t  = player.getPosition();
  const iS = intro?.start ?? 0, iE = intro?.end ?? 0;
  const oS = outro?.start ?? 0, oE = outro?.end ?? 0;
  const si = document.getElementById("jw-skip-intro");
  const so = document.getElementById("jw-skip-outro");

  if (si) {
    if (iE > 0 && t >= iS && t <= iE) {
      si.style.display = "block";
      if (autoSkipIntro) player.seek(iE);
    } else si.style.display = "none";
  }
  if (so) {
    if (oS > 0 && oE > 0 && t >= oS && t <= oE) {
      so.style.display = "block";
      if (autoSkipIntro) player.seek(oE);
    } else so.style.display = "none";
  }
}

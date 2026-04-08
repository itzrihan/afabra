/* eslint-disable react/prop-types */
/* eslint-disable no-unused-vars */
import { useEffect, useRef, useState } from "react";
import "./Player.css";
import website_name from "@/src/config/website";

// ─── Load JW Player script once ──────────────────────────────────────────────
let jwReady = false;
let jwCallbacks = [];

function loadJWPlayer(cb) {
  if (typeof window.jwplayer !== "undefined") {
    cb();
    return;
  }
  jwCallbacks.push(cb);
  if (jwReady) return; // already loading
  jwReady = true;

  // HLS provider
  const hls = document.createElement("script");
  hls.src = "./assets/hls.light.min.js";
  hls.async = true;
  document.head.appendChild(hls);

  hls.onload = () => {
    const prov = document.createElement("script");
    prov.src = "./assets/provider.hlsjs.js";
    prov.async = true;
    document.head.appendChild(prov);

    prov.onload = () => {
      const jw = document.createElement("script");
      jw.src = "https://ssl.p.jwpcdn.com/player/v/8.8.6/jwplayer.js";
      jw.async = true;
      document.head.appendChild(jw);

      jw.onload = () => {
        window.jwplayer.key = "64HPbvSQorQcd52B8XFuhMtEoitbvY/EXJmMBfKcXZQU2Rnn";
        jwCallbacks.forEach((fn) => fn());
        jwCallbacks = [];
      };
    };
  };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Player({
  streamUrl,
  subtitles,
  thumbnail,
  intro,
  outro,
  autoSkipIntro,
  autoPlay,
  autoNext,
  episodeId,
  episodes,
  playNext,
  animeInfo,
  episodeNum,
  streamInfo,
}) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const leftAtRef = useRef(0);
  const [jwLoaded, setJwLoaded] = useState(typeof window.jwplayer !== "undefined");

  const proxy = import.meta.env.VITE_PROXY_URL;
  const m3u8proxy = import.meta.env.VITE_M3U8_PROXY_URL?.split(",") || [];

  const currentEpisodeIndexRef = useRef(
    episodes?.findIndex((ep) => ep.id.match(/ep=(\d+)/)?.[1] === episodeId) ?? -1
  );

  useEffect(() => {
    if (episodes?.length > 0) {
      currentEpisodeIndexRef.current = episodes.findIndex(
        (ep) => ep.id.match(/ep=(\d+)/)?.[1] === episodeId
      );
    }
  }, [episodeId, episodes]);

  // ─── Load JW Player scripts then mark ready ──────────────────────────────
  useEffect(() => {
    if (typeof window.jwplayer !== "undefined") {
      setJwLoaded(true);
      return;
    }
    loadJWPlayer(() => setJwLoaded(true));
  }, []);

  // ─── Init / re-init player whenever stream URL or subtitles change ────────
  useEffect(() => {
    if (!jwLoaded || !streamUrl || !containerRef.current) return;

    // Destroy previous instance
    if (playerRef.current) {
      try { playerRef.current.remove(); } catch (e) { /* ignore */ }
      playerRef.current = null;
    }

    // Ensure container has a unique id
    const containerId = "jw_player_container";
    containerRef.current.id = containerId;

    // Build proxy URL
    const iframeUrl = streamInfo?.streamingLink?.iframe;
    const refererOrigin = iframeUrl
      ? new URL(iframeUrl).origin + "/"
      : window.location.origin + "/";
    const headersEncoded = encodeURIComponent(JSON.stringify({ Referer: refererOrigin }));

    const proxyBase = m3u8proxy[Math.floor(Math.random() * m3u8proxy.length)];
    const videoUrl = proxyBase + encodeURIComponent(streamUrl) + "&headers=" + headersEncoded;

    // Build tracks: subtitles + thumbnail
    const tracks = [];
    const proxiedSubs = (subtitles || []).map((s) => ({
      ...s,
      file: `${proxy}${encodeURIComponent(s.file)}&headers=${encodeURIComponent(JSON.stringify({ Referer: refererOrigin }))}`,
    }));

    proxiedSubs.forEach((s) => {
      tracks.push({
        file: s.file,
        kind: "captions",
        label: s.label,
        default: s.default || s.label?.toLowerCase() === "english",
      });
    });

    if (thumbnail) {
      tracks.push({ file: `${proxy}${thumbnail}`, kind: "thumbnails" });
    }

    // Restore volume
    const savedVolume =
      localStorage.getItem("jwplayer_volume") !== null
        ? parseFloat(localStorage.getItem("jwplayer_volume"))
        : 100;

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

    // ── ready: restore position, captions size, forward button, markers ────
    player.on("ready", () => {
      // Restore continue-watching position
      try {
        const cwList = JSON.parse(localStorage.getItem("continueWatching")) || [];
        const entry = cwList.find((item) => item.episodeId === episodeId);
        if (entry?.leftAt) player.seek(entry.leftAt);
      } catch (e) { /* ignore */ }

      // Caption font size
      const w = player.getWidth();
      player.setCaptionsStyles({
        fontSize: (w > 500 ? w * 0.02 : w * 0.03) + "px",
        color: "#FFF",
        backgroundOpacity: 0,
        edgeStyle: "raised",
      });

      // Inject forward button next to rewind
      const pc = document.getElementById(containerId);
      if (pc) {
        const rewindDisplay = pc.querySelector(".jw-display-icon-rewind");
        if (rewindDisplay) {
          const rewClone = rewindDisplay.querySelector(".jw-icon-rewind")?.cloneNode(true);
          if (rewClone) {
            rewClone.classList.add("forward");
            rewClone.style.transform = "scaleX(-1)";
            rewClone.setAttribute("aria-label", "Forward 10 Seconds");
            pc.querySelector(".jw-display-icon-next")?.prepend(rewClone);
            pc.querySelector(".jw-display-icon-next .jw-icon-next")?.style.setProperty("display", "none");
          }
        }

        const barRewind = pc.querySelector(".jw-button-container .jw-icon-rewind");
        if (barRewind) {
          const clone = barRewind.cloneNode(true);
          clone.classList.add("forward");
          clone.style.transform = "scaleX(-1)";
          clone.setAttribute("aria-label", "Forward 10 Seconds");
          barRewind.after(clone);
        }
      }

      // Start marker draw loop
      const interval = setInterval(() => {
        const sw = document.querySelector(`#${containerId} .jw-slider-time`)?.offsetWidth;
        const dur = player.getDuration();
        if (sw > 0 && dur > 0) {
          addCustomMarkers(player, containerId, intro, outro);
          clearInterval(interval);
        }
      }, 100);

      // Progress bar colour
      applyProgressColor(containerId);
    });

    // ── time: skip intro/outro + save position ──────────────────────────────
    player.on("time", () => {
      leftAtRef.current = Math.floor(player.getPosition());
      handleSkipButtons(player, intro, outro, autoSkipIntro);
      applyProgressColor(containerId);
    });

    // ── resize: resize captions + redraw markers ────────────────────────────
    player.on("resize", () => {
      const w = player.getWidth();
      player.setCaptionsStyles({
        fontSize: (w > 500 ? w * 0.02 : w * 0.03) + "px",
      });
      document.querySelectorAll(`#${containerId} .jw-custom-marker`).forEach((el) => el.remove());
      setTimeout(() => addCustomMarkers(player, containerId, intro, outro), 300);
    });

    // ── volume: persist ─────────────────────────────────────────────────────
    player.on("volume", (e) => {
      localStorage.setItem("jwplayer_volume", e.volume);
    });

    // ── complete: auto-next ─────────────────────────────────────────────────
    player.on("complete", () => {
      const idx = currentEpisodeIndexRef.current;
      if (idx >= 0 && idx < (episodes?.length ?? 0) - 1 && autoNext) {
        playNext(episodes[idx + 1].id.match(/ep=(\d+)/)?.[1]);
      }
      // also notify parent
      const params = new URLSearchParams(window.location.search);
      if (params.get("an") === "1") {
        parent.postMessage("clickBtnNext", "*");
      }
    });

    // ── double-click seek ───────────────────────────────────────────────────
    player.on("click", (e) => {
      if (e.detail === 2) {
        const rect = document.getElementById(containerId)?.getBoundingClientRect();
        if (!rect) return;
        const cx = e.clientX - rect.left;
        if (cx > rect.width / 2) {
          player.seek(Math.min(player.getPosition() + 10, player.getDuration()));
        } else {
          player.seek(Math.max(player.getPosition() - 10, 0));
        }
      }
    });

    // ── forward button clicks ───────────────────────────────────────────────
    document.addEventListener("click", handleForwardClick);

    // ── keyboard shortcuts ──────────────────────────────────────────────────
    const onKeyDown = (e) => {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;

      const pc = document.getElementById(containerId);
      if (!pc) return;
      if (!pc.contains(document.activeElement) && document.activeElement !== pc) return;

      switch (e.code) {
        case "Space":
        case "Spacebar":
          e.preventDefault();
          player.getState() === "playing" ? player.pause() : player.play();
          break;
        case "ArrowRight":
          e.preventDefault();
          player.seek(Math.min(player.getPosition() + 10, player.getDuration()));
          break;
        case "ArrowLeft":
          e.preventDefault();
          player.seek(Math.max(player.getPosition() - 10, 0));
          break;
        case "ArrowUp":
          e.preventDefault();
          player.setVolume(Math.min((player.getVolume() || 0) + 10, 100));
          break;
        case "ArrowDown":
          e.preventDefault();
          player.setVolume(Math.max((player.getVolume() || 0) - 10, 0));
          break;
        case "KeyM":
          player.setMute(!player.getMute());
          break;
        case "KeyF":
          e.preventDefault();
          player.setFullscreen(!player.getFullscreen());
          break;
        default:
          break;
      }
    };
    document.addEventListener("keydown", onKeyDown);

    // ── fullscreen: orientation lock on mobile ──────────────────────────────
    player.on("fullscreen", (e) => {
      if (e.fullscreen) {
        if (screen.orientation?.lock) {
          screen.orientation.lock("landscape").catch(() => {});
        }
      } else {
        screen.orientation?.unlock?.();
      }
    });

    // ── periodic progress bar colour fix ───────────────────────────────────
    const colorInterval = setInterval(() => applyProgressColor(containerId), 1000);

    // ── window resize: redraw markers ───────────────────────────────────────
    const onResize = () => {
      document.querySelectorAll(`#${containerId} .jw-custom-marker`).forEach((el) => el.remove());
      setTimeout(() => addCustomMarkers(player, containerId, intro, outro), 500);
    };
    window.addEventListener("resize", onResize);

    // ── focus container for keyboard shortcuts ──────────────────────────────
    const pc = document.getElementById(containerId);
    if (pc) {
      pc.setAttribute("tabindex", "0");
      pc.style.outline = "none";
      pc.focus();
    }

    return () => {
      // Save continue-watching
      try {
        const cw = JSON.parse(localStorage.getItem("continueWatching")) || [];
        const newEntry = {
          id: animeInfo?.id,
          data_id: animeInfo?.data_id,
          episodeId,
          episodeNum,
          adultContent: animeInfo?.adultContent,
          poster: animeInfo?.poster,
          title: animeInfo?.title,
          japanese_title: animeInfo?.japanese_title,
          leftAt: leftAtRef.current,
          updatedAt: Date.now(),
        };
        if (newEntry.data_id) {
          const filtered = cw.filter((item) => item.data_id !== newEntry.data_id);
          filtered.unshift(newEntry);
          localStorage.setItem("continueWatching", JSON.stringify(filtered));
        }
      } catch (err) {
        console.error("Failed to save continueWatching:", err);
      }

      document.removeEventListener("click", handleForwardClick);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
      clearInterval(colorInterval);

      try { player.remove(); } catch (e) { /* ignore */ }
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jwLoaded, streamUrl, subtitles, intro, outro]);

  return (
    <div
      ref={containerRef}
      id="jw_player_container"
      className="w-full h-full"
      tabIndex={0}
      style={{ outline: "none", background: "#000" }}
    />
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function applyProgressColor(containerId) {
  document
    .querySelectorAll(`#${containerId} .jw-slider-time .jw-progress`)
    .forEach((el) => (el.style.background = "#0088CC"));
}

function handleSkipButtons(player, intro, outro, autoSkipIntro) {
  const t = player.getPosition();
  const introStart = intro?.start ?? 0;
  const introEnd = intro?.end ?? 0;
  const outroStart = outro?.start ?? 0;
  const outroEnd = outro?.end ?? 0;

  const si = document.getElementById("jw-skip-intro");
  const so = document.getElementById("jw-skip-outro");

  if (si) {
    if (introEnd > 0 && t >= introStart && t <= introEnd) {
      si.style.display = "block";
      if (autoSkipIntro) player.seek(introEnd);
    } else {
      si.style.display = "none";
    }
  }

  if (so) {
    if (outroStart > 0 && outroEnd > 0 && t >= outroStart && t <= outroEnd) {
      so.style.display = "block";
      if (autoSkipIntro) player.seek(outroEnd);
    } else {
      so.style.display = "none";
    }
  }
}

function addCustomMarkers(player, containerId, intro, outro) {
  const duration = player.getDuration();
  if (!duration || duration <= 0) return;

  const slider = document.querySelector(`#${containerId} .jw-slider-time`);
  if (!slider || slider.offsetWidth === 0) return;

  // Remove old markers
  slider.querySelectorAll(".jw-custom-marker").forEach((el) => el.remove());

  const introStart = intro?.start ?? 0;
  const introEnd = intro?.end ?? 0;
  const outroStart = outro?.start ?? 0;
  const outroEnd = outro?.end ?? 0;

  if (introEnd > introStart) {
    const s = (introStart / duration) * 100;
    const w = ((introEnd - introStart) / duration) * 100;
    const m = document.createElement("div");
    m.className = "jw-custom-marker";
    m.style.cssText = `position:absolute;height:8%;top:0;left:${s}%;width:${w}%;background:#fdd253;opacity:0.7;z-index:10;pointer-events:none;`;
    slider.appendChild(m);
  }

  if (outroStart > 0 && outroEnd > outroStart) {
    const s = (outroStart / duration) * 100;
    const w = ((outroEnd - outroStart) / duration) * 100;
    const m = document.createElement("div");
    m.className = "jw-custom-marker";
    m.style.cssText = `position:absolute;height:8%;top:0;left:${s}%;width:${w}%;background:#ff545c;opacity:0.7;z-index:10;pointer-events:none;`;
    slider.appendChild(m);
  }
}

function handleForwardClick(e) {
  const btn = e.target?.closest?.(".jw-icon-rewind.forward");
  if (!btn) return;
  const container = btn.closest("[id^='jw_player']");
  if (!container) return;
  const p = window.jwplayer(container.id);
  if (p) p.seek(Math.min(p.getPosition() + 10, p.getDuration()));
}

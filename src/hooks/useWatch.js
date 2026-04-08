/* eslint-disable no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useEffect, useRef } from "react";
import getAnimeInfo from "@/src/utils/getAnimeInfo.utils";
import getEpisodes from "@/src/utils/getEpisodes.utils";
import getNextEpisodeSchedule from "../utils/getNextEpisodeSchedule.utils";
import getServers from "../utils/getServers.utils";
import getStreamInfo from "../utils/getStreamInfo.utils";

// Unique fake data_id for the Fast server (never conflicts with API server IDs)
const FAST_SERVER_DATA_ID = "fast-server-megaplay";

// Build the Fast server iframe URL for a given episode ID and type
const buildFastServerUrl = (epId, type) => {
  const streamType = type === "dub" ? "dub" : "sub";
  return `https://megaplay.buzz/stream/s-2/${epId}/${streamType}`;
};

// Inject Fast server at the very front of the server list for every type that
// exists in the real server list (sub / dub / raw). If only sub servers exist,
// only a sub Fast entry is added – and so on.
const injectFastServer = (apiServers, epId) => {
  if (!epId) return apiServers;

  const types = [...new Set(apiServers.map((s) => s.type).filter(Boolean))];

  const fastEntries = types.map((type) => ({
    serverName: "Fast",
    data_id: `${FAST_SERVER_DATA_ID}-${type}`,
    type,
    isFast: true, // internal flag used in stream-fetch logic
    fastUrl: buildFastServerUrl(epId, type),
  }));

  return [...fastEntries, ...apiServers];
};

export const useWatch = (animeId, initialEpisodeId) => {
  const [error, setError] = useState(null);
  const [buffering, setBuffering] = useState(true);
  const [streamInfo, setStreamInfo] = useState(null);
  const [animeInfo, setAnimeInfo] = useState(null);
  const [episodes, setEpisodes] = useState(null);
  const [animeInfoLoading, setAnimeInfoLoading] = useState(false);
  const [totalEpisodes, setTotalEpisodes] = useState(null);
  const [seasons, setSeasons] = useState(null);
  const [servers, setServers] = useState(null);
  const [streamUrl, setStreamUrl] = useState(null);
  const [isFullOverview, setIsFullOverview] = useState(false);
  const [subtitles, setSubtitles] = useState([]);
  const [thumbnail, setThumbnail] = useState(null);
  const [intro, setIntro] = useState(null);
  const [outro, setOutro] = useState(null);
  const [episodeId, setEpisodeId] = useState(null);
  const [activeEpisodeNum, setActiveEpisodeNum] = useState(null);
  const [activeServerId, setActiveServerId] = useState(null);
  const [activeServerType, setActiveServerType] = useState(null);
  const [activeServerName, setActiveServerName] = useState(null);
  const [serverLoading, setServerLoading] = useState(true);
  const [nextEpisodeSchedule, setNextEpisodeSchedule] = useState(null);
  const isServerFetchInProgress = useRef(false);
  const isStreamFetchInProgress = useRef(false);

  // ─── Reset on anime change ────────────────────────────────────────────────
  useEffect(() => {
    setEpisodes(null);
    setEpisodeId(null);
    setActiveEpisodeNum(null);
    setServers(null);
    setActiveServerId(null);
    setActiveServerType(null);
    setActiveServerName(null);
    setStreamInfo(null);
    setStreamUrl(null);
    setSubtitles([]);
    setThumbnail(null);
    setIntro(null);
    setOutro(null);
    setBuffering(true);
    setServerLoading(true);
    setError(null);
    setAnimeInfo(null);
    setSeasons(null);
    setTotalEpisodes(null);
    setAnimeInfoLoading(true);
    isServerFetchInProgress.current = false;
    isStreamFetchInProgress.current = false;
  }, [animeId]);

  // ─── Fetch anime info + episodes ─────────────────────────────────────────
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setAnimeInfoLoading(true);

        const [animeData, episodesData] = await Promise.all([
          getAnimeInfo(animeId, false),
          getEpisodes(animeId),
        ]);

        setAnimeInfo(animeData?.data || null);
        setSeasons(animeData?.seasons || null);
        setEpisodes(episodesData?.episodes || []);
        setTotalEpisodes(episodesData?.totalEpisodes || null);

        const newEpisodeId =
          initialEpisodeId ||
          (episodesData?.episodes?.length > 0
            ? episodesData.episodes[0].id.match(/ep=(\d+)/)?.[1]
            : null);

        setEpisodeId(newEpisodeId);
      } catch (err) {
        console.error("Error fetching initial data:", err);
        setError(err.message || "An error occurred.");
      } finally {
        setAnimeInfoLoading(false);
      }
    };

    fetchInitialData();
  }, [animeId, initialEpisodeId]);

  // ─── Next episode schedule ────────────────────────────────────────────────
  useEffect(() => {
    const fetchNextEpisodeSchedule = async () => {
      try {
        const data = await getNextEpisodeSchedule(animeId);
        setNextEpisodeSchedule(data);
      } catch (err) {
        console.error("Error fetching next episode schedule:", err);
      }
    };

    fetchNextEpisodeSchedule();
  }, [animeId]);

  // ─── Active episode number ────────────────────────────────────────────────
  useEffect(() => {
    if (!episodes || !episodeId) {
      setActiveEpisodeNum(null);
      return;
    }

    const activeEpisode = episodes.find((episode) => {
      const match = episode.id.match(/ep=(\d+)/);
      return match && match[1] === episodeId;
    });

    const newActiveEpisodeNum = activeEpisode ? activeEpisode.episode_no : null;
    if (activeEpisodeNum !== newActiveEpisodeNum) {
      setActiveEpisodeNum(newActiveEpisodeNum);
    }
  }, [episodeId, episodes]);

  // ─── Fetch servers ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!episodeId || !episodes || isServerFetchInProgress.current) return;

    let mounted = true;
    const controller = new AbortController();
    isServerFetchInProgress.current = true;
    setServerLoading(true);

    const fetchServers = async () => {
      try {
        const data = await getServers(animeId, episodeId, {
          signal: controller.signal,
        });

        if (!mounted) return;

        const rawServers = Array.isArray(data) ? data : data?.results || [];

        const filteredServers = rawServers.filter(
          (server) => server?.serverName && server?.data_id && server?.type
        );

        // Inject Fast server first, then the real API servers
        const serversList = injectFastServer(filteredServers, episodeId);

        const savedServerName = localStorage.getItem("server_name");
        const savedServerType = localStorage.getItem("server_type");

        // Try to restore the user's last-used server; default to Fast (index 0)
        const initialServer =
          serversList.find(
            (s) =>
              s.serverName === savedServerName &&
              s.type?.toLowerCase() === savedServerType?.toLowerCase()
          ) ||
          serversList.find((s) => s.serverName === savedServerName) ||
          serversList[0]; // Fast server is always first

        setServers(serversList);
        setActiveServerType(initialServer?.type || null);
        setActiveServerName(initialServer?.serverName || null);
        setActiveServerId(initialServer?.data_id || null);

        if (!serversList.length) {
          setError("No servers available.");
        }
      } catch (err) {
        if (err?.name === "AbortError") return;
        console.error("Error fetching servers:", err);
        if (mounted) setError(err.message || "An error occurred.");
      } finally {
        if (mounted) {
          setServerLoading(false);
          isServerFetchInProgress.current = false;
        }
      }
    };

    fetchServers();

    return () => {
      mounted = false;
      try {
        controller.abort();
      } catch (e) {}
      isServerFetchInProgress.current = false;
    };
  }, [animeId, episodeId, episodes]);

  // ─── Fetch stream info ────────────────────────────────────────────────────
  useEffect(() => {
    if (
      !episodeId ||
      !activeServerId ||
      !servers ||
      isServerFetchInProgress.current ||
      isStreamFetchInProgress.current
    ) {
      return;
    }

    const fetchStreamInfo = async () => {
      isStreamFetchInProgress.current = true;
      setBuffering(true);

      try {
        const server = servers.find((srv) => srv.data_id === activeServerId);

        if (!server) {
          setError("No server found with the activeServerId.");
          return;
        }

        // ── Fast server: use the pre-built iframe URL directly ──────────────
        if (server.isFast) {
          // Rebuild URL with correct type in case episodeId changed
          const url = buildFastServerUrl(episodeId, server.type);
          setStreamUrl(url);
          setStreamInfo(null);
          setIntro(null);
          setOutro(null);
          setSubtitles([]);
          setThumbnail(null);
          return;
        }

        // ── Regular servers: call the stream API ────────────────────────────
        const data = await getStreamInfo(
          animeId,
          episodeId,
          String(server.serverName).toLowerCase(),
          String(server.type).toLowerCase()
        );

        const streamingLink =
          data?.results?.streamingLink || data?.streamingLink || null;

        setStreamInfo(data);
        setStreamUrl(streamingLink?.link?.file || null);
        setIntro(streamingLink?.intro || null);
        setOutro(streamingLink?.outro || null);

        const subs =
          streamingLink?.tracks
            ?.filter((track) => track.kind === "captions")
            .map(({ file, label, kind, default: isDefault }) => ({
              file,
              label,
              kind,
              default: !!isDefault,
            })) || [];

        setSubtitles(subs);

        const thumbnailTrack = streamingLink?.tracks?.find(
          (track) => track.kind === "thumbnails" && track.file
        );

        setThumbnail(thumbnailTrack?.file || null);

        if (!streamingLink?.link?.file) {
          setError("Stream URL not found.");
        }
      } catch (err) {
        console.error("Error fetching stream info:", err);
        setError(err.message || "An error occurred.");
      } finally {
        setBuffering(false);
        isStreamFetchInProgress.current = false;
      }
    };

    fetchStreamInfo();
  }, [animeId, episodeId, activeServerId, servers]);

  return {
    error,
    buffering,
    serverLoading,
    streamInfo,
    animeInfo,
    episodes,
    nextEpisodeSchedule,
    animeInfoLoading,
    totalEpisodes,
    seasons,
    servers,
    streamUrl,
    isFullOverview,
    setIsFullOverview,
    subtitles,
    thumbnail,
    intro,
    outro,
    episodeId,
    setEpisodeId,
    activeEpisodeNum,
    setActiveEpisodeNum,
    activeServerId,
    setActiveServerId,
    activeServerType,
    setActiveServerType,
    activeServerName,
    setActiveServerName,
  };
};

import { useState, useEffect, useRef } from "react";
import getAnimeInfo from "@/src/utils/getAnimeInfo.utils";
import getEpisodes from "@/src/utils/getEpisodes.utils";
import getNextEpisodeSchedule from "../utils/getNextEpisodeSchedule.utils";
import getServers from "../utils/getServers.utils";
import getStreamInfo from "../utils/getStreamInfo.utils";

// Priority for servers: 'Fast' is given priority 0, meaning it comes first
const SERVER_PRIORITY = {
  fast: 0,  // Fast server gets the highest priority
  megacloud: 1,
  vidsrc: 2,
};

// Function to sort the servers based on the priority
const sortServersByPriority = (list) => {
  return [...list].sort((a, b) => {
    const aName = String(a?.serverName || "").trim().toLowerCase();
    const bName = String(b?.serverName || "").trim().toLowerCase();

    const aPriority = SERVER_PRIORITY[aName] ?? 999; // Default to 999 if server is not in priority list
    const bPriority = SERVER_PRIORITY[bName] ?? 999;

    if (aPriority !== bPriority) {
      return aPriority - bPriority; // Sort by priority
    }

    return aName.localeCompare(bName); // If priorities are equal, fallback to alphabetical order
  });
};

// Function to generate the Fast server URL
const getFastServerUrl = (epId) => {
  return `https://megaplay.buzz/stream/s-2/${epId}/sub`; // Embed Fast server URL here
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

        // Sort servers based on priority
        const serversList = sortServersByPriority(filteredServers);

        const savedServerName = localStorage.getItem("server_name");
        const savedServerType = localStorage.getItem("server_type");

        const initialServer =
          serversList.find(
            (s) =>
              s.serverName === savedServerName &&
              s.type?.toLowerCase() === savedServerType?.toLowerCase()
          ) ||
          serversList.find((s) => s.serverName === savedServerName) ||
          serversList[0];

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

        // Check if Fast server is selected
        const fastServerUrl = getFastServerUrl(episodeId);

        if (fastServerUrl) {
          setStreamUrl(fastServerUrl); // Set Fast server URL for streaming
        } else {
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

          const subtitles =
            streamingLink?.tracks
              ?.filter((track) => track.kind === "captions")
              .map(({ file, label, kind, default: isDefault }) => ({
                file,
                label,
                kind,
                default: !!isDefault,
              })) || [];

          setSubtitles(subtitles);

          const thumbnailTrack = streamingLink?.tracks?.find(
            (track) => track.kind === "thumbnails" && track.file
          );

          setThumbnail(thumbnailTrack?.file || null);

          if (!streamingLink?.link?.file) {
            setError("Stream URL not found.");
          }
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

// Usage in the component

export const WatchPage = ({ animeId, initialEpisodeId }) => {
  const { streamUrl, error } = useWatch(animeId, initialEpisodeId);

  return (
    <div>
      {error && <p>{error}</p>}
      {streamUrl ? (
        <iframe
          src={streamUrl}
          width="100%"
          height="100%"
          frameBorder="0"
          scrolling="no"
          allowFullScreen
        />
      ) : (
        <p>Loading Fast Server...</p>
      )}
    </div>
  );
};

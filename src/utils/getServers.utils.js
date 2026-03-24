import axios from "axios";

export default async function getServers(animeId, episodeId) {
  try {
    const api_url = import.meta.env.VITE_API_URL;

    const response = await axios.get(
      `${api_url}/servers/${animeId}?ep=${episodeId}`
    );

    const data = response.data;

    // safety check
    if (!data || !data.success) {
      throw new Error("Invalid server response");
    }

    return data.results || [];
  } catch (error) {
    console.error("getServers error:", error);
    return [];
  }
}

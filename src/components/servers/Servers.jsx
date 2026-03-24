import {
  faClosedCaptioning,
  faMicrophone,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import BouncingLoader from "../ui/bouncingloader/Bouncingloader";
import "./Servers.css";
import { useEffect } from "react";

function Servers({
  servers,
  activeEpisodeNum,
  activeServerId,
  setActiveServerId,
  serverLoading,
}) {

  // ✅ NOW servers = { sub: [], dub: [] }
  const subServers = servers?.sub || [];
  const dubServers = servers?.dub || [];

  useEffect(() => {
    if (!servers) return;

    const savedServerName = localStorage.getItem("server_name");
    const savedType = localStorage.getItem("server_type");

    let selectedServer = null;

    // Try saved
    if (savedServerName && savedType) {
      const list = savedType === "dub" ? dubServers : subServers;

      selectedServer = list.find(
        (s) => s.serverName === savedServerName
      );
    }

    // fallback → first sub → first dub
    if (!selectedServer) {
      selectedServer = subServers[0] || dubServers[0];
    }

    if (selectedServer) {
      setActiveServerId(selectedServer.serverId);
    }

  }, [servers]);

  const handleServerSelect = (server, type) => {
    setActiveServerId(server.serverId);
    localStorage.setItem("server_name", server.serverName);
    localStorage.setItem("server_type", type);
  };

  return (
    <div className="relative bg-[#11101A] p-4 w-full min-h-[100px] flex justify-center items-center">

      {serverLoading ? (
        <BouncingLoader />
      ) : servers ? (
        <div className="w-full grid grid-cols-[30%,70%] max-[600px]:flex max-[600px]:flex-col">

          {/* LEFT */}
          <div className="bg-[#ffbade] text-black flex flex-col justify-center items-center p-4">
            <p className="text-center text-[14px]">
              You are watching <br />
              <span className="font-semibold">
                Episode {activeEpisodeNum}
              </span>
            </p>
          </div>

          {/* RIGHT */}
          <div className="bg-[#201F31] flex flex-col">

            {/* SUB */}
            {subServers.length > 0 && (
              <div className="px-2 py-2 flex flex-wrap items-center">
                <FontAwesomeIcon icon={faClosedCaptioning} className="text-[#ffbade] mr-2" />
                <p className="font-bold mr-4">SUB:</p>

                {subServers.map((item, index) => (
                  <div
                    key={index}
                    className={`px-4 py-1 rounded-lg cursor-pointer mr-2 mb-2 ${
                      activeServerId === item.serverId
                        ? "bg-[#ffbade] text-black"
                        : "bg-[#373646] text-white"
                    }`}
                    onClick={() => handleServerSelect(item, "sub")}
                  >
                    {item.serverName}
                  </div>
                ))}
              </div>
            )}

            {/* DUB */}
            {dubServers.length > 0 && (
              <div className="px-2 py-2 flex flex-wrap items-center">
                <FontAwesomeIcon icon={faMicrophone} className="text-[#ffbade] mr-2" />
                <p className="font-bold mr-4">DUB:</p>

                {dubServers.map((item, index) => (
                  <div
                    key={index}
                    className={`px-4 py-1 rounded-lg cursor-pointer mr-2 mb-2 ${
                      activeServerId === item.serverId
                        ? "bg-[#ffbade] text-black"
                        : "bg-[#373646] text-white"
                    }`}
                    onClick={() => handleServerSelect(item, "dub")}
                  >
                    {item.serverName}
                  </div>
                ))}
              </div>
            )}

          </div>
        </div>
      ) : (
        <p className="text-white">No servers found</p>
      )}
    </div>
  );
}

export default Servers;

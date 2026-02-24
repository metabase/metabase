import { useEffect, useState } from "react";
import { vscode } from "./vscode";

export function App() {
  const [configExists, setConfigExists] = useState(false);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const message = event.data;
      switch (message.type) {
        case "init":
          setConfigExists(message.configExists);
          break;
        case "configExistsChanged":
          setConfigExists(message.configExists);
          break;
      }
    }

    window.addEventListener("message", handleMessage);
    vscode.postMessage({ type: "ready" });

    return () => window.removeEventListener("message", handleMessage);
  }, []);

  if (!configExists) {
    return (
      <div className="centered-message">
        <p>Open a folder with Metabase content exported via Remote Sync.</p>
      </div>
    );
  }

  return null;
}

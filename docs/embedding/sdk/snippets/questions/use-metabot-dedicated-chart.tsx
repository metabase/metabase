import React, { useState } from "react";
import {
  MetabaseProvider,
  defineMetabaseAuthConfig,
  useMetabot,
} from "@metabase/embedding-sdk-react";

const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://your-metabase.example.com",
});

function MetabotChat() {
  const metabot = useMetabot();
  const [prompt, setPrompt] = useState("");

  // useMetabot returns null until the SDK bundle has loaded
  // and <MetabaseProvider> has mounted. Always guard before use.
  if (!metabot) {
    return <div>Loading…</div>;
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!prompt.trim()) {
      return;
    }
    metabot.submitMessage(prompt);
    setPrompt("");
  };

  const { CurrentChart } = metabot;

  return (
    <div style={{ display: "flex", gap: 16, height: 600 }}>
      <div style={{ flex: 1 }}>
        {CurrentChart ? (
          <CurrentChart drills height="100%" />
        ) : (
          <div
            style={{ display: "grid", placeItems: "center", height: "100%" }}
          >
            Ask Metabot to generate a chart
          </div>
        )}
      </div>

      <div
        style={{
          width: 380,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {metabot.messages.map((message) => {
            // Chart messages render in the dedicated panel on the left,
            // so you should filter them out in the chat transcript
            // so they don't render twice.
            if (message.role === "agent" && message.type === "chart") {
              return null;
            }
            // Agent text (message.role === "agent") is markdown: links,
            // bold, lists, code, etc. Wrap in a markdown renderer (react-markdown,
            // markdown-to-jsx, etc.). Rendered as plain
            // text here for brevity. User text (message.role === "user") is
            // raw, so no markdown rendering needed.
            return (
              <div
                key={message.id}
                style={{
                  alignSelf:
                    message.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                {message.message}
              </div>
            );
          })}
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8 }}>
          <input
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Ask Metabot…"
            disabled={metabot.isProcessing}
            style={{ flex: 1 }}
          />
          <button type="submit" disabled={metabot.isProcessing}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <MetabaseProvider authConfig={authConfig}>
      <MetabotChat />
    </MetabaseProvider>
  );
}

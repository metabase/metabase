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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {metabot.messages.map((message) => {
          if (message.role === "user") {
            return (
              <div key={message.id} style={{ alignSelf: "flex-end" }}>
                {message.message}
              </div>
            );
          }
          if (message.type === "text") {
            // message.message is markdown: links, bold, lists, code.
            // Wrap in a markdown renderer (react-markdown, markdown-to-jsx,
            // etc.) for production use; rendered as plain text here for brevity.
            return <div key={message.id}>{message.message}</div>;
          }
          // Agent chart message — render its bound Chart inline.
          const { Chart } = message;
          return (
            <div key={message.id} style={{ height: 400 }}>
              <Chart drills height="100%" />
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
  );
}

export default function App() {
  return (
    <MetabaseProvider authConfig={authConfig}>
      <MetabotChat />
    </MetabaseProvider>
  );
}

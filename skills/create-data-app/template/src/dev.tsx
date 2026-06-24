import {
  type MetabaseAuthConfig,
  MetabaseProvider,
} from "@metabase/embedding-sdk-react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { sdkTheme } from "./theme";

const authConfig: MetabaseAuthConfig = {
  metabaseInstanceUrl: import.meta.env.VITE_MB_URL,
  apiKey: import.meta.env.VITE_MB_API_KEY,
};

const root = document.getElementById("root");

if (!root) {
  throw new Error("#root not found");
}

createRoot(root).render(
  <MetabaseProvider authConfig={authConfig} theme={sdkTheme}>
    <App />
  </MetabaseProvider>,
);

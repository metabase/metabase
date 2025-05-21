import { createAction } from "redux-actions";

export const setupEmbeddingSettings = createAction(
  "metabase/setup/SETUP_EMBEDDING_SETTINGS",
  async (settings) => {
    const response = await fetch("/api/setting", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(settings),
    });
    return response.json();
  },
);

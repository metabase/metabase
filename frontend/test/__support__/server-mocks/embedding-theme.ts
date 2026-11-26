import fetchMock from "fetch-mock";

import type { EmbeddingTheme } from "metabase-types/api";

export function setupEmbedThemesEndpoint(themes: EmbeddingTheme[]) {
  fetchMock.get("path:/api/embed-theme", themes);
}

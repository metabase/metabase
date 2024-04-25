import fetchMock from "fetch-mock";

import type { NativeQuerySnippet } from "metabase-types/api";

const PATH = "path:/api/native-query-snippet";

export function setupNativeQuerySnippetEndpoints(
  { snippets = [] }: { snippets?: NativeQuerySnippet[] } = { snippets: [] },
) {
  fetchMock.get(PATH, () => snippets);
  snippets.forEach(snippet =>
    fetchMock.get(`${PATH}/${snippet.id}`, () => snippet),
  );
}

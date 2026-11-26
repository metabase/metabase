import fetchMock from "fetch-mock";

import type { NativeQuerySnippet } from "metabase-types/api";

const PATH = "path:/api/native-query-snippet";

export function setupNativeQuerySnippetEndpoints(
  { snippets = [] }: { snippets?: NativeQuerySnippet[] } = { snippets: [] },
) {
  fetchMock.get(PATH, snippets);
  snippets.forEach((snippet) =>
    fetchMock.get(`${PATH}/${snippet.id}`, snippet),
  );
}

/**
 * Serves one snippet that PUT requests change: later GET requests return the
 * snippet with the PUT body merged in, as the backend does.
 */
export function setupEditableNativeQuerySnippetEndpoints(
  snippet: NativeQuerySnippet,
) {
  let currentSnippet = snippet;
  fetchMock.get(`${PATH}/${snippet.id}`, () => currentSnippet, {
    name: `get-snippet-${snippet.id}`,
  });
  fetchMock.put(
    `${PATH}/${snippet.id}`,
    ({ options }) => {
      const body: unknown = JSON.parse(String(options.body));
      if (typeof body === "object" && body !== null) {
        currentSnippet = { ...currentSnippet, ...body };
      }
      return currentSnippet;
    },
    { name: `update-snippet-${snippet.id}` },
  );
}

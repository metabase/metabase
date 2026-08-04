import fetchMock from "fetch-mock";

import type { NativeQuerySnippet } from "metabase-types/api";
import { createMockNativeQuerySnippet } from "metabase-types/api/mocks";

const PATH = "path:/api/native-query-snippet";

/** Echoes the submitted body back as a snippet, so a test can assert on what the form sent. */
async function echoSubmittedSnippet(url: string) {
  return createMockNativeQuerySnippet(
    await fetchMock.callHistory.lastCall(url)?.request?.json(),
  );
}

export function setupCreateNativeQuerySnippetEndpoint() {
  fetchMock.post(PATH, (call) => echoSubmittedSnippet(call.url));
}

export function setupUpdateNativeQuerySnippetEndpoint(
  snippetId: NativeQuerySnippet["id"],
) {
  fetchMock.put(`${PATH}/${snippetId}`, (call) =>
    echoSubmittedSnippet(call.url),
  );
}

export function setupNativeQuerySnippetEndpoints(
  { snippets = [] }: { snippets?: NativeQuerySnippet[] } = { snippets: [] },
) {
  fetchMock.get(PATH, snippets);
  snippets.forEach((snippet) =>
    fetchMock.get(`${PATH}/${snippet.id}`, snippet),
  );
}

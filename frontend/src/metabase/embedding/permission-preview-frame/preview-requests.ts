/* eslint-disable metabase/no-literal-metabase-strings -- request header name */
import type { OnBeforeRequestHandler } from "metabase/api/client";

const TOKEN_HEADER = "X-Metabase-Preview-Token";
const READ_ONLY_ERROR_CODE = "preview-read-only";

let previewToken: string | null = null;

export function setPreviewToken(token: string) {
  previewToken = token;
}

export const addPreviewTokenHeader: OnBeforeRequestHandler = async () =>
  previewToken ? { headers: { [TOKEN_HEADER]: previewToken } } : undefined;

/**
 * Sends every `fetch` of this document without cookies, so a request only ever
 * runs as the person, and tells `onWriteRefused` about each write the server
 * refuses because a preview is read-only.
 */
export function installPreviewFetch(onWriteRefused: () => void) {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const response = await originalFetch(input, {
      ...init,
      credentials: "omit",
    });

    if (response.status === 403) {
      const body: unknown = await response
        .clone()
        .json()
        .catch(() => null);

      if (isReadOnlyRefusal(body)) {
        onWriteRefused();
      }
    }

    return response;
  };
}

function isReadOnlyRefusal(body: unknown) {
  return (
    typeof body === "object" &&
    body !== null &&
    "error-code" in body &&
    body["error-code"] === READ_ONLY_ERROR_CODE
  );
}

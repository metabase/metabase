import { EMBED_JS_IFRAME_IDENTIFIER_QUERY_PARAMETER_NAME } from "../constants";

export const stripInternalIframeQueryParameters = () => {
  const url = new URL(window.location.href);

  url.searchParams.delete(EMBED_JS_IFRAME_IDENTIFIER_QUERY_PARAMETER_NAME);

  window.history.replaceState(null, "", url);
};

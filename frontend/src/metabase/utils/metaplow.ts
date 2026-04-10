// FIXME: how to get a unique id?
const METAPLOW_WEBSITE_ID = "23eefa30-4c4f-490e-aa4f-084cd23b1561";

// Umami uses an in-memory cache token returned by the server on each response.
// It's echoed back via x-umami-cache on subsequent requests — this is how the
// server associates requests with a session/visit without client-side storage.
let cache: string | undefined;

function getMetaplowUrl(): string {
  // get from settings
  return `https://product-analytics-ingestion.staging.metabase.com/api/send`;
}

const getSanitizedUrl = (url: string) => {
  const urlWithoutSlug = url.replace(/(\/\d+)-[^\/]+$/, (match, path) => path);
  const urlWithoutHost = new URL(urlWithoutSlug, "http://anonymized.limo");
  return urlWithoutHost.href;
};

function getBasePayload(url: string) {
  return {
    website: METAPLOW_WEBSITE_ID,
    url: getSanitizedUrl(url),
    referrer: "",
    screen: `${window.screen.width}x${window.screen.height}`,
    language: navigator.language,
    tag: "metabase-instance",
  };
}

async function send(payload: object): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cache !== undefined) {
    headers["x-umami-cache"] = cache;
  }

  const res = await fetch(getMetaplowUrl(), {
    method: "POST",
    headers,
    body: JSON.stringify({ type: "event", payload }),
  });

  const data = await res.json();
  if (data?.cache) {
    cache = data.cache;
  }
}

export function trackMetaplowEvent(
  name: string,
  data: Record<string, unknown>,
): void {
  send({
    ...getBasePayload(window.location.pathname),
    name,
    data,
  }).catch(() => undefined);
}

export function trackMetaplowPageView(url: string): void {
  send({
    ...getBasePayload(url),
    name: "pageview",
  }).catch(() => undefined);
}

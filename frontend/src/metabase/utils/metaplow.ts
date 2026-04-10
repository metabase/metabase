// FIXME: how to get a unique id?
import Settings from "metabase/utils/settings";

// Umami uses an in-memory cache token returned by the server on each response.
// It's echoed back via x-umami-cache on subsequent requests — this is how the
// server associates requests with a session/visit without client-side storage.
const METAPLOW_WEBSITE_ID = "23eefa30-4c4f-490e-aa4f-084cd23b1561";

// FIXME: need to find out what filtering is happening here
// only metabase host is working
const anonymizedHostname = "metabase.com";
const anonymizedOrigin = `http://${anonymizedHostname}`;

const getSanitizedUrl = (url: string) => {
  const parsed = new URL(url, window.location.origin);
  const pathWithoutSlug = parsed.pathname.replace(
    /(\/\d+)-[^\/]+$/,
    (_, path) => path,
  );
  return anonymizedOrigin + pathWithoutSlug;
};

function getBasePayload(url: string) {
  return {
    website: METAPLOW_WEBSITE_ID,
    url: getSanitizedUrl(url),
    referrer: "",
    title: "",
    hostname: anonymizedHostname,
    screen: `${window.screen.width}x${window.screen.height}`,
    language: navigator.language,
    tag: "metabase-instance",
  };
}

async function send(payload: object): Promise<void> {
  const metaplowUrl = Settings.get("metaplow-url");
  if (!metaplowUrl) {
    return;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  fetch(metaplowUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ type: "event", payload }),
  });
}

export function trackMetaplowEvent(
  name: string,
  data: Record<string, unknown>,
): void {
  send({
    ...getBasePayload(window.location.href),
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

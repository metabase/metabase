import Settings from "metabase/utils/settings";

const METAPLOW_WEBSITE_ID = "23eefa30-4c4f-490e-aa4f-084cd23b1561";
const anonymizedHostname = "anonymous.metabase.com";
const anonymizedOrigin = `http://${anonymizedHostname}`;

type MetaplowPayload = {
  website: string;
  url: string;
  id: string;
  referrer: string;
  title: string;
  hostname: string;
  screen: string;
  language: string;
  tag: string;
  name: string;
  data?: Record<string, unknown>;
};

const getSanitizedUrl = (url: string) => {
  const parsed = new URL(url, window.location.origin);
  const pathWithoutSlug = parsed.pathname.replace(
    /(\/\d+)-[^\/]+$/,
    (_, path) => path,
  );
  return anonymizedOrigin + pathWithoutSlug;
};

function getBasePayload(url: string): Omit<MetaplowPayload, "name" | "data"> {
  return {
    website: METAPLOW_WEBSITE_ID,
    url: getSanitizedUrl(url),
    id: Settings.get("analytics-uuid") ?? "",
    referrer: "",
    title: "",
    hostname: anonymizedHostname,
    screen: `${window.screen.width}x${window.screen.height}`,
    language: navigator.language,
    tag: "metabase-instance",
  };
}

async function send(payload: MetaplowPayload): Promise<unknown> {
  const metaplowUrl = Settings.get("metaplow-url");
  if (!metaplowUrl) {
    return;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  return fetch(metaplowUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ type: "event", payload }),
  });
}

export function trackMetaplowEvent(
  name: MetaplowPayload["name"],
  data: MetaplowPayload["data"] = {},
): void {
  send({
    ...getBasePayload(window.location.href),
    name,
    data,
  }).catch(() => undefined);
}

export function trackMetaplowPageView(url: string): Promise<unknown> {
  return send({
    ...getBasePayload(url),
    name: "pageview",
  }).catch(() => undefined);
}

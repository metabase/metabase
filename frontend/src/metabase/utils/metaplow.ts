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

function getBasePayload({
  url,
  analyticsUuid,
}: {
  url: string;
  analyticsUuid: string;
}): Omit<MetaplowPayload, "name" | "data"> {
  return {
    website: METAPLOW_WEBSITE_ID,
    url: getSanitizedUrl(url),
    id: analyticsUuid,
    referrer: "",
    title: "",
    hostname: anonymizedHostname,
    screen: `${window.screen.width}x${window.screen.height}`,
    language: navigator.language,
    tag: "metabase-instance",
  };
}

async function send({
  payload,
  metaplowUrl,
}: {
  payload: MetaplowPayload;
  metaplowUrl: string | null | undefined;
}): Promise<unknown> {
  if (!metaplowUrl) {
    return;
  }

  return fetch(metaplowUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "event", payload }),
  });
}

interface MetaplowConfig {
  beforeSend: (
    type: string,
    payload: MetaplowPayload,
  ) => MetaplowPayload | void;
}

let _config: MetaplowConfig = {
  beforeSend: (_type, payload) => payload,
};

export function initMetaplow(config: Partial<MetaplowConfig>): void {
  _config = { ..._config, ...config };
}

export function trackMetaplowEvent({
  name,
  data = {},
  metaplowUrl = Settings.get("metaplow-url"),
  analyticsUuid = Settings.get("analytics-uuid") ?? "",
}: {
  name: string;
  data?: Record<string, unknown>;
  metaplowUrl?: string | null;
  analyticsUuid?: string;
}): void {
  const payload = _config.beforeSend("event", {
    ...getBasePayload({ url: window.location.href, analyticsUuid }),
    name,
    data,
  });
  if (payload) {
    send({ payload, metaplowUrl }).catch(() => undefined);
  }
}

export function trackMetaplowPageView({
  url,
  metaplowUrl = Settings.get("metaplow-url"),
  analyticsUuid = Settings.get("analytics-uuid") ?? "",
}: {
  url: string;
  metaplowUrl?: string | null;
  analyticsUuid?: string;
}) {
  const payload = _config.beforeSend("event", {
    ...getBasePayload({ url, analyticsUuid }),
    name: "pageview",
  });
  if (payload) {
    send({ payload, metaplowUrl }).catch(() => undefined);
  }
}

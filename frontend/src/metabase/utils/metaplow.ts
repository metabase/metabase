import { init, track } from "@metabase/track";

import Settings from "metabase/utils/settings";

const METAPLOW_WEBSITE_ID = "23eefa30-4c4f-490e-aa4f-084cd23b1561";
const anonymizedHostname = "anonymous.metabase.com";
const anonymizedOrigin = `http://${anonymizedHostname}`;

const getSanitizedUrl = (url: string) => {
  const parsed = new URL(url, window.location.origin);
  const pathWithoutSlug = parsed.pathname.replace(
    /(\/\d+)-[^\/]+$/,
    (_, path) => path,
  );
  return anonymizedOrigin + pathWithoutSlug;
};

interface MetaplowConfig {
  getUserId: () => string;
}

export function initMetaplow(config: MetaplowConfig): void {
  const metaplowUrl = Settings.get("metaplow-url");
  if (!metaplowUrl) {
    return;
  }

  init({
    website: METAPLOW_WEBSITE_ID,
    hostUrl: metaplowUrl,
    tag: "metabase-instance",
    beforeSend: (_type, payload) => {
      return {
        ...payload,
        url:
          "url" in payload && typeof payload.url === "string"
            ? getSanitizedUrl(payload.url)
            : "",
        id: Settings.get("analytics-uuid") ?? "",
        hostname: anonymizedHostname,
        user_id: config.getUserId(),
      };
    },
  });
}

export function trackMetaplowEvent(
  name: string,
  data: Record<string, unknown> = {},
): void {
  track(name, data);
}

export function trackMetaplowPageView() {
  track("pageview");
}

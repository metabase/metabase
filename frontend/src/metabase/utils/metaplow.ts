import { init, track } from "@metabase/track";
import { isObject } from "underscore";

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
  getUserId: () => number | undefined;
}

export function initMetaplow(config: MetaplowConfig): void {
  const metaplowUrl = Settings.get("metaplow-url");
  if (!metaplowUrl) {
    return;
  }
  const hostUrl = metaplowUrl.replace(/\/send$/, "");

  init({
    website: METAPLOW_WEBSITE_ID,
    hostUrl,
    tag: "metabase-instance",
    beforeSend: (type, originalPayload) => {
      let payload = originalPayload as Record<string, unknown>;

      // Replace default pageview behavior with our own custom pageview tracking
      const isAutoPageView = type === "event" && !payload.name;
      if (isAutoPageView) {
        return;
      }
      if (payload.name === "pageview" && isObject(payload.data)) {
        payload = { ...payload, url: payload.data.url };
        delete (payload.data as Record<string, unknown>).url;
      }

      return {
        ...payload,
        url:
          "url" in payload && typeof payload.url === "string"
            ? getSanitizedUrl(payload.url)
            : "",
        id: Settings.get("analytics-uuid") ?? "",
        referrer: "",
        title: "",
        hostname: anonymizedHostname,
        data: {
          ...(payload.data as Record<string, unknown> | undefined),
          user_id: config.getUserId(),
        },
      };
    },
  });
}

export function trackMetaplowEvent(
  name: string,
  data: Record<string, unknown> = {},
) {
  return track(name, data);
}

export function trackMetaplowPageView(url: string) {
  return track("pageview", { url });
}

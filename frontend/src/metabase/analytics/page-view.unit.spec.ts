import * as Snowplow from "@snowplow/browser-tracker";
import fetchMock from "fetch-mock";

import Settings from "metabase/utils/settings";

import { setSnowplowPageUrl } from "./page-view";
import { createSnowplowTracker } from "./snowplow";

const EVENT = {
  event: {
    schema: "iglu:com.metabase/simple_event/jsonschema/1-0-0",
    data: {},
  },
};

const PAGE_URL = "http://snowplow.example.com/embed/embedded-apps";

type SentUrls = { url: unknown; refr: unknown };

interface SetupOpts {
  referrer?: string;
}

const setup = ({ referrer = "" }: SetupOpts = {}) => {
  Settings.set("snowplow-enabled", true);
  Settings.set("snowplow-url", "http://snowplow.example.com");
  fetchMock.post(
    "http://snowplow.example.com/com.snowplowanalytics.snowplow/tp2",
    200,
  );
  jest.spyOn(document, "referrer", "get").mockReturnValue(referrer);
  window.history.replaceState(
    null,
    "",
    "/embed/embedded-apps/acme-store/orders?customer=acme",
  );

  createSnowplowTracker(() => undefined);

  const sent: SentUrls[] = [];
  Snowplow.addPlugin(
    {
      plugin: {
        afterTrack: (payload) => {
          sent.push({ url: payload.url, refr: payload.refr });
        },
      },
    },
    ["sp"],
  );

  return { sent };
};

const trackBeforeAndAfterNavigation = () => {
  Snowplow.trackSelfDescribingEvent(EVENT, ["sp"]);
  window.history.pushState(
    null,
    "",
    "/embed/embedded-apps/acme-store/customers/42?email=bob",
  );
  Snowplow.trackSelfDescribingEvent(EVENT, ["sp"]);
};

describe("setSnowplowPageUrl", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("keeps an embedded data app's name, route and query out of later events", () => {
    const { sent } = setup();

    setSnowplowPageUrl(window.location.pathname);
    trackBeforeAndAfterNavigation();

    expect(sent).toEqual([
      { url: PAGE_URL, refr: "#" },
      { url: PAGE_URL, refr: "#" },
    ]);
  });

  it("keeps only the origin of the page that loaded the document as the referrer", () => {
    const { sent } = setup({
      referrer: "https://customer.example.com/reports/sales?account=7",
    });

    setSnowplowPageUrl(window.location.pathname, { keepReferrerOrigin: true });
    trackBeforeAndAfterNavigation();

    expect(sent).toEqual([
      { url: PAGE_URL, refr: "https://customer.example.com" },
      { url: PAGE_URL, refr: "https://customer.example.com" },
    ]);
  });

  it("reports no referrer when the document has none", () => {
    const { sent } = setup({ referrer: "" });

    setSnowplowPageUrl(window.location.pathname, { keepReferrerOrigin: true });
    trackBeforeAndAfterNavigation();

    expect(sent).toEqual([
      { url: PAGE_URL, refr: "#" },
      { url: PAGE_URL, refr: "#" },
    ]);
  });
});

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

type SentUrls = { url: unknown; refr: unknown };

const setup = () => {
  Settings.set("snowplow-enabled", true);
  Settings.set("snowplow-url", "http://snowplow.example.com");
  fetchMock.post(
    "http://snowplow.example.com/com.snowplowanalytics.snowplow/tp2",
    200,
  );
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

describe("setSnowplowPageUrl", () => {
  it("keeps an embedded data app's name, route and query out of later events", () => {
    const { sent } = setup();

    setSnowplowPageUrl(window.location.pathname);
    Snowplow.trackSelfDescribingEvent(EVENT, ["sp"]);

    window.history.pushState(
      null,
      "",
      "/embed/embedded-apps/acme-store/customers/42?email=bob",
    );
    Snowplow.trackSelfDescribingEvent(EVENT, ["sp"]);

    expect(sent).toEqual([
      { url: "http://snowplow.example.com/embed/embedded-apps", refr: "#" },
      { url: "http://snowplow.example.com/embed/embedded-apps", refr: "#" },
    ]);
  });
});

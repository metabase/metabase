import { updateSetting } from "e2e/support/helpers";

import { isDeepMatch } from "./e2e-deep-match";

// Re-exported so `H.isDeepMatch` keeps resolving; it lives in its own module because the Metabase
// Track helpers match recorded events the same way.
export { isDeepMatch };

const SNOWPLOW_URL = "http://localhost:9090";
const SNOWPLOW_INTERVAL = 100;
// Snowplow events are POSTed asynchronously and then ingested by snowplow-micro, so a
// matching event can take a moment to become queryable via `micro/good` — especially on
// loaded CI runners or with network throttling. A short budget flakes the poll before the
// event lands; this only affects how long a *failing* assertion waits (matches return early).
const SNOWPLOW_TIMEOUT = 5000;

export const enableTracking = () => {
  updateSetting("anon-tracking-enabled", true);
};

export const resetSnowplow = () => {
  sendSnowplowRequest("micro/reset");
};

export const blockSnowplow = () => {
  blockSnowplowRequest("*/tp2");
};

export const assertNoUnstructuredSnowplowEvent = (eventData) => {
  return expectUnstructuredSnowplowEvent(eventData, 0);
};

export const expectSnowplowEvent = (match, count = 1) => {
  retrySnowplowRequest("micro/good", ({ body }) => {
    const lastFoundEventCount = body.filter((e) =>
      isDeepMatch(e, match),
    ).length;
    return lastFoundEventCount === count;
  }).should("be.ok");
};

/**
 * Check for the existence of specific snowplow events.
 *
 * @param {Object|function} eventData - object of key / value pairs you expect to see in the event or a function that will be passed in the real event for you to do your own comparison with
 * @param {number} count - number of matching events you expect to find. defaults to 1
 */
export const expectUnstructuredSnowplowEvent = (eventData, count = 1) => {
  expectSnowplowEvent(
    {
      event: {
        unstruct_event: {
          data: {
            data: eventData,
          },
        },
      },
    },
    count,
  );
};

export const expectNoBadSnowplowEvents = () => {
  sendSnowplowRequest("micro/bad").its("body").should("deep.equal", []);
};

const sendSnowplowRequest = (url) => {
  cy.log("Send a Snowplow micro request");
  return cy.request({
    url: `${SNOWPLOW_URL}/${url}`,
    json: true,
  });
};

const retrySnowplowRequest = (
  url,
  condition,
  messageOrMessageFn = null,
  timeout = SNOWPLOW_TIMEOUT,
) => {
  return sendSnowplowRequest(url).then((response) => {
    if (condition(response)) {
      return cy.wrap(response);
    } else if (timeout > 0) {
      cy.wait(SNOWPLOW_INTERVAL);
      return retrySnowplowRequest(
        url,
        condition,
        messageOrMessageFn,
        timeout - SNOWPLOW_INTERVAL,
      );
    } else {
      let message =
        typeof messageOrMessageFn === "function"
          ? messageOrMessageFn(response)
          : messageOrMessageFn;

      if (!message) {
        message =
          "Response body (trimmed): " +
          JSON.stringify(response.body)?.slice(0, 512);
      }

      throw new Error("Snowplow retry timeout: " + message);
    }
  });
};

const blockSnowplowRequest = (url) => {
  return cy.intercept("POST", `${SNOWPLOW_URL}/${url}`, (req) => req.destroy());
};

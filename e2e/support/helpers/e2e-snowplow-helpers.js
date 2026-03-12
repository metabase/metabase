import { updateSetting } from "e2e/support/helpers";

const SNOWPLOW_URL = "http://localhost:9090";
const SNOWPLOW_INTERVAL = 100;
const SNOWPLOW_TIMEOUT = 1000;

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

export function isDeepMatch(objectOrValue, partialObjectOrValue) {
  if (isMatcher(partialObjectOrValue)) {
    return partialObjectOrValue(objectOrValue);
  }

  const bothAreNotObjects =
    // Check null because typeof null === "object"
    objectOrValue == null ||
    partialObjectOrValue == null ||
    typeof objectOrValue !== "object" ||
    typeof partialObjectOrValue !== "object";

  // Exit condition when calling recursively
  if (bothAreNotObjects) {
    return objectOrValue === partialObjectOrValue;
  }

  for (const [key, value] of Object.entries(partialObjectOrValue)) {
    if (Array.isArray(value)) {
      if (
        !Array.isArray(objectOrValue[key]) ||
        !isArrayDeepMatch(objectOrValue[key], value)
      ) {
        return false;
      }
    } else if (!isDeepMatch(objectOrValue[key], value)) {
      return false;
    }
  }

  return true;
}

function isMatcher(value) {
  return typeof value === "function";
}

function isArrayDeepMatch(array, partialArray) {
  for (const index in partialArray) {
    if (!isDeepMatch(array[index], partialArray[index])) {
      return false;
    }
  }

  return true;
}

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

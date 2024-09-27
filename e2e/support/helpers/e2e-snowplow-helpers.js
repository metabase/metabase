import { isEE, putSetting } from "e2e/support/helpers";

const HAS_SNOWPLOW = Cypress.env("HAS_SNOWPLOW_MICRO");
const SNOWPLOW_URL = Cypress.env("SNOWPLOW_MICRO_URL");
const SNOWPLOW_INTERVAL = 100;
const SNOWPLOW_TIMEOUT = 1000;

export const describeWithSnowplow = HAS_SNOWPLOW ? describe : describe.skip;
export const describeWithSnowplowEE =
  HAS_SNOWPLOW && isEE ? describe : describe.skip;

export const enableTracking = () => {
  putSetting("anon-tracking-enabled", true);
};

export const resetSnowplow = () => {
  sendSnowplowRequest("micro/reset");
};

export const blockSnowplow = () => {
  blockSnowplowRequest("*/tp2");
};

/**
 * Check for the existence of specific snowplow events.
 *
 * @param {object} eventData - object of key / value pairs you expect to see in the event
 * @param {number} count - number of matching events you expect to find. defaults to 1
 */
export const expectGoodSnowplowEvent = (eventData, count = 1) => {
  let lastReceivedEvent = null;
  retrySnowplowRequest(
    "micro/good",
    ({ body }) => {
      lastReceivedEvent = body?.[0].event?.unstruct_event?.data?.data;

      return (
        body.filter(snowplowEvent =>
          isDeepMatch(
            snowplowEvent?.event?.unstruct_event?.data?.data,
            eventData,
          ),
        ).length === count
      );
    },
    () =>
      `Expected ${count} good Snowplow events with data: ${JSON.stringify(
        eventData,
        null,
        2,
      )}\n Last event found was ${JSON.stringify(lastReceivedEvent, null, 2)}`,
  ).should("be.ok");
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

export const expectGoodSnowplowEvents = count => {
  retrySnowplowRequest("micro/good", ({ body }) => body.length >= count)
    .its("body")
    .should("have.length", count);
};

export const expectNoBadSnowplowEvents = () => {
  sendSnowplowRequest("micro/bad").its("body").should("deep.equal", []);
};

const sendSnowplowRequest = url => {
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
  return sendSnowplowRequest(url).then(response => {
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
      const message =
        typeof messageOrMessageFn === "function"
          ? messageOrMessageFn()
          : messageOrMessageFn;
      throw new Error("Snowplow retry timeout " + message);
    }
  });
};

const blockSnowplowRequest = url => {
  return cy.intercept("POST", `${SNOWPLOW_URL}/${url}`, req => req.destroy());
};

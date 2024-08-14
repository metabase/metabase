import { isEE } from "e2e/support/helpers";

const HAS_SNOWPLOW = Cypress.env("HAS_SNOWPLOW_MICRO");
const SNOWPLOW_URL = Cypress.env("SNOWPLOW_MICRO_URL");
const SNOWPLOW_INTERVAL = 100;
const SNOWPLOW_TIMEOUT = 1000;

export const describeWithSnowplow = HAS_SNOWPLOW ? describe : describe.skip;
export const describeWithSnowplowEE =
  HAS_SNOWPLOW && isEE ? describe : describe.skip;

export const enableTracking = () => {
  cy.request("PUT", "/api/setting/anon-tracking-enabled", { value: true });
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
  retrySnowplowRequest(
    "micro/good",
    ({ body }) =>
      body.filter(snowplowEvent =>
        isDeepMatch(
          snowplowEvent?.event?.unstruct_event?.data?.data,
          eventData,
        ),
      ).length === count,
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

const retrySnowplowRequest = (url, condition, timeout = SNOWPLOW_TIMEOUT) => {
  return sendSnowplowRequest(url).then(response => {
    if (condition(response)) {
      return cy.wrap(response);
    } else if (timeout > 0) {
      cy.wait(SNOWPLOW_INTERVAL);
      return retrySnowplowRequest(url, condition, timeout - SNOWPLOW_INTERVAL);
    } else {
      throw new Error("Snowplow retry timeout");
    }
  });
};

const blockSnowplowRequest = url => {
  return cy.intercept("POST", `${SNOWPLOW_URL}/${url}`, req => req.destroy());
};

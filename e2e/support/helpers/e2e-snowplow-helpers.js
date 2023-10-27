import _ from "underscore";

const HAS_SNOWPLOW = Cypress.env("HAS_SNOWPLOW_MICRO");
const SNOWPLOW_URL = Cypress.env("SNOWPLOW_MICRO_URL");
const SNOWPLOW_INTERVAL = 100;
const SNOWPLOW_TIMEOUT = 1000;

export const describeWithSnowplow = HAS_SNOWPLOW ? describe : describe.skip;

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
        _.isMatch(snowplowEvent?.event?.unstruct_event?.data?.data, eventData),
      ).length === count,
  ).should("be.ok");
};

export const expectGoodSnowplowEvents = count => {
  retrySnowplowRequest("micro/good", ({ body }) => {
    console.log("expectGoodSnowplowEvents: ", body);
    console.log(
      "eventlist: ",
      body
        .map(elem => elem.event?.unstruct_event?.data?.data)
        .filter(k => !!k)
        .reduce((acc, cur) => {
          acc.push(cur);
          return acc;
        }, []),
    );
    return body.length >= count;
  })
    .its("body")
    .should("have.length", count);
};

export const expectGoodSnowplowEventCount = expectedEventCounts => {
  const totalCount = Object.values(expectedEventCounts).reduce(
    (a, b) => a + b,
    0,
  );

  retrySnowplowRequest("micro/good", ({ body }) => {
    return body.length >= totalCount;
  })
    .then(({ body }) => {
      const pageViewCount = body.filter(
        event => event.eventType === "page_view",
      ).length;

      const events = body
        .filter(event => event.eventType === "unstruct")
        .map(event => event.event?.unstruct_event?.data?.data)
        .reduce((acc, cur) => {
          console.log(cur);
          if (cur.event in acc) {
            acc[cur.event] += 1;
          } else {
            acc[cur.event] = 1;
          }
          return acc;
        }, {});

      return {
        page_view: pageViewCount,
        ...events,
      };
    })
    .should("deep.include", expectedEventCounts);
};

export const expectNoBadSnowplowEvents = () => {
  sendSnowplowRequest("micro/bad").its("body").should("have.length", 0);
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

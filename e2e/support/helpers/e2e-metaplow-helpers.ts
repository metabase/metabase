import { isDeepMatch } from "./e2e-deep-match";

/**
 * Helpers for asserting against the Metabase Track recording sink (`metaplow/sink.js`), which stands
 * in for the collector in e2e runs. The shape mirrors the Snowplow micro helpers next door: reset
 * before the thing you are testing, then assert the event arrived.
 *
 * Both legs land here. The browser tracker posts to the collector URL from the page and the backend
 * sender posts to it from the JVM; `-Dmb.metaplow.url` in the `:e2e` alias points both at the sink.
 */

/** Key / value pairs to find in the recorded event. A function value is handed the real value. */
type DeepMatch = Record<string, unknown>;

const METAPLOW_SINK_URL = "http://localhost:9091";
const METAPLOW_INTERVAL = 250;
/** Longer than Snowplow micro's second: the backend hands events to a worker pool before they go out. */
const METAPLOW_TIMEOUT = 5000;

/** One post the sink received, as `GET /sink/events` returns it. */
export interface MetaplowSinkEvent {
  receivedAt: string;
  path: string;
  /** The posted JSON, or null when the body was not JSON — in which case `raw` holds the text. */
  body: {
    type?: string;
    payload?: Record<string, unknown>;
  } | null;
  raw?: string;
}

export const resetMetaplow = () => {
  sendMetaplowRequest<{ reset: true }>("sink/reset");
};

/**
 * Assert that the sink received `count` posts deep-matching `match`.
 *
 * Matches the whole recorded entry — `{ receivedAt, path, body }` — so a spec can pin the path the
 * event was posted to as well as its contents. Most specs want `expectMetaplowEvent` instead.
 */
export const expectMetaplowRequest = (match: DeepMatch, count = 1) => {
  retryForEvents(
    (events) => events.filter((e) => isDeepMatch(e, match)).length === count,
  ).should("be.ok");
};

/**
 * Assert that the sink received `count` events whose tracker payload matches `payload`.
 *
 * The payload is the `{ website, id, hostname, tag, name, data }` map that both the browser tracker
 * and the backend sender wrap an event in. Event names differ by leg: the backend sends a
 * schema-qualified name (`dashboard.dashboard_created`) and the browser a bare one (`pageview`).
 */
export const expectMetaplowEvent = (payload: DeepMatch, count = 1) => {
  expectMetaplowRequest({ body: { type: "event", payload } }, count);
};

const sendMetaplowRequest = <T>(url: string) => {
  cy.log("Send a Metabase Track sink request");
  return cy.request<T>({ url: `${METAPLOW_SINK_URL}/${url}`, json: true });
};

type EventsResponse = Cypress.Chainable<Cypress.Response<MetaplowSinkEvent[]>>;

const retryForEvents = (
  condition: (events: MetaplowSinkEvent[]) => boolean,
  timeout = METAPLOW_TIMEOUT,
): EventsResponse => {
  return sendMetaplowRequest<MetaplowSinkEvent[]>("sink/events").then(
    (response) => {
      if (condition(response.body)) {
        return cy.wrap(response);
      }
      if (timeout <= 0) {
        const names = response.body.map((e) => e?.body?.payload?.name);
        throw new Error(
          `Metabase Track sink retry timeout. Events recorded: ${JSON.stringify(names).slice(0, 512)}`,
        );
      }
      // Polling the sink, the way the Snowplow micro helpers next door poll micro.
      cy.wait(METAPLOW_INTERVAL);
      return retryForEvents(condition, timeout - METAPLOW_INTERVAL);
    },
  );
};

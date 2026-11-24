import { isDeepMatch } from "./e2e-deep-match";

type DeepMatch = Record<string, unknown>;

const METAPLOW_SINK_URL = "http://localhost:9091";
const METAPLOW_INTERVAL = 250;
const METAPLOW_TIMEOUT = 5000;

export interface MetaplowSinkEvent {
  receivedAt: string;
  path: string;
  body: {
    type?: string;
    payload?: Record<string, unknown>;
  } | null;
  raw?: string;
}

export const resetMetaplow = () => {
  sendMetaplowRequest<{ reset: true }>("sink/reset");
};

export const expectMetaplowRequest = (match: DeepMatch, count = 1) => {
  retryForEvents(
    (events) => events.filter((e) => isDeepMatch(e, match)).length === count,
  ).should("be.ok");
};

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
      cy.wait(METAPLOW_INTERVAL);
      return retryForEvents(condition, timeout - METAPLOW_INTERVAL);
    },
  );
};

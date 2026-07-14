import {
  CollectionBrowser,
  CreateQuestion,
  InteractiveQuestion,
} from "@metabase/embedding-sdk-react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createQuestion, updateSetting } from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import {
  mountSdkContent,
  mountStaticQuestion,
} from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const SIMPLE_EVENT_SCHEMA = "iglu:com.metabase/simple_event/jsonschema/1-0-0";

// The SDK tracker posts to /api/analytics-proxy with encodeBase64:false, so the
// Snowplow POST body is plain JSON: { data: [ { ue_pr: "<json>", ... } ] }.
// Each ue_pr is a self-describing unstruct_event whose inner `data` is the
// simple_event payload { event, event_detail }. Pull those out.
type SdkEventData = {
  event: "embedding_sdk_initialized" | "embedding_sdk_component_rendered";
  event_detail?: string; // JSON string — contains component, properties, global
};

const sdkEventsFromProxyBody = (body: unknown): SdkEventData[] => {
  const rows =
    // Unjustified type cast. FIXME
    body && Array.isArray((body as { data?: unknown[] }).data)
      ? // Unjustified type cast. FIXME
        (body as { data: Array<{ ue_pr?: string }> }).data
      : [];

  return (
    rows
      .map((row) => {
        try {
          return JSON.parse(row.ue_pr ?? "");
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .map((unstruct) => unstruct.data) // unstruct_event -> { schema, data }
      .filter(
        (selfDescribing) => selfDescribing?.schema === SIMPLE_EVENT_SCHEMA,
      )
      // Unjustified type cast. FIXME
      .map((selfDescribing) => selfDescribing.data as SdkEventData)
  );
};

const parseEventDetail = (event: SdkEventData) => {
  try {
    return JSON.parse(event.event_detail ?? "{}");
  } catch {
    return {};
  }
};

const findEventByComponent = (events: SdkEventData[], component: string) =>
  events.find((event) => parseEventDetail(event).component === component);

describe("scenarios > embedding-sdk > analytics — per-mount component events", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    createQuestion({
      name: "Analytics events test question",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["max", ["field", ORDERS.QUANTITY, null]]],
        breakout: [["field", ORDERS.PRODUCT_ID, null]],
        limit: 2,
      },
    }).then(({ body: question }) => {
      cy.wrap(question.id).as("questionId");
    });
  });

  // Capture every POST to the proxy into a closure array so we can assert across
  // the several immediate (bufferSize: 1) posts a single mount produces.
  const interceptAnalyticsProxy = () => {
    const capturedEvents: SdkEventData[] = [];
    cy.intercept("POST", "/api/analytics-proxy", (request) => {
      capturedEvents.push(...sdkEventsFromProxyBody(request.body));
      request.continue();
    }).as("analyticsProxy");
    return capturedEvents;
  };

  it("fires a per-mount component event and a global init beacon through the proxy", () => {
    updateSetting("anon-tracking-enabled", true);
    cy.signOut();
    mockAuthProviderAndJwtSignIn();

    const capturedEvents = interceptAnalyticsProxy();

    mountStaticQuestion();

    // Ensures settings are loaded before the proxy wait (settings-load race guard).
    getSdkRoot().within(() => {
      cy.findByText("Product ID").should("be.visible");
    });

    // Beacon and component event are serialized by Snowplow's executingQueue:
    // event 2 is only sent after event 1's XHR response arrives, so they come
    // in two separate requests. Wait for both before asserting.
    cy.wait(["@analyticsProxy", "@analyticsProxy"]);

    cy.wrap(capturedEvents).should((events: SdkEventData[]) => {
      const componentEvent = findEventByComponent(events, "StaticQuestion");
      expect(componentEvent, "StaticQuestion mount event").to.exist;
      const detail = parseEventDetail(componentEvent!);
      expect(detail.global.auth_method, "auth_method in event_detail").to.eq(
        "sso",
      );
      expect(detail.global.sdk_version, "sdk_version in event_detail").to.be.a(
        "string",
      );
    });

    cy.wrap(capturedEvents).should((events: SdkEventData[]) => {
      const beacon = events.find(
        (event) => event.event === "embedding_sdk_initialized",
      );
      expect(beacon, "global init beacon").to.exist;
    });
  });

  it("CreateQuestion delegates to InteractiveQuestion — fires id_new event, not CreateQuestion", () => {
    updateSetting("anon-tracking-enabled", true);
    cy.signOut();
    mockAuthProviderAndJwtSignIn();

    const capturedEvents = interceptAnalyticsProxy();

    mountSdkContent(<CreateQuestion />);

    // The beacon fires only once per JS context (module-level singleton); it
    // already fired in the first test, so only the component event is captured here.
    cy.wait("@analyticsProxy");

    cy.wrap(capturedEvents).should((events: SdkEventData[]) => {
      const interactiveQuestionEvent = findEventByComponent(
        events,
        "InteractiveQuestion",
      );
      expect(interactiveQuestionEvent, "InteractiveQuestion mount event").to
        .exist;
      const detail = parseEventDetail(interactiveQuestionEvent!);
      expect(detail.properties.id_new, "id_new in event_detail").to.eq("true");
    });

    cy.wrap(capturedEvents).should((events: SdkEventData[]) => {
      const createQuestionEvent = findEventByComponent(
        events,
        "CreateQuestion",
      );
      expect(createQuestionEvent, "no CreateQuestion event").to.be.undefined;
    });
  });

  it("fires one component event per mounted component", () => {
    updateSetting("anon-tracking-enabled", true);
    cy.signOut();
    mockAuthProviderAndJwtSignIn();

    const capturedEvents = interceptAnalyticsProxy();

    cy.get<number>("@questionId").then((questionId) => {
      mountSdkContent(
        <>
          <InteractiveQuestion questionId={questionId} />
          <CollectionBrowser />
        </>,
      );
    });

    // Wait for the question to fully render before asserting analytics (same
    // settings-load race guard as test 1).
    getSdkRoot().within(() => {
      cy.findByText("Product ID").should("be.visible");
    });

    // beacon already fired in test 1 (once per JS context);
    // InteractiveQuestion + CollectionBrowser = 2 component events
    cy.wait(["@analyticsProxy", "@analyticsProxy"]);

    cy.wrap(capturedEvents).should((events: SdkEventData[]) => {
      const interactiveQuestionEvent = findEventByComponent(
        events,
        "InteractiveQuestion",
      );
      expect(interactiveQuestionEvent, "InteractiveQuestion mount event").to
        .exist;

      const collectionBrowserEvent = findEventByComponent(
        events,
        "CollectionBrowser",
      );
      expect(collectionBrowserEvent, "CollectionBrowser mount event").to.exist;
    });
  });

  it("does not fire events when anon-tracking is disabled (opt-out gate)", () => {
    updateSetting("anon-tracking-enabled", false);
    cy.signOut();
    mockAuthProviderAndJwtSignIn();

    const capturedEvents = interceptAnalyticsProxy();

    mountStaticQuestion();

    // Let the question fully render so any (incorrect) tracking would have fired.
    getSdkRoot().within(() => {
      cy.findByText("Product ID").should("be.visible");
    });

    cy.wrap(capturedEvents).should("have.length", 0);
  });
});

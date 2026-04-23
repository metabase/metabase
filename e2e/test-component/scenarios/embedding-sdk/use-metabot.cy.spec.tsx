const { H } = cy;

import { MetabaseProvider, useMetabot } from "@metabase/embedding-sdk-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import {
  DEFAULT_SDK_AUTH_PROVIDER_CONFIG,
  mountSdk,
  mountSdkContent,
} from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const buildAdHocPath = (query: Record<string, unknown>) =>
  `/question#${btoa(
    JSON.stringify({
      dataset_query: { database: 1, type: "query", query },
      display: "table",
      displayIsLocked: true,
      visualization_settings: {},
    }),
  )}`;

const adHocQuestionPathOrders = buildAdHocPath({
  "source-table": ORDERS_ID,
  aggregation: [["max", ["field", ORDERS.QUANTITY, null]]],
  breakout: [["field", ORDERS.PRODUCT_ID, null]],
  limit: 2,
});

const adHocQuestionPathProducts = buildAdHocPath({
  "source-table": PRODUCTS_ID,
  aggregation: [["count"]],
  breakout: [["field", PRODUCTS.CATEGORY, null]],
  limit: 2,
});

const buildNavigateToResponse = (path: string) =>
  `0:"Here is the [question link](${path})"
2:{"type":"navigate_to","version":1,"value":"${path}"}`;

const MetabotConsumer = () => {
  const metabot = useMetabot();

  if (!metabot) {
    return <div data-testid="metabot-loading">loading</div>;
  }

  return (
    <div data-testid="metabot-consumer">
      <button
        data-testid="metabot-send"
        type="button"
        onClick={() => {
          void metabot.submitMessage("Show me orders");
        }}
      >
        Send
      </button>

      <ul data-testid="metabot-messages">
        {metabot.messages.map((message) => (
          <li key={message.id} data-testid={`metabot-message-${message.role}`}>
            {message.type === "text" ? message.message : "chart"}
          </li>
        ))}
      </ul>

      <div data-testid="metabot-current-chart-kind">
        {metabot.CurrentChart ? "function" : "null"}
      </div>

      {metabot.CurrentChart && (
        <div data-testid="metabot-current-chart">
          <metabot.CurrentChart />
        </div>
      )}
    </div>
  );
};

/**
 * Tracks how many times `metabot.CurrentChart` changes identity. Used to
 * verify §3b wrap cache keeps the same component reference across unrelated
 * parent re-renders.
 */
const IdentityTrackingConsumer = () => {
  const metabot = useMetabot();
  const previousChartRef = useRef<unknown>(null);
  const [identityChanges, setIdentityChanges] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const current = metabot?.CurrentChart ?? null;
    if (
      current &&
      previousChartRef.current &&
      previousChartRef.current !== current
    ) {
      setIdentityChanges((count) => count + 1);
    }
    previousChartRef.current = current;
  }, [metabot?.CurrentChart]);

  if (!metabot) {
    return <div data-testid="metabot-loading">loading</div>;
  }

  return (
    <div data-testid="metabot-consumer">
      <button
        data-testid="metabot-send"
        type="button"
        onClick={() => {
          void metabot.submitMessage("Show me orders");
        }}
      >
        Send
      </button>
      <button
        data-testid="metabot-tick"
        type="button"
        onClick={() => setTick((value) => value + 1)}
      >
        Tick
      </button>
      <div data-testid="metabot-tick-value">{tick}</div>
      <div data-testid="metabot-identity-changes">{identityChanges}</div>
      {metabot.CurrentChart && (
        <div data-testid="metabot-current-chart">
          <metabot.CurrentChart />
        </div>
      )}
    </div>
  );
};

describe("scenarios > embedding-sdk > use-metabot hook", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();
    H.updateSetting("llm-anthropic-api-key", "sk-ant-test-key");

    cy.signOut();
    mockAuthProviderAndJwtSignIn();
  });

  it("exposes Metabot under a bare MetabaseProvider and renders CurrentChart after navigate_to", () => {
    H.mockMetabotResponse({
      statusCode: 200,
      body: buildNavigateToResponse(adHocQuestionPathOrders),
    });

    mountSdkContent(<MetabotConsumer />);

    getSdkRoot().within(() => {
      cy.findByTestId("metabot-consumer").should("exist");
      cy.findByTestId("metabot-current-chart-kind").should("have.text", "null");
      cy.findByTestId("metabot-send").click();
    });

    cy.wait("@metabotAgent", { timeout: 20_000 });

    getSdkRoot().within(() => {
      cy.findAllByTestId("metabot-message-agent").should(
        "have.length.at.least",
        1,
      );
      cy.findByTestId("metabot-current-chart-kind").should(
        "have.text",
        "function",
      );
      cy.findByTestId("metabot-current-chart").should("exist");
      cy.findByTestId("visualization-root").should("exist");
    });
  });

  it("returns null from useMetabot() before MetabaseProvider mounts its subscriber", () => {
    H.mockMetabotResponse({
      statusCode: 200,
      body: buildNavigateToResponse(adHocQuestionPathOrders),
    });

    // Gate the provider behind a delayed state flip. While `ready` is false,
    // the consumer renders without a MetabaseProvider above it, so the
    // metabot-state-channel stays null and `useMetabot()` returns null.
    const GatedProvider = ({ children }: { children: ReactNode }) => {
      const [ready, setReady] = useState(false);
      useEffect(() => {
        const id = setTimeout(() => setReady(true), 800);
        return () => clearTimeout(id);
      }, []);
      if (!ready) {
        return <>{children}</>;
      }
      return (
        <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
          {children}
        </MetabaseProvider>
      );
    };

    mountSdk(
      <GatedProvider>
        <MetabotConsumer />
      </GatedProvider>,
    );

    getSdkRoot().within(() => {
      cy.findByTestId("metabot-loading").should("exist");
      cy.findByTestId("metabot-consumer").should("not.exist");
    });

    getSdkRoot().within(() => {
      cy.findByTestId("metabot-consumer", { timeout: 20_000 }).should("exist");
      cy.findByTestId("metabot-loading").should("not.exist");
    });
  });

  it("returns null from useMetabot() when rendered outside any MetabaseProvider", () => {
    mountSdk(<MetabotConsumer />);

    getSdkRoot().within(() => {
      cy.findByTestId("metabot-loading").should("exist");
    });

    // Give the subscriber channel a chance to publish if it were going to.
    // With no provider, nothing mounts the subscriber, so the hook stays null.
    cy.wait(2000);

    getSdkRoot().within(() => {
      cy.findByTestId("metabot-loading").should("exist");
      cy.findByTestId("metabot-consumer").should("not.exist");
    });

    cy.window().then((win) => {
      // Channel global may be undefined, or defined-but-null. Either proves
      // no subscriber published a value.
      const channel = (
        win as unknown as { __MB_METABOT_STATE__?: { value?: unknown } }
      ).__MB_METABOT_STATE__;
      expect(!channel || channel.value == null).to.equal(true);
    });
  });

  it("exposes a null CurrentChart before any navigate_to arrives, without throwing", () => {
    H.mockMetabotResponse({
      statusCode: 200,
      body: buildNavigateToResponse(adHocQuestionPathOrders),
    });

    mountSdkContent(<MetabotConsumer />);

    getSdkRoot().within(() => {
      cy.findByTestId("metabot-consumer").should("exist");
      cy.findByTestId("metabot-current-chart-kind").should("have.text", "null");
      cy.findByTestId("metabot-current-chart").should("not.exist");
    });
  });

  it("keeps CurrentChart identity stable across unrelated parent re-renders", () => {
    H.mockMetabotResponse({
      statusCode: 200,
      body: buildNavigateToResponse(adHocQuestionPathOrders),
    });

    mountSdkContent(<IdentityTrackingConsumer />);

    getSdkRoot().within(() => {
      cy.findByTestId("metabot-send").click();
    });
    cy.wait("@metabotAgent", { timeout: 20_000 });

    getSdkRoot().within(() => {
      cy.findByTestId("metabot-current-chart").should("exist");
      cy.findByTestId("visualization-root").should("exist");

      cy.findByTestId("metabot-tick").click();
      cy.findByTestId("metabot-tick").click();
      cy.findByTestId("metabot-tick").click();

      cy.findByTestId("metabot-tick-value").should("have.text", "3");
      cy.findByTestId("metabot-identity-changes").should("have.text", "0");
      cy.findByTestId("visualization-root").should("exist");
    });
  });

  it("swaps CurrentChart when a second navigate_to reaction arrives with a new path", () => {
    let callCount = 0;
    cy.intercept("POST", "/api/metabot/agent-streaming", (request) => {
      callCount += 1;
      const body =
        callCount === 1
          ? buildNavigateToResponse(adHocQuestionPathOrders)
          : buildNavigateToResponse(adHocQuestionPathProducts);
      request.reply({
        statusCode: 200,
        body,
        headers: { "content-type": "text/event-stream; charset=utf-8" },
      });
    }).as("metabotAgent");

    mountSdkContent(<MetabotConsumer />);

    getSdkRoot().within(() => {
      cy.findByTestId("metabot-send").click();
    });
    cy.wait("@metabotAgent", { timeout: 20_000 });

    getSdkRoot()
      .findByTestId("visualization-root")
      .should("exist")
      .invoke("text")
      .then((firstChartText) => {
        getSdkRoot().within(() => {
          cy.findByTestId("metabot-send").click();
        });
        cy.wait("@metabotAgent", { timeout: 20_000 });

        getSdkRoot()
          .findByTestId("visualization-root")
          .should("exist")
          .invoke("text")
          .should((secondChartText) => {
            expect(secondChartText).to.not.equal(firstChartText);
          });
      });
  });
});

/**
 * Step 7 verification for EMB-1616: end-to-end integration under
 * `<MetabaseProvider>`.
 *
 * This spec renders the REAL `MetabaseProvider` (from this package) with a
 * consumer that calls `useMetabot()`. The SDK bundle global is stubbed with
 * the REAL `MetabotSubscriber` export — the boundary that links
 * `MetabotSubscriber` (bundle) → `metabot-state-channel` → `useMetabot`
 * (package hook) is the thing under test.
 *
 * Key choices:
 * - `useLoadSdkBundle` is mocked to a no-op. We don't want to fetch a script
 *   tag in jsdom. We seed `window.METABASE_EMBEDDING_SDK_BUNDLE` directly.
 * - `setupEnterprisePlugins()` + importing `embedding-sdk-ee/metabot` wires
 *   `METABOT_SDK_EE_PLUGIN.MetabotProvider` so the subscriber's inner tree
 *   can drive real metabot redux state.
 * - `StaticQuestion` / `InteractiveQuestion` / internal `ComponentProvider`
 *   are mocked (same pattern as the bundle-level `use-metabot` spec) so chart
 *   assertions don't depend on full viz rendering.
 */

import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

// Register EE plugins + the SDK-EE metabot side effect so
// `METABOT_SDK_EE_PLUGIN.MetabotProvider` is the real provider.
import "metabase-enterprise/plugins";
import "embedding-sdk-ee/metabot";

import { act, screen, waitFor } from "__support__/ui";
import { MetabotSubscriber } from "embedding-sdk-bundle/components/private/MetabotSubscriber/MetabotSubscriber";
import { getSdkStore } from "embedding-sdk-bundle/store";
import type { MetabaseEmbeddingSdkBundleExports } from "embedding-sdk-bundle/types/sdk-bundle";
import { useMetabot } from "embedding-sdk-package/hooks/public/use-metabot";
import {
  lastReqBody,
  mockAgentEndpoint,
  whoIsYourFavoriteResponse,
} from "metabase/metabot/tests/utils";
import { MetabaseProvider } from "./MetabaseProvider";

// Mocks for chart components so `CurrentChart` + message.Component don't need
// full visualization rendering. Mirrors the pattern in the bundle-level
// `use-metabot.unit.spec.tsx`.
jest.mock("embedding-sdk-bundle/components/public/ComponentProvider", () => ({
  ComponentProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
jest.mock("embedding-sdk-bundle/components/public/StaticQuestion", () => {
  const Component = ({ query }: { query?: string }) => (
    <div data-testid="mock-static-question" data-query={query} />
  );
  return { StaticQuestion: Component, StaticQuestionInternal: Component };
});
jest.mock("embedding-sdk-bundle/components/public/InteractiveQuestion", () => {
  const Component = ({ query }: { query?: string }) => (
    <div data-testid="mock-interactive-question" data-query={query} />
  );
  return {
    InteractiveQuestion: Component,
    InteractiveQuestionInternal: Component,
  };
});

// The package-level `useLoadSdkBundle` tries to inject a <script> tag and
// await a CustomEvent. That's useless in jsdom — we stub the bundle global
// directly below, and this mock just marks the store as loaded so
// `MetabaseProviderInner` proceeds past its `isLoading` guard.
jest.mock(
  "embedding-sdk-package/hooks/private/use-load-sdk-bundle",
  () => ({
    // Effect-based state transition so we don't setState during render (which
    // React 18 drops with a "Cannot update a component while rendering a
    // different component" warning). `useEffect` schedules the transition
    // after commit so `MetabaseProviderInner` picks it up on the next render.
    useLoadSdkBundle: () => {
      const React = require("react");
      const {
        ensureMetabaseProviderPropsStore,
      } = require("embedding-sdk-shared/lib/ensure-metabase-provider-props-store");
      const {
        SdkLoadingState,
      } = require("embedding-sdk-shared/types/sdk-loading");
      React.useEffect(() => {
        const store = ensureMetabaseProviderPropsStore();
        if (
          store.getState().internalProps.loadingState !== SdkLoadingState.Loaded
        ) {
          store.updateInternalProps({ loadingState: SdkLoadingState.Loaded });
        }
      }, []);
    },
  }),
);

const mockAuthConfig = {
  metabaseInstanceUrl: "http://localhost:3000",
  authProviderUri: "http://localhost:3000/sso",
} as const;

type BundleWindow = Window & {
  METABASE_EMBEDDING_SDK_BUNDLE?: MetabaseEmbeddingSdkBundleExports;
  __MB_METABOT_STATE__?: unknown;
};

const installBundleStub = () => {
  const bundleWindow = window as unknown as BundleWindow;
  bundleWindow.METABASE_EMBEDDING_SDK_BUNDLE = {
    // Only the properties the package-side code touches matter here.
    useInitData: () => {},
    useLogVersionInfo: () => {},
    getSdkStore,
    _internal: { MetabotSubscriber },
  } as unknown as MetabaseEmbeddingSdkBundleExports;
};

const uninstallBundleStub = () => {
  const bundleWindow = window as unknown as BundleWindow;
  delete bundleWindow.METABASE_EMBEDDING_SDK_BUNDLE;
  delete bundleWindow.__MB_METABOT_STATE__;
};

describe("MetabaseProvider integration (EMB-1616 Step 7)", () => {
  beforeEach(() => {
    installBundleStub();
  });

  afterEach(() => {
    uninstallBundleStub();
  });

  it("exposes useMetabot() under a bare MetabaseProvider (null → populated, submitMessage wires through)", async () => {
    // We use the full-path dynamic import of `renderWithProviders` so we
    // still pass through the harness's redux + theme wrappers. Consumers in
    // real apps would use MetabaseProvider alone.
    const { renderWithProviders } = await import("__support__/ui");

    const submitCalls: unknown[] = [];
    const messagesSeen: unknown[][] = [];
    const chartKindsSeen: string[] = [];

    const MetabotConsumer = () => {
      const metabot = useMetabot();
      if (!metabot) {
        return <div data-testid="metabot-state">null</div>;
      }
      messagesSeen.push(metabot.messages);
      const handleClick = async () => {
        submitCalls.push("hi");
        await metabot.submitMessage("hi");
      };
      const { CurrentChart } = metabot;
      if (CurrentChart) {
        chartKindsSeen.push("current-chart");
      }
      return (
        <div data-testid="metabot-state">
          populated
          <button data-testid="submit-btn" onClick={handleClick}>
            submit
          </button>
          <div
            data-testid="messages-count"
            data-count={metabot.messages.length}
          />
          {CurrentChart ? <CurrentChart /> : null}
        </div>
      );
    };

    const agentSpy = mockAgentEndpoint({
      textChunks: whoIsYourFavoriteResponse,
    });

    renderWithProviders(
      <MetabaseProvider authConfig={mockAuthConfig}>
        <MetabotConsumer />
      </MetabaseProvider>,
    );

    // null → populated: `MetabotSubscriber` publishes after its first
    // effect runs (inside an act flush from RTL's render).
    await waitFor(() => {
      expect(screen.getByTestId("metabot-state")).toHaveTextContent(
        "populated",
      );
    });
    expect(screen.getByTestId("submit-btn")).toBeInTheDocument();

    // submitMessage routes through the mocked agent endpoint.
    await act(async () => {
      await userEvent.click(screen.getByTestId("submit-btn"));
    });

    const requestBody = await lastReqBody(agentSpy);
    expect(requestBody?.message).toBe("hi");
    expect(submitCalls).toEqual(["hi"]);

    // messages.length > 0 after the agent response streams in.
    await waitFor(() => {
      const messagesCount = screen.getByTestId("messages-count");
      expect(
        Number(messagesCount.getAttribute("data-count") ?? "0"),
      ).toBeGreaterThan(0);
    });
  });
});

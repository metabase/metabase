import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import { act, screen, waitFor } from "__support__/ui";
import { metabotActions } from "metabase/metabot/state";
import { getMetabotInitialState } from "metabase/metabot/state/reducer-utils";
import {
  lastReqBody,
  mockAgentEndpoint,
  setup,
  whoIsYourFavoriteResponse,
} from "metabase/metabot/tests/utils";

import { useMetabot } from "./use-metabot";

/**
 * This file covers hook wiring for non-passthrough behavior. The following
 * result properties are deliberately not tested here because they forward
 * directly to `useMetabotAgent` with no transformation:
 *   - retryMessage       → agent.retryMessage(messageId)
 *   - cancelRequest      → agent.cancelRequest
 *   - resetConversation  → agent.resetConversation
 *   - errorMessages      → agent.errorMessages
 *   - isProcessing       → agent.isDoingScience (renamed)
 */
// These tests verify `useMetabot().CurrentChart` wiring only: renders nothing
// before `navigate_to`, StaticQuestion vs InteractiveQuestion based on
// `drills`, and `query` forwarding. Mocks surface `data-testid` + `data-query`
// so those assertions are direct. Real rendering of Static/Interactive
// questions (base64 query decode, ad-hoc dataset execution, viz output) is
// covered by StaticQuestion.unit.spec.tsx and InteractiveQuestion.unit.spec.tsx.
// `use-metabot.tsx` wraps chart output in `ComponentProvider` so callers of
// `useMetabot()` can render charts under a bare `MetabaseProvider`. These
// specs verify chart-wiring only, not provider init (`useInitDataInternal`,
// authConfig plumbing, etc.), so pass `ComponentProvider` through.
jest.mock("embedding-sdk-bundle/components/public/ComponentProvider", () => ({
  ComponentProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

jest.mock("embedding-sdk-bundle/components/public/StaticQuestion", () => {
  const Component = ({ query }: { query?: string }) => (
    <div data-testid="mock-static-question" data-query={query} />
  );
  return { StaticQuestionInternal: Component };
});

jest.mock("embedding-sdk-bundle/components/public/InteractiveQuestion", () => {
  const Component = ({ query }: { query?: string }) => (
    <div data-testid="mock-interactive-question" data-query={query} />
  );
  return { InteractiveQuestionInternal: Component };
});

describe("useMetabot", () => {
  describe("CurrentChart", () => {
    const TestCurrentChart = ({ drills }: { drills?: true }) => {
      const { CurrentChart } = useMetabot();
      return CurrentChart ? <CurrentChart drills={drills} /> : null;
    };

    it("renders nothing before navigate_to fires", () => {
      setup({
        ui: <TestCurrentChart />,
      });

      expect(
        screen.queryByTestId("mock-static-question"),
      ).not.toBeInTheDocument();
    });

    it("renders a chart after navigate_to fires", async () => {
      const { store } = setup({
        ui: <TestCurrentChart />,
      });

      expect(
        screen.queryByTestId("mock-static-question"),
      ).not.toBeInTheDocument();

      act(() => {
        store.dispatch(metabotActions.setNavigateToPath("/question#base64"));
      });

      expect(await screen.findByTestId("mock-static-question")).toBeVisible();
    });

    it("renders StaticQuestion when drills is absent", async () => {
      const { store } = setup({
        ui: <TestCurrentChart />,
      });

      act(() => {
        store.dispatch(metabotActions.setNavigateToPath("/question#base64"));
      });

      expect(
        await screen.findByTestId("mock-static-question"),
      ).toBeInTheDocument();
    });

    it("renders InteractiveQuestion when drills is true", async () => {
      const { store } = setup({
        ui: <TestCurrentChart drills />,
      });

      act(() => {
        store.dispatch(metabotActions.setNavigateToPath("/question#base64"));
      });

      expect(
        await screen.findByTestId("mock-interactive-question"),
      ).toBeInTheDocument();
    });

    it("updates when a second navigate_to fires", async () => {
      const { store } = setup({
        ui: <TestCurrentChart />,
      });

      act(() => {
        store.dispatch(metabotActions.setNavigateToPath("/question#first"));
      });

      const chart = await screen.findByTestId("mock-static-question");
      expect(chart).toHaveAttribute("data-query", "/question#first");

      act(() => {
        store.dispatch(metabotActions.setNavigateToPath("/question#second"));
      });

      await waitFor(() => {
        expect(screen.getByTestId("mock-static-question")).toHaveAttribute(
          "data-query",
          "/question#second",
        );
      });
    });
  });

  describe("messages", () => {
    const TestMessages = () => {
      const { messages } = useMetabot();
      return (
        <div data-testid="messages" data-json={JSON.stringify(messages)} />
      );
    };

    const readMessages = async () => {
      let parsed: any[] = [];
      await waitFor(() => {
        const messages = screen.getByTestId("messages");
        parsed = JSON.parse(messages.getAttribute("data-json") ?? "[]");
        expect(parsed.length).toBeGreaterThan(0);
      });
      return parsed;
    };

    it("maps user.text passthrough", async () => {
      const { store } = setup({ ui: <TestMessages /> });

      act(() => {
        store.dispatch(
          metabotActions.addUserMessage({
            agentId: "omnibot",
            id: "u1",
            type: "text",
            message: "hi",
          }),
        );
      });

      expect(await readMessages()).toEqual([
        { id: "u1", role: "user", type: "text", message: "hi" },
      ]);
    });

    it("maps agent.text passthrough", async () => {
      const { store } = setup({ ui: <TestMessages /> });

      act(() => {
        store.dispatch(
          // `addAgentMessage`/`addUserMessage` in reducer.ts type their payload
          // as `Omit<UnionType, ...>`. Non-distributive `Omit` collapses the
          // discriminated union to common keys only, so branch-specific fields
          // (message, navigateTo, payload, ...) fail excess-property checks
          // without `as any`. Switching to a DistributiveOmit would unblock
          // call sites here but surfaces more errors elsewhere (e.g. the
          // edit_suggestion payload hits the "infinite TS errors" noted in
          // reducer.ts). Keeping `as any` for now — applies to every dispatch
          // below.
          metabotActions.addAgentMessage({
            agentId: "omnibot",
            type: "text",
            message: "ok",
          } as any),
        );
      });

      const [message] = await readMessages();
      expect(message).toEqual({
        id: expect.any(String),
        role: "agent",
        type: "text",
        message: "ok",
      });
    });

    it("renames `navigateTo` to `questionPath` on agent.chart", async () => {
      const { store } = setup({ ui: <TestMessages /> });

      act(() => {
        store.dispatch(
          metabotActions.addAgentMessage({
            agentId: "omnibot",
            type: "chart",
            navigateTo: "/question#base64",
          } as any),
        );
      });

      const [message] = await readMessages();
      // `Chart` is a React component reference — JSON.stringify drops
      // functions, so it appears as `undefined` in the serialized snapshot
      // the harness reads. We assert only the serializable fields here;
      // `Chart` wiring is covered by the `messages[n].Chart` describe.
      expect(message).toEqual({
        id: expect.any(String),
        role: "agent",
        type: "chart",
        questionPath: "/question#base64",
      });
    });

    it("filters out internal-only variants (tool_call, edit_suggestion, user action, todo_list)", async () => {
      const { store } = setup({ ui: <TestMessages /> });

      act(() => {
        store.dispatch(metabotActions.setDebugMode(true));
        store.dispatch(
          metabotActions.addAgentMessage({
            agentId: "omnibot",
            type: "tool_call",
            name: "fn",
            status: "started",
          } as any),
        );
        store.dispatch(
          metabotActions.addUserMessage({
            agentId: "omnibot",
            id: "u-action",
            type: "action",
            message: "5 rows",
            userMessage: "Run Query",
          } as any),
        );
        store.dispatch(
          metabotActions.addAgentMessage({
            agentId: "omnibot",
            type: "edit_suggestion",
            model: "transform",
            payload: {
              editorTransform: undefined,
              suggestedTransform: {
                name: "Transform A",
                description: "Does X",
                source: "SRC",
                target: "TGT",
                active: true,
                suggestionId: "s1",
              },
            },
          } as any),
        );
        store.dispatch(
          metabotActions.addAgentMessage({
            agentId: "omnibot",
            type: "todo_list",
            payload: [
              {
                id: "t1",
                content: "work",
                status: "pending",
                priority: "high",
              },
            ],
          } as any),
        );
        store.dispatch(
          metabotActions.addAgentMessage({
            agentId: "omnibot",
            type: "text",
            message: "ok",
          } as any),
        );
      });

      const messages = await readMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({
        id: expect.any(String),
        role: "agent",
        type: "text",
        message: "ok",
      });
    });
  });

  describe("submitMessage", () => {
    const TestSubmit = ({
      onResolved,
    }: {
      onResolved?: (value: unknown) => void;
    }) => {
      const { submitMessage } = useMetabot();
      const handleClick = async () => {
        const result = await submitMessage("hi");
        onResolved?.(result);
      };
      return (
        <button data-testid="submit-btn" onClick={handleClick}>
          submit
        </button>
      );
    };

    it("forwards the message to the underlying agent request", async () => {
      const agentSpy = mockAgentEndpoint({
        textChunks: whoIsYourFavoriteResponse,
      });
      setup({ ui: <TestSubmit /> });

      await userEvent.click(screen.getByTestId("submit-btn"));

      const reqBody = await lastReqBody(agentSpy);
      expect(reqBody?.message).toBe("hi");
    });

    it("does not open the metabot sidebar (preventOpenSidebar)", async () => {
      mockAgentEndpoint({ textChunks: whoIsYourFavoriteResponse });
      // default setup() forces omnibot.visible = true; override so we can
      // observe whether submitMessage would flip it back on.
      const { store } = setup({
        ui: <TestSubmit />,
        metabotInitialState: getMetabotInitialState(),
      });

      expect(
        store.getState().metabot?.conversations?.omnibot?.messages.length,
      ).toBe(0);
      expect(store.getState().metabot?.conversations?.omnibot?.visible).toBe(
        false,
      );

      await userEvent.click(screen.getByTestId("submit-btn"));

      await waitFor(() => {
        expect(
          store.getState().metabot?.conversations?.omnibot?.messages.length,
        ).toBeGreaterThan(0);
      });

      expect(store.getState().metabot?.conversations?.omnibot?.visible).toBe(
        false,
      );
    });

    it("resolves to undefined even though agent.submitInput returns an action", async () => {
      mockAgentEndpoint({ textChunks: whoIsYourFavoriteResponse });
      const onResolved = jest.fn();
      setup({ ui: <TestSubmit onResolved={onResolved} /> });

      await userEvent.click(screen.getByTestId("submit-btn"));

      await waitFor(() => expect(onResolved).toHaveBeenCalled());
      expect(onResolved).toHaveBeenCalledWith(undefined);
    });
  });

  describe("messages[n].Chart", () => {
    const TestMessageComponent = ({ drills }: { drills?: true }) => {
      const { messages } = useMetabot();
      const chartMessage = messages.find((message) => message.type === "chart");
      if (!chartMessage) {
        return null;
      }
      const { Chart } = chartMessage;
      return <Chart drills={drills} />;
    };

    it("renders StaticQuestion when drills is absent", async () => {
      const { store } = setup({ ui: <TestMessageComponent /> });

      act(() => {
        store.dispatch(
          metabotActions.addAgentMessage({
            agentId: "omnibot",
            type: "chart",
            navigateTo: "/question#abc",
          } as any),
        );
      });

      expect(
        await screen.findByTestId("mock-static-question"),
      ).toBeInTheDocument();
    });

    it("renders InteractiveQuestion when drills is true", async () => {
      const { store } = setup({ ui: <TestMessageComponent drills /> });

      act(() => {
        store.dispatch(
          metabotActions.addAgentMessage({
            agentId: "omnibot",
            type: "chart",
            navigateTo: "/question#abc",
          } as any),
        );
      });

      expect(
        await screen.findByTestId("mock-interactive-question"),
      ).toBeInTheDocument();
    });

    it("Chart reference is stable after a second chart message arrives", async () => {
      let firstChart: unknown = null;

      const TestCapture = () => {
        const { messages } = useMetabot();
        const chartMessages = messages.filter(
          (message) => message.type === "chart",
        );
        if (chartMessages[0]) {
          firstChart = chartMessages[0].Chart;
        }
        return <div data-testid="chart-count">{chartMessages.length}</div>;
      };

      const { store } = setup({ ui: <TestCapture /> });

      act(() => {
        store.dispatch(
          metabotActions.addAgentMessage({
            agentId: "omnibot",
            type: "chart",
            navigateTo: "/question#abc",
          } as any),
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId("chart-count")).toHaveTextContent("1");
      });
      const capturedChart = firstChart;
      expect(capturedChart).not.toBeNull();

      act(() => {
        store.dispatch(
          metabotActions.addAgentMessage({
            agentId: "omnibot",
            type: "chart",
            navigateTo: "/question#xyz",
          } as any),
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId("chart-count")).toHaveTextContent("2");
      });

      expect(firstChart).toBe(capturedChart);
    });
  });
});

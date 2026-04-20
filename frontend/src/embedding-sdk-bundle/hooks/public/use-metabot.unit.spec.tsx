import userEvent from "@testing-library/user-event";

import { act, screen, waitFor } from "__support__/ui";
import { metabotActions } from "metabase/metabot/state";
import { setup } from "metabase/metabot/tests/utils";

import { useMetabot } from "./use-metabot";

// These tests verify `useMetabot().CurrentChart` wiring only: null before
// `navigate_to`, StaticQuestion vs InteractiveQuestion based on `drills`,
// and `query` forwarding. Mocks surface `data-testid` + `data-query` so
// those assertions are direct. Real rendering of Static/Interactive questions
// (base64 query decode, ad-hoc dataset execution, viz output) is covered by
// StaticQuestion.unit.spec.tsx and InteractiveQuestion.unit.spec.tsx.
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

describe("useMetabot", () => {
  describe("CurrentChart", () => {
    const TestCurrentChart = ({ drills }: { drills?: true }) => {
      const { CurrentChart } = useMetabot();
      if (!CurrentChart) {
        return <div data-testid="no-chart" />;
      }
      return <CurrentChart drills={drills} />;
    };

    it("is null before navigate_to fires", () => {
      setup({
        ui: <TestCurrentChart />,
      });

      expect(screen.getByTestId("no-chart")).toBeInTheDocument();
    });

    it("becomes a component after navigate_to fires", async () => {
      const { store } = setup({
        ui: <TestCurrentChart />,
      });

      expect(screen.getByTestId("no-chart")).toBeInTheDocument();

      act(() => {
        store.dispatch(metabotActions.setNavigateToPath("/question#base64"));
      });

      await waitFor(() => {
        expect(screen.queryByTestId("no-chart")).not.toBeInTheDocument();
      });
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

    it("renames `userMessage` to `actionLabel` on user.action", async () => {
      const { store } = setup({ ui: <TestMessages /> });

      act(() => {
        store.dispatch(
          metabotActions.addUserMessage({
            agentId: "omnibot",
            id: "u2",
            type: "action",
            message: "5 rows",
            userMessage: "Run Query",
          } as any),
        );
      });

      const [msg] = await readMessages();
      expect(msg).toEqual({
        id: "u2",
        role: "user",
        type: "action",
        message: "5 rows",
        actionLabel: "Run Query",
      });
      expect(msg).not.toHaveProperty("userMessage");
    });

    it("maps agent.text passthrough", async () => {
      const { store } = setup({ ui: <TestMessages /> });

      act(() => {
        store.dispatch(
          metabotActions.addAgentMessage({
            agentId: "omnibot",
            type: "text",
            message: "ok",
          } as any),
        );
      });

      const [msg] = await readMessages();
      expect(msg).toEqual({
        id: expect.any(String),
        role: "agent",
        type: "text",
        message: "ok",
      });
    });

    it("passes through agent.todo_list payload", async () => {
      const todo = {
        id: "t1",
        content: "work",
        status: "pending" as const,
        priority: "high" as const,
      };
      const { store } = setup({ ui: <TestMessages /> });

      act(() => {
        store.dispatch(
          metabotActions.addAgentMessage({
            agentId: "omnibot",
            type: "todo_list",
            payload: [todo],
          } as any),
        );
      });

      const [msg] = await readMessages();
      expect(msg).toEqual({
        id: expect.any(String),
        role: "agent",
        type: "todo_list",
        payload: [todo],
      });
    });

    it("extracts only name/description on agent.edit_suggestion payload", async () => {
      const { store } = setup({ ui: <TestMessages /> });

      act(() => {
        store.dispatch(
          metabotActions.addAgentMessage({
            agentId: "omnibot",
            type: "edit_suggestion",
            model: "transform",
            payload: {
              editorTransform: { some: "thing" },
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
      });

      const [msg] = await readMessages();
      expect(msg).toEqual({
        id: expect.any(String),
        role: "agent",
        type: "edit_suggestion",
        payload: { name: "Transform A", description: "Does X" },
      });
    });

    it("filters out tool_call messages (internal-only debug variant)", async () => {
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
          metabotActions.addAgentMessage({
            agentId: "omnibot",
            type: "text",
            message: "ok",
          } as any),
        );
      });

      const msgs = await readMessages();
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toEqual({
        id: expect.any(String),
        role: "agent",
        type: "text",
        message: "ok",
      });
    });
  });

  describe("customInstructions", () => {
    const TestCustomInstructions = () => {
      const { customInstructions, setCustomInstructions } = useMetabot();
      return (
        <>
          <div data-testid="value">{customInstructions ?? "__undefined__"}</div>
          <button onClick={() => setCustomInstructions("persona X")}>
            set
          </button>
          <button onClick={() => setCustomInstructions(undefined)}>
            clear
          </button>
        </>
      );
    };

    it("defaults to undefined", () => {
      setup({ ui: <TestCustomInstructions /> });

      expect(screen.getByTestId("value")).toHaveTextContent("__undefined__");
    });

    it("updates when setCustomInstructions is called with a string", async () => {
      setup({ ui: <TestCustomInstructions /> });

      await userEvent.click(screen.getByRole("button", { name: "set" }));

      expect(screen.getByTestId("value")).toHaveTextContent("persona X");
    });

    it("clears when setCustomInstructions is called with undefined", async () => {
      setup({ ui: <TestCustomInstructions /> });

      await userEvent.click(screen.getByRole("button", { name: "set" }));
      expect(screen.getByTestId("value")).toHaveTextContent("persona X");

      await userEvent.click(screen.getByRole("button", { name: "clear" }));
      expect(screen.getByTestId("value")).toHaveTextContent("__undefined__");
    });
  });
});

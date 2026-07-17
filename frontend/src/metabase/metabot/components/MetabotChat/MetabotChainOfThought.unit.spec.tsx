import { renderWithProviders, screen } from "__support__/ui";
import type { MetabotAgentChainOfThoughtMessage } from "metabase/metabot/state";

import { MetabotChainOfThought } from "./MetabotChainOfThought";

const chain = (
  overrides: Partial<MetabotAgentChainOfThoughtMessage>,
): MetabotAgentChainOfThoughtMessage => ({
  id: "chain-1",
  role: "agent",
  type: "chain_of_thought",
  steps: [],
  ...overrides,
});

const setup = (
  message: MetabotAgentChainOfThoughtMessage,
  isStreaming: boolean,
) =>
  renderWithProviders(
    <MetabotChainOfThought message={message} isStreaming={isStreaming} />,
  );

describe("MetabotChainOfThought", () => {
  it("shows Thinking… for the empty shell while the turn is live", () => {
    setup(chain({ steps: [] }), true);
    expect(screen.getByText("Thinking…")).toBeInTheDocument();
  });

  it("renders nothing for a settled chain with no steps", () => {
    setup(chain({ steps: [] }), false);
    expect(
      screen.queryByTestId("metabot-chain-of-thought"),
    ).not.toBeInTheDocument();
  });

  it("shows the reasoning block's first line as the header summary", () => {
    setup(
      chain({
        steps: [
          { kind: "reasoning", text: "Exploring the schema\nmore detail here" },
        ],
      }),
      true,
    );
    expect(screen.getAllByText("Exploring the schema").length).toBeGreaterThan(
      0,
    );
  });

  it("shows the tool label as the headline when there is no reasoning", () => {
    setup(
      chain({
        steps: [
          { kind: "tool", id: "t1", name: "analyze_data", status: "started" },
        ],
      }),
      true,
    );
    expect(screen.getAllByText("Analyzing the data").length).toBeGreaterThan(0);
  });

  it("shows Thought for N seconds once settled", () => {
    setup(
      chain({
        steps: [{ kind: "reasoning", text: "done" }],
        startedAtMs: 1000,
        endedAtMs: 6000,
      }),
      false,
    );
    expect(screen.getByText("Thought for 5 seconds")).toBeInTheDocument();
  });

  it("gives read_resource / load_skill real labels instead of Working", () => {
    setup(
      chain({
        steps: [
          { kind: "tool", id: "t1", name: "read_resource", status: "ended" },
          { kind: "tool", id: "t2", name: "load_skill", status: "ended" },
        ],
        startedAtMs: 1000,
        endedAtMs: 3000,
      }),
      false,
    );
    expect(screen.getByText("Reading resource")).toBeInTheDocument();
    expect(screen.getByText("Loading skill")).toBeInTheDocument();
    expect(screen.queryByText("Working")).not.toBeInTheDocument();
  });
});

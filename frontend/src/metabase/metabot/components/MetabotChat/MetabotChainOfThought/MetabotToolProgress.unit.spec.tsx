import { screen } from "__support__/ui";
import type { MetabotChainStep } from "metabase/metabot/state";

import { setup } from "../../../tests/utils";

import { MetabotToolProgress } from "./MetabotToolProgress";

type ToolStep = Extract<MetabotChainStep, { kind: "tool" }>;

const tool = (name: string, overrides: Partial<ToolStep> = {}): ToolStep => ({
  kind: "tool",
  id: name,
  name,
  status: "ended",
  ...overrides,
});

const setupToolProgress = (steps: MetabotChainStep[], isStreaming = true) =>
  setup({
    ui: (
      <MetabotToolProgress
        message={{
          id: "chain-1",
          role: "agent",
          type: "chain_of_thought",
          steps,
        }}
        isStreaming={isStreaming}
      />
    ),
  });

describe("MetabotToolProgress", () => {
  it("shows the loader on its own before any tool call lands", () => {
    setupToolProgress([]);
    expect(screen.getByTestId("metabot-response-loader")).toBeInTheDocument();
  });

  it("lists the tool calls as they run", () => {
    setupToolProgress([
      tool("search", { title: "Orders" }),
      tool("analyze_data", { status: "started" }),
    ]);
    expect(screen.getByText(/Searched for/)).toBeInTheDocument();
    expect(screen.getByText("Analyzing the data")).toBeInTheDocument();
    expect(screen.getByTestId("metabot-response-loader")).toBeInTheDocument();
  });

  it("never offers a chain-of-thought disclosure", () => {
    setupToolProgress([tool("analyze_data", { status: "started" })]);
    expect(
      screen.queryByTestId("metabot-chain-of-thought-header"),
    ).not.toBeInTheDocument();
  });

  it("drops reasoning steps rather than rendering them", () => {
    setupToolProgress([{ kind: "reasoning", text: "Weighing the join order" }]);
    expect(
      screen.queryByText("Weighing the join order"),
    ).not.toBeInTheDocument();
  });

  it("leaves nothing behind once the turn settles", () => {
    setupToolProgress([tool("analyze_data")], false);
    expect(
      screen.queryByTestId("metabot-tool-progress"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("metabot-response-loader"),
    ).not.toBeInTheDocument();
  });
});

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
        part={{
          id: "chain-1",
          role: "agent",
          type: "chain_of_thought",
          steps,
          finished: !isStreaming,
        }}
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

  it("shows the ideas an exploration is weighing while it runs", () => {
    setupToolProgress([
      tool("explore_table", {
        status: "started",
        exploreIdeas: [
          {
            prompt: "Revenue by month",
            status: "kept",
            reason: "Charting now",
          },
          {
            prompt: "Profit by state",
            status: "dropped",
            reason: "Not answerable from these columns",
          },
          { prompt: "Top customers", status: "considering" },
        ],
      }),
    ]);
    expect(screen.getByText("Exploring the table")).toBeInTheDocument();
    expect(screen.getByText("weighing 3 ideas")).toBeInTheDocument();
    expect(
      screen
        .getAllByTestId("metabot-explore-idea")
        .map((row) => row.getAttribute("data-status")),
    ).toEqual(["kept", "dropped", "considering"]);
    expect(
      screen.getByText("Not answerable from these columns"),
    ).toBeInTheDocument();
  });

  it("counts what an exploration kept once every idea is decided", () => {
    setupToolProgress([
      tool("explore_table", {
        exploreIdeas: [
          { prompt: "Revenue by month", status: "kept" },
          { prompt: "Profit by state", status: "dropped" },
        ],
      }),
      tool("analyze_data", { status: "started" }),
    ]);
    expect(screen.getByText("Explored the table")).toBeInTheDocument();
    expect(screen.getByText("kept 1 of 2")).toBeInTheDocument();
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

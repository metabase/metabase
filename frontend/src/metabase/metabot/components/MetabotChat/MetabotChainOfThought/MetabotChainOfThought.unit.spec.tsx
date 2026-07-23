import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import type { MetabotAgentChainOfThoughtMessage } from "metabase/metabot/state";
import { createMockState } from "metabase/redux/store/mocks";
import { createMockDashboard } from "metabase-types/api/mocks";

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
) => {
  setupEnterprisePlugins();
  const settings = mockSettings({ "site-url": "http://localhost:3000" });
  fetchMock.get(
    "path:/api/dashboard/123",
    createMockDashboard({ id: 123, name: "Orders" }),
  );
  return renderWithProviders(
    <MetabotChainOfThought message={message} isStreaming={isStreaming} />,
    { storeInitialState: createMockState({ settings }) },
  );
};

const expandChain = async () => {
  await userEvent.click(screen.getByTestId("metabot-chain-of-thought-header"));
};

describe("MetabotChainOfThought", () => {
  it("shows Thinking for the empty shell while the turn is live", () => {
    setup(chain({ steps: [] }), true);
    expect(screen.getByText("Thinking")).toBeInTheDocument();
  });

  it("always offers the header toggle, even with no renderable steps", () => {
    setup(chain({ steps: [{ kind: "reasoning", text: "" }] }), true);
    expect(screen.getByText("Thinking")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("renders nothing for a settled chain with no steps", () => {
    setup(chain({ steps: [] }), false);
    expect(
      screen.queryByTestId("metabot-chain-of-thought"),
    ).not.toBeInTheDocument();
  });

  it("never surfaces reasoning text in the header, only Thinking", () => {
    setup(
      chain({
        steps: [
          { kind: "reasoning", text: "Exploring the schema\nmore detail here" },
        ],
      }),
      true,
    );
    const header = screen.getByRole("button", { name: /Thinking/ });
    expect(header).toHaveTextContent("Thinking");
    expect(header).not.toHaveTextContent("Exploring the schema");
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

  it("shows Worked for N seconds once a tool-using turn settles past the threshold", () => {
    setup(
      chain({
        steps: [
          { kind: "tool", id: "t1", name: "analyze_data", status: "ended" },
        ],
        startedAtMs: 1000,
        endedAtMs: 6000,
      }),
      false,
    );
    expect(screen.getByText("Worked for 5 seconds")).toBeInTheDocument();
  });

  it("rolls a sub-5s tool-using turn up to Worked briefly", () => {
    setup(
      chain({
        steps: [
          { kind: "tool", id: "t1", name: "analyze_data", status: "ended" },
        ],
        startedAtMs: 1000,
        endedAtMs: 3400,
      }),
      false,
    );
    expect(screen.getByText("Worked briefly")).toBeInTheDocument();
    expect(screen.queryByText(/Worked for/)).not.toBeInTheDocument();
  });

  it("swaps the verb to Thought for a thinking-only turn past the threshold", () => {
    setup(
      chain({
        steps: [{ kind: "reasoning", text: "Weighing the join order" }],
        startedAtMs: 1000,
        endedAtMs: 9000,
      }),
      false,
    );
    expect(screen.getAllByText("Thought for 8 seconds").length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByText(/Worked/)).not.toBeInTheDocument();
  });

  it("rolls a sub-5s thinking-only turn up to Thought briefly", () => {
    setup(
      chain({
        steps: [{ kind: "reasoning", text: "quick" }],
        startedAtMs: 1000,
        endedAtMs: 2000,
      }),
      false,
    );
    expect(screen.getAllByText("Thought briefly").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Worked/)).not.toBeInTheDocument();
  });

  it("labels still-streaming reasoning Thinking and keeps it collapsed", () => {
    setup(
      chain({
        steps: [{ kind: "reasoning", text: "Weighing the join order" }],
      }),
      true,
    );
    expect(screen.getByRole("button", { name: /Thinking/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByText("Thought briefly")).not.toBeInTheDocument();
  });

  it("tucks a reasoning step under its own Thought briefly collapse when it isn't alone", async () => {
    setup(
      chain({
        steps: [
          { kind: "reasoning", text: "Weighing the join order" },
          { kind: "tool", id: "t1", name: "analyze_data", status: "ended" },
        ],
        startedAtMs: 1000,
        endedAtMs: 2000,
      }),
      false,
    );
    await expandChain();
    // the header rolls up the whole turn ("Worked briefly"); the reasoning keeps
    // its own "Thought briefly" collapse row — click it to reveal the body
    expect(screen.getByText("Worked briefly")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Thought briefly"));
    expect(screen.getByText("Weighing the join order")).toBeInTheDocument();
  });

  it("shows a lone thinking event inline, with no redundant collapse row", async () => {
    setup(
      chain({
        steps: [{ kind: "reasoning", text: "Weighing the join order" }],
        startedAtMs: 1000,
        endedAtMs: 2000,
      }),
      false,
    );
    // the header already rolls it up as "Thought briefly"
    expect(screen.getByText("Thought briefly")).toBeInTheDocument();
    await expandChain();
    // expanding shows the reasoning directly — the only "Thought briefly" is the
    // header, not a second toggle repeating it
    expect(screen.getByText("Weighing the join order")).toBeInTheDocument();
    expect(screen.getAllByText("Thought briefly")).toHaveLength(1);
  });

  it("wraps the streamed search object in the verb + tense", async () => {
    setup(
      chain({
        steps: [
          {
            kind: "tool",
            id: "t1",
            name: "search",
            // backend streams just the object (the query); the FE owns the verb
            title: "sales data",
            status: "ended",
          },
        ],
        startedAtMs: 1000,
        endedAtMs: 2000,
      }),
      false,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Searched for sales data")).toBeInTheDocument();
  });

  it("renders a metabase:// link title as a clickable entity link with an icon", async () => {
    setup(
      chain({
        steps: [
          {
            kind: "tool",
            id: "t1",
            name: "read_resource",
            title: "[Orders](metabase://dashboard/123)",
            status: "ended",
          },
        ],
        startedAtMs: 1000,
        endedAtMs: 2000,
      }),
      false,
    );
    await userEvent.click(screen.getByRole("button"));
    // the row reads past tense with the entity inline ("Read Orders")
    expect(await screen.findByText("Read")).toHaveTextContent("Read Orders");
    expect(await screen.findByText("Orders")).toBeInTheDocument();
    expect(
      await screen.findByRole("img", { name: /dashboard icon/ }),
    ).toBeInTheDocument();
  });

  it("labels a settled save_entity step with a clickable Saved link", async () => {
    setup(
      chain({
        steps: [
          {
            kind: "tool",
            id: "t1",
            name: "save_entity",
            // the link title only arrives once the saved card exists
            title: "[Sales by Month](metabase://dashboard/123)",
            status: "ended",
          },
        ],
        startedAtMs: 1000,
        endedAtMs: 2000,
      }),
      false,
    );
    await expandChain();
    expect(await screen.findByText("Saved")).toHaveTextContent(
      "Saved Sales by Month",
    );
    expect(await screen.findByText("Sales by Month")).toBeInTheDocument();
  });

  it("labels a running save_entity step with the generic Saving verb", () => {
    setup(
      chain({
        steps: [
          { kind: "tool", id: "t1", name: "save_entity", status: "started" },
        ],
      }),
      true,
    );
    // no link title yet (the card doesn't exist mid-save) -> the generic verb
    expect(screen.getAllByText("Saving").length).toBeGreaterThan(0);
  });

  it("keeps the top-level preview generic but names the entity in the active row", async () => {
    setup(
      chain({
        steps: [
          {
            kind: "tool",
            id: "t1",
            name: "read_resource",
            title: "[Orders](metabase://dashboard/123)",
            status: "started",
          },
        ],
      }),
      true,
    );
    // top level stays generic + plural, never the entity
    expect(screen.getByText("Reading resources")).toBeInTheDocument();
    // expand: the running row names the entity, in the present tense
    await userEvent.click(
      screen.getByRole("button", { name: /Reading resources/ }),
    );
    // the running row reads present tense with the entity inline ("Reading Orders")
    expect(await screen.findByText("Reading")).toHaveTextContent(
      "Reading Orders",
    );
    expect(await screen.findByText("Orders")).toBeInTheDocument();
  });

  it("labels a search step with its query and a muted result count", async () => {
    setup(
      chain({
        steps: [
          {
            kind: "tool",
            id: "t1",
            name: "search",
            title: "revenue",
            status: "ended",
            searchResults: {
              totalCount: 12,
              results: [
                {
                  id: 5,
                  type: "dashboard",
                  name: "Revenue Dashboard",
                  collection: { id: 3, name: "Finance" },
                },
                {
                  id: 9,
                  type: "table",
                  name: "orders",
                  display_name: "Orders",
                  database_id: 1,
                  database_name: "Sample DB",
                  database_schema: "PUBLIC",
                },
              ],
            },
          },
        ],
        startedAtMs: 1000,
        endedAtMs: 2000,
      }),
      false,
    );
    // expand the chain, then expand the search step's results collapse
    await expandChain();
    expect(screen.getByText(/Searched for revenue/)).toBeInTheDocument();
    expect(screen.getByText("12 results")).toBeInTheDocument();
    expect(screen.queryByText("Explored 12 entities")).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("12 results"));
    expect(screen.getByText("Revenue Dashboard")).toBeInTheDocument();
    // collection context for a saved item
    expect(screen.getByText("Finance")).toBeInTheDocument();
    // tables prefer display_name, and show their database › schema
    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.queryByText("orders")).not.toBeInTheDocument();
    expect(screen.getByText("Sample DB", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("PUBLIC", { exact: false })).toBeInTheDocument();
  });

  it("labels an empty search with No results", async () => {
    setup(
      chain({
        steps: [
          {
            kind: "tool",
            id: "t1",
            name: "search",
            title: "revenue",
            status: "ended",
            searchResults: { totalCount: 0, results: [] },
          },
        ],
        startedAtMs: 1000,
        endedAtMs: 2000,
      }),
      false,
    );
    await expandChain();
    expect(screen.getByText(/Searched for revenue/)).toBeInTheDocument();
    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  it("gives read_resource a real label and hides load_skill entirely", async () => {
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
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Read resource")).toBeInTheDocument();
    expect(screen.queryByText("Loading skill")).not.toBeInTheDocument();
    expect(screen.queryByText("Working")).not.toBeInTheDocument();
  });

  it("hides deliberately unlabeled tools instead of showing Working", async () => {
    setup(
      chain({
        steps: [
          {
            kind: "tool",
            id: "t1",
            name: "list_available_fields",
            status: "ended",
          },
          { kind: "tool", id: "t2", name: "search", status: "ended" },
        ],
        startedAtMs: 1000,
        endedAtMs: 2000,
      }),
      false,
    );
    await userEvent.click(screen.getByRole("button"));
    // no query object streamed, and settled -> the past-tense generic verb
    expect(screen.getByText("Searched")).toBeInTheDocument();
    expect(screen.queryByText("Working")).not.toBeInTheDocument();
  });

  it("flips a tool label to past tense once the step has ended", async () => {
    setup(
      chain({
        steps: [
          { kind: "tool", id: "t1", name: "analyze_data", status: "ended" },
        ],
        startedAtMs: 1000,
        endedAtMs: 2000,
      }),
      false,
    );
    await expandChain();
    expect(screen.getByText("Analyzed the data")).toBeInTheDocument();
    expect(screen.queryByText("Analyzing the data")).not.toBeInTheDocument();
  });

  it("shows the exact seconds on a reasoning row that ran long", async () => {
    setup(
      chain({
        steps: [
          { kind: "reasoning", text: "Deliberating", startedAtMs: 1000 },
          { kind: "tool", id: "t1", name: "analyze_data", status: "ended" },
        ],
        startedAtMs: 1000,
        endedAtMs: 8000,
      }),
      false,
    );
    await expandChain();
    expect(screen.getByText("Thought for 7 seconds")).toBeInTheDocument();
    expect(screen.queryByText("Thought briefly")).not.toBeInTheDocument();
  });

  it("aggregates a burst of resource reads into one row", async () => {
    setup(
      chain({
        steps: [
          { kind: "tool", id: "r1", name: "read_resource", status: "ended" },
          { kind: "tool", id: "r2", name: "read_resource", status: "ended" },
          { kind: "tool", id: "r3", name: "read_resource", status: "ended" },
        ],
        startedAtMs: 1000,
        endedAtMs: 2000,
      }),
      false,
    );
    await expandChain();
    expect(screen.getByText("Read 3 resources")).toBeInTheDocument();
    expect(screen.queryByText("Reading resource")).not.toBeInTheDocument();
  });
});

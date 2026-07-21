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

describe("MetabotChainOfThought", () => {
  it("shows Thinking… for the empty shell while the turn is live", () => {
    setup(chain({ steps: [] }), true);
    expect(screen.getByText("Thinking…")).toBeInTheDocument();
  });

  it("does not offer a toggle while the chain has no renderable steps", () => {
    setup(chain({ steps: [{ kind: "reasoning", text: "" }] }), true);
    expect(screen.getByText("Thinking…")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: /chevrondown/ }),
    ).not.toBeInTheDocument();
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

  it("collapses the header to Thinking… when expanded mid-stream", async () => {
    setup(
      chain({ steps: [{ kind: "reasoning", text: "Exploring the schema" }] }),
      true,
    );
    // collapsed: the header previews the streaming reasoning
    expect(screen.queryByText("Thinking…")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button"));
    // expanded: the reasoning shows in the timeline, so the header steps back
    expect(screen.getByText("Thinking…")).toBeInTheDocument();
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

  it("prefers a streamed plain-text title over the constants label", async () => {
    setup(
      chain({
        steps: [
          {
            kind: "tool",
            id: "t1",
            name: "search",
            title: "Searching sales data",
            status: "ended",
          },
        ],
        startedAtMs: 1000,
        endedAtMs: 2000,
      }),
      false,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Searching sales data")).toBeInTheDocument();
    expect(screen.queryByText("Searching")).not.toBeInTheDocument();
  });

  it("renders a metabase:// link title as a clickable entity link with an icon", async () => {
    setup(
      chain({
        steps: [
          {
            kind: "tool",
            id: "t1",
            name: "read_resource",
            title: "Inspecting [Orders](metabase://dashboard/123)",
            status: "ended",
          },
        ],
        startedAtMs: 1000,
        endedAtMs: 2000,
      }),
      false,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(await screen.findByText("Orders")).toBeInTheDocument();
    expect(
      await screen.findByRole("img", { name: /dashboard icon/ }),
    ).toBeInTheDocument();
  });

  it("shows read_resource entity links in the streaming header preview", async () => {
    setup(
      chain({
        steps: [
          {
            kind: "tool",
            id: "t1",
            name: "read_resource",
            title: "Inspecting [Orders](metabase://dashboard/123)",
            status: "started",
          },
        ],
      }),
      true,
    );
    // the link renders (header preview + mounted timeline), not flattened text
    expect((await screen.findAllByText("Orders")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Inspecting Orders")).not.toBeInTheDocument();
  });

  it("renders search results as linked rows with a right-aligned total count", async () => {
    setup(
      chain({
        steps: [
          {
            kind: "tool",
            id: "t1",
            name: "search",
            title: "Searching revenue",
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
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByText("12 results")).toBeInTheDocument();
    expect(screen.getByText("Revenue Dashboard")).toBeInTheDocument();
    // collection context for a saved item
    expect(screen.getByText("Finance")).toBeInTheDocument();
    // tables prefer display_name, and show their database › schema
    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.queryByText("orders")).not.toBeInTheDocument();
    expect(screen.getByText("Sample DB", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("PUBLIC", { exact: false })).toBeInTheDocument();
  });

  it("shows No results when a search returns nothing", async () => {
    setup(
      chain({
        steps: [
          {
            kind: "tool",
            id: "t1",
            name: "search",
            title: "Searching revenue",
            status: "ended",
            searchResults: { totalCount: 0, results: [] },
          },
        ],
        startedAtMs: 1000,
        endedAtMs: 2000,
      }),
      false,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByText("No results")).toBeInTheDocument();
    expect(screen.queryByText("0 results")).not.toBeInTheDocument();
  });

  it("gives read_resource / load_skill real labels instead of Working", async () => {
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
    expect(screen.getByText("Reading resource")).toBeInTheDocument();
    expect(screen.getByText("Loading skill")).toBeInTheDocument();
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
    expect(screen.getByText("Searching")).toBeInTheDocument();
    expect(screen.queryByText("Working")).not.toBeInTheDocument();
  });
});

import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createExplorationDocument,
  createThread,
} from "metabase/explorations/test-utils";
import type {
  ExplorationDocument,
  VisualizationSettings,
} from "metabase-types/api";

import { GroupDocumentMenu } from "./GroupDocumentMenu";
import type { ExplorationChartForDocumentEmbed } from "./utils";

const mockAppend = jest.fn();
const mockCreate = jest.fn();
const mockToast = jest.fn();

jest.mock("metabase/api/exploration", () => ({
  __esModule: true,
  useAppendChartToDocumentMutation: () => [
    (...args: unknown[]) => mockAppend(...args),
  ],
  useCreateExplorationDocumentMutation: () => [
    (...args: unknown[]) => mockCreate(...args),
  ],
}));

// Stub `useToast` directly at the submodule path so other consumers of
// `metabase/common/hooks` (used by `renderWithProviders`) keep working
// against the real implementation.
jest.mock("metabase/common/hooks/use-toast", () => ({
  __esModule: true,
  useToast: () => [mockToast],
}));

function makeChart(overrides: {
  queryIds: number[];
  label: string;
  display?: ExplorationChartForDocumentEmbed["display"];
  visualization_settings?: VisualizationSettings;
}): ExplorationChartForDocumentEmbed {
  return {
    display: "line",
    visualization_settings: {},
    ...overrides,
  };
}

const defaultCharts: ExplorationChartForDocumentEmbed[] = [
  makeChart({ queryIds: [101], label: "Revenue (US)" }),
  makeChart({ queryIds: [201, 202, 203], label: "Revenue (EU)" }),
];

function makeThread(documents: ExplorationDocument[] = []) {
  return createThread({
    id: 7,
    exploration_id: 99,
    name: null,
    prompt: null,
    position: 0,
    started_at: null,
    completed_at: null,
    entity_id: "thrd00000000000000007",
    created_at: "2026-04-30T00:00:00Z",
    updated_at: "2026-04-30T00:00:00Z",
    documents,
  });
}

function setup({
  documents = [
    createExplorationDocument({
      id: 11,
      name: "Notes",
      content_type: "application/json",
    }),
  ],
  charts = defaultCharts,
}: {
  documents?: ExplorationDocument[];
  charts?: ExplorationChartForDocumentEmbed[];
} = {}) {
  renderWithProviders(
    <GroupDocumentMenu
      charts={charts}
      explorationThread={makeThread(documents)}
      locationSearch="?timeline=1"
    />,
  );
}

beforeEach(() => {
  mockAppend.mockReset();
  mockAppend.mockResolvedValue({
    data: { id: 11, name: "Notes" },
  });
  mockCreate.mockReset();
  mockCreate.mockResolvedValue({
    data: { id: 22, name: "Untitled" },
  });
  mockToast.mockReset();
});

describe("GroupDocumentMenu", () => {
  it("first stage shows the page's charts (one entry per SeriesGroup) — not the documents", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Add to document" }),
    );

    expect(await screen.findByText("Pick a chart")).toBeInTheDocument();
    expect(screen.getByText("Revenue (US)")).toBeInTheDocument();
    expect(screen.getByText("Revenue (EU)")).toBeInTheDocument();
    expect(screen.queryByText("Notes")).not.toBeInTheDocument();
  });

  it("picking a chart advances to the document picker", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Add to document" }),
    );
    await userEvent.click(await screen.findByText("Revenue (US)"));

    expect(await screen.findByText("Add to")).toBeInTheDocument();
    expect(screen.getByText("Notes")).toBeInTheDocument();
    expect(screen.getByText("New document")).toBeInTheDocument();
    // The chart list is no longer shown.
    expect(screen.queryByText("Revenue (EU)")).not.toBeInTheDocument();
  });

  it("Back returns to the chart picker without committing", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Add to document" }),
    );
    await userEvent.click(await screen.findByText("Revenue (US)"));
    await userEvent.click(await screen.findByText("Back"));

    expect(await screen.findByText("Pick a chart")).toBeInTheDocument();
    expect(mockAppend).not.toHaveBeenCalled();
  });

  it("sends the FULL set of source query ids + the FE-computed `display` + `visualization_settings` on the chosen chart", async () => {
    // A multi-query chart (e.g. heat-map or split-panel cartesian)
    // appends its entire query-id list, so the BE materialises one
    // composite ephemeral card instead of N separate embeds.
    setup({
      charts: [
        makeChart({
          queryIds: [101],
          label: "Revenue (US)",
        }),
        makeChart({
          queryIds: [201, 202, 203],
          label: "Revenue (EU)",
          display: "bar",
          visualization_settings: {
            "graph.dimensions": ["created_at", "Series"],
            "graph.split_panels": true,
          },
        }),
      ],
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Add to document" }),
    );
    await userEvent.click(await screen.findByText("Revenue (EU)"));
    await userEvent.click(await screen.findByText("Notes"));

    await waitFor(() => {
      expect(mockAppend).toHaveBeenCalledTimes(1);
    });
    expect(mockAppend).toHaveBeenCalledWith({
      threadId: 7,
      documentId: 11,
      exploration_query_ids: [201, 202, 203],
      display: "bar",
      visualization_settings: {
        "graph.dimensions": ["created_at", "Series"],
        "graph.split_panels": true,
      },
    });
  });

  it("renders one entry per map even when those maps originated from the same SeriesGroup (compose-time expansion)", async () => {
    // The menu doesn't know whether two entries came from the same
    // underlying SeriesGroup — it just renders the `charts` list it's
    // given. This test guarantees the per-map UX works end-to-end: each
    // map is an independent picker entry, and clicking one sends just
    // that map's query id (no composite of the other maps).
    setup({
      charts: [
        makeChart({
          queryIds: [301],
          label: "Sessions in US",
          display: "map",
          visualization_settings: {
            "map.type": "region",
            "map.region": "us_states",
            "map.colors": ["red", "white"],
          },
        }),
        makeChart({
          queryIds: [302],
          label: "Sessions in EU",
          display: "map",
          visualization_settings: {
            "map.type": "region",
            "map.region": "us_states",
            "map.colors": ["blue", "white"],
          },
        }),
      ],
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Add to document" }),
    );

    expect(await screen.findByText("Pick a chart")).toBeInTheDocument();
    expect(screen.getByText("Sessions in US")).toBeInTheDocument();
    expect(screen.getByText("Sessions in EU")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Sessions in EU"));
    await userEvent.click(await screen.findByText("Notes"));

    await waitFor(() => {
      expect(mockAppend).toHaveBeenCalledTimes(1);
    });
    // Only the picked map's query id flows through — no composite.
    expect(mockAppend).toHaveBeenCalledWith({
      threadId: 7,
      documentId: 11,
      exploration_query_ids: [302],
      display: "map",
      visualization_settings: {
        "map.type": "region",
        "map.region": "us_states",
        "map.colors": ["blue", "white"],
      },
    });
  });

  it("New document creates a doc and then appends the picked chart to it", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Add to document" }),
    );
    await userEvent.click(await screen.findByText("Revenue (US)"));
    await userEvent.click(await screen.findByText("New document"));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        threadId: 7,
        explorationId: 99,
      });
    });
    await waitFor(() => {
      expect(mockAppend).toHaveBeenCalledWith({
        threadId: 7,
        documentId: 22, // the freshly-created document
        exploration_query_ids: [101],
        display: "line",
        visualization_settings: {},
      });
    });
  });

  describe("single chart", () => {
    const singleChart = [
      makeChart({
        queryIds: [101],
        label: "Revenue (US)",
        display: "area",
        visualization_settings: { "graph.show_values": true },
      }),
    ];

    it("opens straight to the document picker — no chart list or Back", async () => {
      setup({ charts: singleChart });

      await userEvent.click(
        screen.getByRole("button", { name: "Add to document" }),
      );

      expect(await screen.findByText("Add to")).toBeInTheDocument();
      expect(screen.getByText("Notes")).toBeInTheDocument();
      expect(screen.getByText("New document")).toBeInTheDocument();
      expect(screen.queryByText("Pick a chart")).not.toBeInTheDocument();
      expect(screen.queryByText("Revenue (US)")).not.toBeInTheDocument();
      expect(screen.queryByText("Back")).not.toBeInTheDocument();
    });

    it("appends the lone chart without a chart-selection step", async () => {
      setup({ charts: singleChart });

      await userEvent.click(
        screen.getByRole("button", { name: "Add to document" }),
      );
      await userEvent.click(await screen.findByText("Notes"));

      await waitFor(() => {
        expect(mockAppend).toHaveBeenCalledTimes(1);
      });
      expect(mockAppend).toHaveBeenCalledWith({
        threadId: 7,
        documentId: 11,
        exploration_query_ids: [101],
        display: "area",
        visualization_settings: { "graph.show_values": true },
      });
    });

    it("New document creates a doc and appends the lone chart", async () => {
      setup({ charts: singleChart });

      await userEvent.click(
        screen.getByRole("button", { name: "Add to document" }),
      );
      await userEvent.click(await screen.findByText("New document"));

      await waitFor(() => {
        expect(mockCreate).toHaveBeenCalledWith({
          threadId: 7,
          explorationId: 99,
        });
      });
      await waitFor(() => {
        expect(mockAppend).toHaveBeenCalledWith({
          threadId: 7,
          documentId: 22,
          exploration_query_ids: [101],
          display: "area",
          visualization_settings: { "graph.show_values": true },
        });
      });
    });
  });
});

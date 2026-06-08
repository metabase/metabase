import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  makeMockNavigation,
  makeMockSelection,
} from "metabase/explorations/test-utils";
import type { ExplorationMetric } from "metabase/explorations/types";
import { useMetabotAgent } from "metabase/metabot/hooks";
import { createMockState } from "metabase/redux/store/mocks";
import type { MetricDimension, Timeline } from "metabase-types/api";
import { createMockUser } from "metabase-types/api/mocks";
import {
  createMockMetric,
  createMockMetricDimension,
} from "metabase-types/api/mocks/metric";
import { createMockTimeline } from "metabase-types/api/mocks/timeline";

import { NewExplorationData } from "./NewExplorationData";

jest.mock("metabase/metabot/hooks", () => ({
  ...jest.requireActual("metabase/metabot/hooks"),
  useMetabotAgent: jest.fn(),
}));

const createdAtMonth = createMockMetricDimension({
  id: "orders.created_at.month",
  display_name: "Created At",
  group: {
    id: "orders.created_at",
    type: "main",
    display_name: "Orders",
  },
  sources: [{ type: "field", "field-id": 1 }],
});
const createdAtQuarter = createMockMetricDimension({
  id: "orders.created_at.quarter",
  display_name: "Created At",
  group: {
    id: "orders.created_at",
    type: "main",
    display_name: "Orders",
  },
  sources: [{ type: "field", "field-id": 1 }],
});
const plan = createMockMetricDimension({
  id: "accounts.plan",
  display_name: "Plan",
  sources: [{ type: "field", "field-id": 2 }],
});

function setup({
  metrics = [],
  dimensions = [],
  timelines = [],
  personalCollectionId = 7,
}: {
  metrics?: ExplorationMetric[];
  dimensions?: MetricDimension[];
  timelines?: Timeline[];
  personalCollectionId?: number | null;
} = {}) {
  jest.mocked(useMetabotAgent).mockReturnValue({
    messages: [],
  } as any);

  const selection = makeMockSelection({ metrics, dimensions, timelines });
  const navigation = makeMockNavigation();

  renderWithProviders(
    <NewExplorationData selection={selection} navigation={navigation} />,
    {
      storeInitialState: createMockState({
        currentUser: createMockUser({
          personal_collection_id: personalCollectionId ?? undefined,
        }),
      }),
    },
  );

  return { selection, navigation };
}

afterEach(() => {
  fetchMock.removeRoutes();
  fetchMock.clearHistory();
});

describe("NewExplorationData", () => {
  describe("section accordion", () => {
    it("always renders Metrics, Dimensions and Timelines accordion sections", () => {
      setup();

      expect(screen.getByText("Metrics")).toBeInTheDocument();
      expect(screen.getByText("Dimensions")).toBeInTheDocument();
      expect(screen.getByText("Timelines")).toBeInTheDocument();
    });

    it("shows empty-state copy inside each section when nothing is selected", () => {
      setup();

      expect(
        screen.getByText(/Add metrics you.re interested in/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/work backwards by specifying a dimension/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Add timelines to see if events shed light/),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Begin research" }),
      ).toBeDisabled();
    });

    it("clicking the Metrics + opens Browse on the metrics tab", async () => {
      const { navigation } = setup();

      await userEvent.click(
        screen.getByRole("button", { name: "Add metrics" }),
      );

      expect(navigation.openBrowse).toHaveBeenCalledTimes(1);
      expect(navigation.openBrowse).toHaveBeenCalledWith("metrics");
    });

    it("clicking the Dimensions + opens Browse on the dimensions tab", async () => {
      const { navigation } = setup();

      await userEvent.click(
        screen.getByRole("button", { name: "Add dimensions" }),
      );

      expect(navigation.openBrowse).toHaveBeenCalledTimes(1);
      expect(navigation.openBrowse).toHaveBeenCalledWith("dimensions");
    });

    it("clicking the Timelines + opens Browse on the timelines tab", async () => {
      const { navigation } = setup();

      await userEvent.click(
        screen.getByRole("button", { name: "Add timelines" }),
      );

      expect(navigation.openBrowse).toHaveBeenCalledTimes(1);
      expect(navigation.openBrowse).toHaveBeenCalledWith("timelines");
    });
  });

  describe("removing pills", () => {
    it("removes all dimensions represented by a grouped dimension pill", async () => {
      const { selection } = setup({
        dimensions: [createdAtMonth, createdAtQuarter, plan],
      });

      expect(screen.getByText("Orders → Created At")).toBeInTheDocument();

      await userEvent.click(
        screen.getAllByRole("button", { name: "Remove" })[0],
      );

      expect(selection.setDimensions).toHaveBeenCalledTimes(1);
      expect(selection.setDimensions).toHaveBeenCalledWith([plan]);
    });

    describe("removing a metric pill", () => {
      const revenueMetric = createMockMetric({
        id: 1,
        name: "Revenue",
        dimension_ids: [createdAtMonth.id, plan.id],
      }) as ExplorationMetric;
      const churnMetric = createMockMetric({
        id: 2,
        name: "Churn",
        dimension_ids: [plan.id],
      }) as ExplorationMetric;

      /**
       * Mantine `Pill`'s remove button uses a generic `aria-label="Remove"`
       * for every pill, so we resolve which button to click by index. The
       * metric `PillList` renders before the dimension `PillList` in the
       * DOM, so the first `metrics.length` Remove buttons are the metric
       * pills (in `metrics` order), followed by the dimension pills.
       */
      function clickMetricRemove(index: number): Promise<void> {
        return userEvent.click(
          screen.getAllByRole("button", { name: "Remove" })[index],
        );
      }

      it("drops dimensions that no remaining metric uses", async () => {
        const { selection } = setup({
          metrics: [revenueMetric],
          dimensions: [createdAtMonth, plan],
        });

        await clickMetricRemove(0);

        expect(selection.setMetrics).toHaveBeenCalledWith([]);
        expect(selection.setDimensions).toHaveBeenCalledWith([]);
      });

      it("keeps dimensions still used by another metric", async () => {
        const { selection } = setup({
          metrics: [revenueMetric, churnMetric],
          dimensions: [createdAtMonth, plan],
        });

        await clickMetricRemove(0);

        expect(selection.setMetrics).toHaveBeenCalledWith([churnMetric]);
        expect(selection.setDimensions).toHaveBeenCalledWith([plan]);
      });

      it("does not call setDimensions when no dimensions need to be dropped", async () => {
        const extraDim = createMockMetricDimension({
          id: "accounts.region",
          display_name: "Region",
          sources: [{ type: "field", "field-id": 3 }],
        });
        const { selection } = setup({
          metrics: [revenueMetric, churnMetric],
          dimensions: [plan, extraDim],
        });

        await clickMetricRemove(1);

        expect(selection.setMetrics).toHaveBeenCalledWith([revenueMetric]);
        expect(selection.setDimensions).not.toHaveBeenCalled();
      });
    });

    it("removing a timeline pill routes through selection.toggleTimeline", async () => {
      const timeline = createMockTimeline({ id: 99, name: "Releases" });
      const { selection } = setup({ timelines: [timeline] });

      expect(screen.getByText("Releases")).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Remove" }));

      expect(selection.toggleTimeline).toHaveBeenCalledTimes(1);
      expect(selection.toggleTimeline).toHaveBeenCalledWith(timeline);
    });
  });

  describe("begin research", () => {
    const revenueMetric = createMockMetric({
      id: 1,
      name: "Revenue",
    }) as ExplorationMetric;

    it("creates the exploration in the user's personal collection", async () => {
      fetchMock.post("path:/api/exploration", { id: 42, threads: [] });
      setup({
        metrics: [revenueMetric],
        dimensions: [plan],
        personalCollectionId: 7,
      });

      await userEvent.click(
        screen.getByRole("button", { name: "Begin research" }),
      );

      await waitFor(() => {
        expect(fetchMock.callHistory.called("path:/api/exploration")).toBe(
          true,
        );
      });
      const call = fetchMock.callHistory.calls("path:/api/exploration")[0];
      const body = JSON.parse(call.options.body as string);
      expect(body.collection_id).toBe(7);
    });
  });
});

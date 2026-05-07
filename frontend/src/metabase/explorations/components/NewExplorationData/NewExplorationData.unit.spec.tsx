import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type { ExplorationMetric } from "metabase/explorations/types";
import { useMetabotAgent } from "metabase/metabot/hooks";
import type { MetricDimension } from "metabase-types/api";
import {
  createMockMetric,
  createMockMetricDimension,
} from "metabase-types/api/mocks/metric";

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
}: {
  metrics?: ExplorationMetric[];
  dimensions?: MetricDimension[];
} = {}) {
  jest.mocked(useMetabotAgent).mockReturnValue({
    messages: [],
  } as any);

  const setMetrics = jest.fn();
  const setDimensions = jest.fn();
  const setTimelines = jest.fn();

  renderWithProviders(
    <NewExplorationData
      metrics={metrics}
      setMetrics={setMetrics}
      dimensions={dimensions}
      setDimensions={setDimensions}
      timelines={[]}
      setTimelines={setTimelines}
      name={null}
    />,
  );

  return { setMetrics, setDimensions, setTimelines };
}

describe("NewExplorationData", () => {
  it("removes all dimensions represented by a grouped dimension pill", async () => {
    const { setDimensions } = setup({
      dimensions: [createdAtMonth, createdAtQuarter, plan],
    });

    expect(screen.getByText("Orders - Created At")).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);

    expect(setDimensions).toHaveBeenCalledTimes(1);
    expect(setDimensions).toHaveBeenCalledWith([plan]);
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
      const { setMetrics, setDimensions } = setup({
        metrics: [revenueMetric],
        dimensions: [createdAtMonth, plan],
      });

      // Index 0 = Revenue (the only metric). Removing it orphans both
      // dimensions.
      await clickMetricRemove(0);

      expect(setMetrics).toHaveBeenCalledWith([]);
      expect(setDimensions).toHaveBeenCalledWith([]);
    });

    it("keeps dimensions still used by another metric", async () => {
      const { setMetrics, setDimensions } = setup({
        metrics: [revenueMetric, churnMetric],
        dimensions: [createdAtMonth, plan],
      });

      // Index 0 = Revenue. createdAt is orphaned (only Revenue used it);
      // Plan stays (Churn still uses it).
      await clickMetricRemove(0);

      expect(setMetrics).toHaveBeenCalledWith([churnMetric]);
      expect(setDimensions).toHaveBeenCalledWith([plan]);
    });

    it("does not call setDimensions when no dimensions need to be dropped", async () => {
      // Revenue uses [createdAt, plan]; an extra user-added dimension that
      // no metric references should NOT be dropped, and setDimensions
      // should not be called when the metric's dims are still used.
      const extraDim = createMockMetricDimension({
        id: "accounts.region",
        display_name: "Region",
        sources: [{ type: "field", "field-id": 3 }],
      });
      const { setMetrics, setDimensions } = setup({
        metrics: [revenueMetric, churnMetric],
        dimensions: [plan, extraDim],
      });

      // Index 1 = Churn. Churn only uses `plan`, which Revenue also
      // uses, so no dimensions become orphaned.
      await clickMetricRemove(1);

      expect(setMetrics).toHaveBeenCalledWith([revenueMetric]);
      expect(setDimensions).not.toHaveBeenCalled();
    });
  });
});

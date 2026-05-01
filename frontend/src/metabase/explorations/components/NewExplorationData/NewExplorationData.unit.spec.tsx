import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { useMetabotAgent } from "metabase/metabot/hooks";
import type { MetricDimension } from "metabase-types/api";
import { createMockMetricDimension } from "metabase-types/api/mocks/metric";

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
  dimensions = [],
}: {
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
      metrics={[]}
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
});

import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import {
  trackMetricsViewerFilterEdited,
  trackMetricsViewerFilterRemoved,
} from "metabase/metrics-viewer/analytics";
import type { DefinitionSource } from "metabase/metrics-viewer/utils/definition-sources";
import type * as LibMetric from "metabase-lib/metric";
import * as LibMetricModule from "metabase-lib/metric";

import { MetricsSegmentFilterPillPopover } from "./MetricsSegmentFilterPillPopover";

jest.mock("metabase-lib/metric", () => ({
  __esModule: true,
  removeClause: jest.fn(),
}));

jest.mock("metabase/metrics-viewer/analytics", () => ({
  __esModule: true,
  trackMetricsViewerFilterEdited: jest.fn(),
  trackMetricsViewerFilterRemoved: jest.fn(),
}));

jest.mock("../FilterPopover/FilterPopoverContent", () => ({
  __esModule: true,
  FilterPopoverContent: ({
    definitionSources,
    onSourceDefinitionChange,
    onFilterApplied,
  }: {
    definitionSources: { definition: unknown }[];
    onSourceDefinitionChange: (source: unknown, def: unknown) => void;
    onFilterApplied: () => void;
  }) => (
    <div data-testid="filter-popover-content">
      <button
        data-testid="apply-stub"
        onClick={() => {
          onSourceDefinitionChange(definitionSources[0], {
            __after: "filter-popover-apply",
          } as unknown);
          onFilterApplied();
        }}
      >
        Apply
      </button>
    </div>
  ),
}));

const mockLibMetric = LibMetricModule as jest.Mocked<typeof LibMetric>;
const mockTrackEdited = trackMetricsViewerFilterEdited as jest.MockedFunction<
  typeof trackMetricsViewerFilterEdited
>;
const mockTrackRemoved = trackMetricsViewerFilterRemoved as jest.MockedFunction<
  typeof trackMetricsViewerFilterRemoved
>;

function makeDefinitionSource(): DefinitionSource {
  return {
    index: 0,
    id: "src-0" as DefinitionSource["id"],
    definition: { __fakeDef: 0 } as unknown as LibMetric.MetricDefinition,
    entity: {} as DefinitionSource["entity"],
    entityIndex: 0,
    token: undefined,
  };
}

const oldFilter = {
  __clause: "old-segment",
} as unknown as LibMetric.FilterClause;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("MetricsSegmentFilterPillPopover", () => {
  it("renders the segment name on the pill", () => {
    renderWithProviders(
      <MetricsSegmentFilterPillPopover
        definitionSource={makeDefinitionSource()}
        oldFilter={oldFilter}
        colors={["#ff0000"]}
        metricColors={{ 0: ["#ff0000"] }}
        segmentName="Active customers"
        onSourceDefinitionChange={jest.fn()}
        onRemove={jest.fn()}
      />,
    );

    expect(screen.getByText("Active customers")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Segment filter: Active customers"),
    ).toBeInTheDocument();
  });

  it("opens the popover with FilterPopoverContent when the pill is clicked", async () => {
    renderWithProviders(
      <MetricsSegmentFilterPillPopover
        definitionSource={makeDefinitionSource()}
        oldFilter={oldFilter}
        colors={["#ff0000"]}
        metricColors={{ 0: ["#ff0000"] }}
        segmentName="Active customers"
        onSourceDefinitionChange={jest.fn()}
        onRemove={jest.fn()}
      />,
    );

    expect(
      screen.queryByTestId("filter-popover-content"),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByLabelText("Segment filter: Active customers"),
    );

    expect(screen.getByTestId("filter-popover-content")).toBeInTheDocument();
  });

  it("removes the original segment from the picked definition before propagating up", async () => {
    const source = makeDefinitionSource();
    const replaced = {
      __after: "old-segment-removed",
    } as unknown as LibMetric.MetricDefinition;
    mockLibMetric.removeClause.mockReturnValue(replaced);
    const handleChange = jest.fn();

    renderWithProviders(
      <MetricsSegmentFilterPillPopover
        definitionSource={source}
        oldFilter={oldFilter}
        colors={["#ff0000"]}
        metricColors={{ 0: ["#ff0000"] }}
        segmentName="Active customers"
        onSourceDefinitionChange={handleChange}
        onRemove={jest.fn()}
      />,
    );

    await userEvent.click(
      screen.getByLabelText("Segment filter: Active customers"),
    );
    await userEvent.click(screen.getByTestId("apply-stub"));

    // The popover content's "applied" definition is piped through
    // removeClause(_, oldFilter) so the new selection effectively
    // replaces the original segment.
    expect(mockLibMetric.removeClause).toHaveBeenCalledWith(
      { __after: "filter-popover-apply" },
      oldFilter,
    );
    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith(source, replaced);
    expect(mockTrackEdited).toHaveBeenCalledWith("metric_filter");
  });

  it("invokes onRemove and tracks analytics when the X is clicked", async () => {
    const handleRemove = jest.fn();
    renderWithProviders(
      <MetricsSegmentFilterPillPopover
        definitionSource={makeDefinitionSource()}
        oldFilter={oldFilter}
        colors={["#ff0000"]}
        metricColors={{ 0: ["#ff0000"] }}
        segmentName="Active customers"
        onSourceDefinitionChange={jest.fn()}
        onRemove={handleRemove}
      />,
    );

    await userEvent.click(screen.getByLabelText("Remove"));

    expect(handleRemove).toHaveBeenCalledTimes(1);
    expect(mockTrackRemoved).toHaveBeenCalledWith("metric_filter");
  });
});

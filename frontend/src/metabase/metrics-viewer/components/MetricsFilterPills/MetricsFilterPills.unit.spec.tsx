import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type { DefinitionSource } from "metabase/metrics-viewer/utils/definition-sources";
import type * as LibMetric from "metabase-lib/metric";
import * as LibMetricModule from "metabase-lib/metric";

import { MetricsFilterPills } from "./MetricsFilterPills";

jest.mock("metabase-lib/metric", () => ({
  __esModule: true,
  filters: jest.fn(),
  isSegmentFilter: jest.fn(),
  segmentMetadataForFilter: jest.fn(),
  displayInfo: jest.fn(),
  replaceClause: jest.fn(),
  removeClause: jest.fn(),
}));

jest.mock("metabase/metrics-viewer/analytics", () => ({
  __esModule: true,
  trackMetricsViewerFilterRemoved: jest.fn(),
  trackMetricsViewerFilterEdited: jest.fn(),
}));

jest.mock("metabase/metrics-viewer/utils/definition-sources", () => ({
  __esModule: true,
  getDefinitionSourceIcon: jest.fn(() => "metric" as const),
  getDefinitionSourceName: jest.fn(() => "Revenue"),
}));

jest.mock("metabase/metrics-viewer/types/viewer-state", () => ({
  __esModule: true,
  isExpressionEntry: jest.fn(() => false),
}));

// Avoid pulling the FilterPicker dependency tree into the unit test.
jest.mock("./MetricsFilterPillPopover", () => ({
  __esModule: true,
  MetricsFilterPillPopover: ({
    metricName,
    onRemove,
  }: {
    metricName?: string;
    onRemove: () => void;
  }) => (
    <button data-testid="non-segment-pill" onClick={onRemove}>
      {metricName ?? "filter-pill"}
    </button>
  ),
}));

// Same: avoid pulling FilterPopoverContent into the unit test —
// behavior of the segment popover is covered by its own spec.
jest.mock("./MetricsSegmentFilterPillPopover", () => ({
  __esModule: true,
  MetricsSegmentFilterPillPopover: ({
    segmentName,
    onRemove,
  }: {
    segmentName?: string;
    onRemove: () => void;
  }) => (
    <button
      data-testid="segment-pill"
      aria-label={`Segment filter: ${segmentName ?? ""}`}
      onClick={onRemove}
    >
      {segmentName}
    </button>
  ),
}));

const mockLibMetric = LibMetricModule as jest.Mocked<typeof LibMetric>;

function makeDefinitionSource(
  index: number,
  overrides: Partial<DefinitionSource> = {},
): DefinitionSource {
  return {
    index,
    id: `src-${index}` as DefinitionSource["id"],
    definition: { __fakeDef: index } as unknown as LibMetric.MetricDefinition,
    entity: {
      type: "metric",
      id: index,
    } as unknown as DefinitionSource["entity"],
    entityIndex: index,
    token: undefined,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("MetricsFilterPills", () => {
  it("renders a segment-iconed pill for a segment filter with its display name", () => {
    const source = makeDefinitionSource(0);
    const segmentClause = {
      __clause: "segment",
    } as unknown as LibMetric.FilterClause;
    const segmentMetadata = {
      __seg: "active",
    } as unknown as LibMetric.SegmentMetadata;

    mockLibMetric.filters.mockReturnValue([segmentClause]);
    mockLibMetric.isSegmentFilter.mockReturnValue(true);
    mockLibMetric.segmentMetadataForFilter.mockReturnValue(segmentMetadata);
    mockLibMetric.displayInfo.mockReturnValue({
      displayName: "Active customers",
    } as ReturnType<typeof LibMetric.displayInfo>);

    renderWithProviders(
      <MetricsFilterPills
        definitionSources={[source]}
        sourceColors={{ 0: ["#ff0000"] }}
        onSourceDefinitionChange={jest.fn()}
      />,
    );

    expect(screen.getByText("Active customers")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Segment filter: Active customers"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("segment-pill")).toBeInTheDocument();
    // Non-segment popover pill should NOT render for a segment filter.
    expect(screen.queryByTestId("non-segment-pill")).not.toBeInTheDocument();
  });

  it("calls removeClause when segment pill remove is invoked", async () => {
    const source = makeDefinitionSource(0);
    const segmentClause = {
      __clause: "segment",
    } as unknown as LibMetric.FilterClause;
    const segmentMetadata = {
      __seg: "active",
    } as unknown as LibMetric.SegmentMetadata;
    const newDefinition = {
      __fakeDef: "after-remove",
    } as unknown as LibMetric.MetricDefinition;

    mockLibMetric.filters.mockReturnValue([segmentClause]);
    mockLibMetric.isSegmentFilter.mockReturnValue(true);
    mockLibMetric.segmentMetadataForFilter.mockReturnValue(segmentMetadata);
    mockLibMetric.displayInfo.mockReturnValue({
      displayName: "Active customers",
    } as ReturnType<typeof LibMetric.displayInfo>);
    mockLibMetric.removeClause.mockReturnValue(newDefinition);

    const handleChange = jest.fn();
    renderWithProviders(
      <MetricsFilterPills
        definitionSources={[source]}
        sourceColors={{ 0: ["#ff0000"] }}
        onSourceDefinitionChange={handleChange}
      />,
    );

    await userEvent.click(screen.getByTestId("segment-pill"));

    expect(mockLibMetric.removeClause).toHaveBeenCalledWith(
      source.definition,
      segmentClause,
    );
    expect(handleChange).toHaveBeenCalledWith(source, newDefinition);
  });

  it("uses the popover pill for regular (non-segment) filter clauses", () => {
    const source = makeDefinitionSource(0);
    const normalClause = {
      __clause: "normal",
    } as unknown as LibMetric.FilterClause;

    mockLibMetric.filters.mockReturnValue([normalClause]);
    mockLibMetric.isSegmentFilter.mockReturnValue(false);

    renderWithProviders(
      <MetricsFilterPills
        definitionSources={[source]}
        sourceColors={{ 0: ["#ff0000"] }}
        onSourceDefinitionChange={jest.fn()}
      />,
    );

    expect(screen.getByTestId("non-segment-pill")).toBeInTheDocument();
  });
});

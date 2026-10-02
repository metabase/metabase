import { renderWithProviders, screen } from "__support__/ui";
import * as LibMetric from "metabase-lib/metric";
import {
  createMetricMetadata,
  setupDefinition,
} from "metabase-lib/v1/metric/test-helpers";
import {
  createMockMetricDimension,
  createMockNormalizedMetric,
} from "metabase-types/api/mocks/metric";

import { DateFilterSection } from "./DateFilterSection";

const metric = createMockNormalizedMetric({
  id: 1,
  dimensions: [
    createMockMetricDimension({
      id: "dim-created-at",
      display_name: "Created At",
      effective_type: "type/DateTime",
    }),
  ],
});
const metadata = createMetricMetadata([metric]);

function setup(
  definition: LibMetric.MetricDefinition,
  filter: LibMetric.FilterClause,
) {
  return renderWithProviders(
    <DateFilterSection
      definition={definition}
      filter={filter}
      onRemove={jest.fn()}
    />,
  );
}

describe("DateFilterSection", () => {
  it.each(["second", "millisecond", "day"] as const)(
    "renders relative %s filters",
    (unit) => {
      const definition = setupDefinition(metadata, metric.id);
      const [dimension] = LibMetric.filterableDimensions(definition);
      const filter = LibMetric.relativeDateFilterClause({
        dimension,
        unit,
        value: -2,
      });
      setup(definition, filter);
      expect(screen.getByText(`Previous 2 ${unit}s`)).toBeInTheDocument();
      expect(screen.getByText("Created At")).toBeInTheDocument();
    },
  );

  it("does not render or throw for an unreadable persisted date", () => {
    const instanceUuid = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const definition = LibMetric.fromJsMetricDefinition(
      LibMetric.metadataProvider(metadata),
      {
        expression: ["metric", { "lib/uuid": instanceUuid }, metric.id],
        filters: [
          {
            "lib/uuid": instanceUuid,
            filter: [
              "=",
              {},
              ["dimension", {}, "dim-created-at"],
              "Invalid Date",
            ],
          },
        ],
      },
    );
    const [filter] = LibMetric.filters(definition);
    setup(definition, filter);
    expect(screen.queryByText("Created At")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove" }),
    ).not.toBeInTheDocument();
  });
});

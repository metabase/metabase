import { renderWithProviders, screen } from "__support__/ui";
import { decodeState } from "metabase/common/metrics-viewer";
import { utf8_to_b64url } from "metabase/utils/encoding";
import * as LibMetric from "metabase-lib/metric";
import {
  createMetricMetadata,
  setupDefinition,
} from "metabase-lib/v1/metric/test-helpers";
import {
  createMockMetricDimension,
  createMockNormalizedMetric,
} from "metabase-types/api/mocks/metric";

import { DimensionFilterButton } from "./DimensionFilterButton";

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

function setup(date: string) {
  const state = decodeState(
    utf8_to_b64url(
      JSON.stringify({
        t: [
          {
            i: "time",
            t: "time",
            p: {
              f: {
                type: "specific-date",
                operator: "=",
                values: [date],
                hasTime: false,
              },
            },
          },
        ],
        a: "time",
      }),
    ),
  );
  const definition = setupDefinition(createMetricMetadata([metric]), metric.id);
  const [filterDimension] = LibMetric.filterableDimensions(definition);
  renderWithProviders(
    <DimensionFilterButton
      definition={definition}
      filterDimension={filterDimension}
      dimensionFilter={
        state.dimensionBreakouts[0].projectionConfig?.dimensionFilter
      }
      onChange={jest.fn()}
    />,
  );
}

describe("DimensionFilterButton URL projection filters", () => {
  it.each(["not-a-date", "Invalid Date"])(
    "renders all time for an unreadable URL date %s",
    (date) => {
      setup(date);
      expect(
        screen.getByRole("button", { name: "All time" }),
      ).toBeInTheDocument();
    },
  );

  it("renders a valid URL date filter", () => {
    setup("2024-01-01T00:00:00");
    expect(
      screen.getByRole("button", { name: "January 1, 2024" }),
    ).toBeInTheDocument();
  });
});

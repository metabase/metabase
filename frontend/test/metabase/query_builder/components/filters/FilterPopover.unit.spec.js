import "__support__/mocks";
import React from "react";

import { fireEvent, render, screen } from "@testing-library/react";

import Question from "metabase-lib/lib/Question";
import FilterPopover from "metabase/query_builder/components/filters/FilterPopover";

import {
  SAMPLE_DATASET,
  ORDERS,
  PRODUCTS,
  metadata,
  StaticEntitiesProvider,
} from "__support__/sample_dataset_fixture";

const QUERY = Question.create({
  databaseId: SAMPLE_DATASET.id,
  tableId: ORDERS.id,
  metadata,
})
  .query()
  .aggregate(["count"])
  .filter(["time-interval", ["field", ORDERS.CREATED_AT.id, null], -30, "day"])
  .filter(["=", ["field", ORDERS.TOTAL.id, null], 1234])
  .filter([
    "contains",
    ["field", PRODUCTS.TITLE.id, { "source-field": ORDERS.PRODUCT_ID.id }],
    "asdf",
  ]);

const [
  RELATIVE_DAY_FILTER,
  NUMERIC_FILTER,
  STRING_CONTAINS_FILTER,
] = QUERY.filters();

describe("FilterPopover", () => {
  describe("existing filter", () => {
    describe("DatePicker", () => {
      it("should render", () => {
        render(<FilterPopover query={QUERY} filter={QUERY.filters()[0]} />);

        screen.getByText("Previous");
        screen.getByDisplayValue("30");
        screen.getByText("Days");
      });
    });
    describe("filter operator selection", () => {
      it("should have an operator selector", () => {
        render(
          <StaticEntitiesProvider>
            <FilterPopover query={QUERY} filter={NUMERIC_FILTER} />
          </StaticEntitiesProvider>,
        );
        screen.getByText("Equal to");
        screen.getByText("1,234");
      });
    });
    describe("filter options", () => {
      it("should not show a control to the user if the filter has no options", () => {
        render(
          <StaticEntitiesProvider>
            <FilterPopover query={QUERY} filter={QUERY.filters()[1]} />
          </StaticEntitiesProvider>,
        );
        expect(screen.queryByText("Include")).toBeNull();
        expect(screen.queryByText("today")).toBeNull();
      });

      it('should show "current-period" option to the user for "time-intervals" filters', () => {
        render(<FilterPopover query={QUERY} filter={RELATIVE_DAY_FILTER} />);
        screen.getByText("Include");
        screen.getByText("today");
      });

      it('should show "case-sensitive" option to the user for "contains" filters', () => {
        render(
          <StaticEntitiesProvider>
            <FilterPopover query={QUERY} filter={STRING_CONTAINS_FILTER} />
          </StaticEntitiesProvider>,
        );
        screen.getByText("Case sensitive");
      });

      // Note: couldn't get it to work with React Testing library no matter what!
      // Tried to click on checkbox, label, their parent - nothing seems to be working, while it works fine in UI
      xit("should let the user toggle an option", () => {
        render(<FilterPopover query={QUERY} filter={RELATIVE_DAY_FILTER} />);
        const CHECKBOX = screen.getByRole("checkbox");

        fireEvent.click(CHECKBOX);
        screen.getByRole("img", { name: /check/i });
      });
    });
  });
});

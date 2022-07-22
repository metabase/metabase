import "__support__/ui-mocks";
import React from "react";

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Question from "metabase-lib/lib/Question";
import FilterPopover from "./FilterPopover";
import Filter from "metabase-lib/lib/queries/structured/Filter";

import { renderWithProviders } from "__support__/ui";

import {
  SAMPLE_DATABASE,
  ORDERS,
  PRODUCTS,
  metadata,
} from "__support__/sample_database_fixture";

const QUERY = Question.create({
  databaseId: SAMPLE_DATABASE?.id,
  tableId: ORDERS.id,
  metadata,
})
  .query()
  // eslint-disable-next-line
  // @ts-ignore
  .aggregate(["count"])
  .filter(["time-interval", ["field", ORDERS.CREATED_AT.id, null], -30, "day"])
  .filter(["=", ["field", ORDERS.TOTAL.id, null], 1234])
  .filter([
    "contains",
    ["field", PRODUCTS.TITLE.id, { "source-field": ORDERS.PRODUCT_ID.id }],
    "asdf",
  ]);

const [RELATIVE_DAY_FILTER, NUMERIC_FILTER, STRING_CONTAINS_FILTER] =
  QUERY.filters();

const dummyFunction = jest.fn();

describe("FilterPopover", () => {
  describe("existing filter", () => {
    describe("DatePicker", () => {
      it("should render a date picker for a date filter", () => {
        const filter = new Filter(RELATIVE_DAY_FILTER, null, QUERY);

        render(
          <FilterPopover
            query={QUERY}
            filter={filter}
            onChangeFilter={dummyFunction}
          />,
        );

        screen.getByTestId("date-picker");
      });
    });
    describe("filter operator selection", () => {
      it("should have an operator selector", () => {
        const filter = new Filter(NUMERIC_FILTER, null, QUERY);
        renderWithProviders(
          <FilterPopover
            query={QUERY}
            filter={filter}
            onChangeFilter={dummyFunction}
          />,
        );
        screen.getByText("Equal to");
        screen.getByText("1,234");
      });
    });
    describe("filter options", () => {
      it("should not show a control to the user if the filter has no options", () => {
        const filter = new Filter(RELATIVE_DAY_FILTER, null, QUERY);
        renderWithProviders(
          <FilterPopover
            query={QUERY}
            filter={filter}
            onChange={dummyFunction}
            onChangeFilter={dummyFunction}
          />,
        );
        expect(screen.queryByText("Include")).toBeNull();
        expect(screen.queryByText("today")).toBeNull();
      });

      it('should show "case-sensitive" option to the user for "contains" filters', () => {
        const filter = new Filter(STRING_CONTAINS_FILTER, null, QUERY);
        renderWithProviders(
          <FilterPopover
            query={QUERY}
            filter={filter}
            onChangeFilter={dummyFunction}
          />,
        );
        screen.getByText("Case sensitive");
      });

      // Note: couldn't get it to work with React Testing library no matter what!
      // Tried to click on checkbox, label, their parent - nothing seems to be working, while it works fine in UI
      it.skip("should let the user toggle an option", async () => {
        const filter = new Filter(RELATIVE_DAY_FILTER, null, QUERY);
        renderWithProviders(
          <FilterPopover
            query={QUERY}
            filter={filter}
            onChangeFilter={dummyFunction}
          />,
        );
        const ellipsis = screen.getByLabelText("ellipsis icon");
        fireEvent.click(ellipsis);
        const includeToday = await screen.findByText("Include today");
        fireEvent.click(includeToday);
      });

      it.skip("should let the user toggle a date filter type", async () => {
        const filter = new Filter(RELATIVE_DAY_FILTER, null, QUERY);
        renderWithProviders(
          <FilterPopover
            query={QUERY}
            filter={filter}
            onChangeFilter={dummyFunction}
          />,
        );
        const back = screen.getByLabelText("chevronleft icon");
        userEvent.click(back);
        await screen.findByTestId("date-picker-shortcuts");
      });

      it.skip("should let the user toggle a text filter type", async () => {
        const filter = new Filter(STRING_CONTAINS_FILTER, null, QUERY);
        renderWithProviders(
          <FilterPopover
            query={QUERY}
            filter={filter}
            onChangeFilter={dummyFunction}
          />,
        );
        userEvent.click(await screen.findByText("Contains"));
        userEvent.click(await screen.findByText("Is"));

        await screen.findByTestId("date-picker-shortcuts");
      });
    });
  });
});

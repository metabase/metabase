import "__support__/ui-mocks";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders } from "__support__/ui";
import {
  createSampleDatabase,
  SAMPLE_DB_ID,
  ORDERS_ID,
  ORDERS,
  PRODUCTS,
} from "metabase-types/api/mocks/presets";
import Question from "metabase-lib/Question";
import Filter from "metabase-lib/queries/structured/Filter";
import FilterPopover from "./FilterPopover";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const QUERY = Question.create({
  databaseId: SAMPLE_DB_ID,
  tableId: ORDERS_ID,
  metadata,
})
  .query()
  // eslint-disable-next-line
  // @ts-ignore
  .aggregate(["count"])
  .filter(["time-interval", ["field", ORDERS.CREATED_AT, null], -30, "day"])
  .filter(["=", ["field", ORDERS.TOTAL, null], 1234])
  .filter([
    "contains",
    ["field", PRODUCTS.TITLE, { "source-field": ORDERS.PRODUCT_ID }],
    "asdf",
  ])
  .filter(["is-empty", ["field", PRODUCTS.TITLE, null]]);
const [
  RELATIVE_DAY_FILTER,
  NUMERIC_FILTER,
  STRING_CONTAINS_FILTER,
  IS_EMPTY_FILTER,
] = QUERY.filters();

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

        expect(screen.getByTestId("date-picker")).toBeInTheDocument();
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
        expect(screen.getByText("Equal to")).toBeInTheDocument();
        expect(screen.getByText("1,234")).toBeInTheDocument();
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
        expect(screen.queryByText("Include")).not.toBeInTheDocument();
        expect(screen.queryByText("today")).not.toBeInTheDocument();
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
        expect(screen.getByText("Case sensitive")).toBeInTheDocument();
      });

      // Note: couldn't get it to work with React Testing library no matter what!
      // Tried to click on checkbox, label, their parent - nothing seems to be working, while it works fine in UI
      // eslint-disable-next-line jest/no-disabled-tests, jest/expect-expect
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
        userEvent.click(ellipsis);
        const includeToday = await screen.findByText("Include today");
        userEvent.click(includeToday);
      });

      // eslint-disable-next-line jest/no-disabled-tests
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
        expect(
          await screen.findByTestId("date-picker-shortcuts"),
        ).toBeInTheDocument();
      });

      // eslint-disable-next-line jest/no-disabled-tests
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

        expect(
          await screen.findByTestId("date-picker-shortcuts"),
        ).toBeInTheDocument();
      });
    });
  });
  describe("filter rendering", () => {
    beforeEach(() => {
      jest.unmock("metabase/components/Popover");
    });

    it("should not render filter picker when filter type is 'Is empty'", async () => {
      const filter = new Filter(IS_EMPTY_FILTER, null, QUERY);
      renderWithProviders(
        <FilterPopover
          query={QUERY}
          filter={filter}
          onChangeFilter={dummyFunction}
        />,
      );

      expect(screen.getByTestId("select-button-content")).toHaveTextContent(
        "Is empty",
      );

      expect(
        screen.getByTestId("default-picker-container").childNodes.length,
      ).toBe(0);
    });

    it("should render a space for a filter if filter is not 'empty' or 'not empty'", async () => {
      const filter = new Filter(STRING_CONTAINS_FILTER, null, QUERY);
      renderWithProviders(
        <FilterPopover
          query={QUERY}
          filter={filter}
          onChangeFilter={dummyFunction}
        />,
      );

      expect(screen.getByTestId("select-button-content")).toHaveTextContent(
        "Contains",
      );

      expect(
        screen.getByTestId("default-picker-container").childNodes.length,
      ).toBeGreaterThan(0);
    });
  });
});

import "__support__/ui-mocks";

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders } from "__support__/ui";
import Question from "metabase-lib/v1/Question";
import type StructuredQuery from "metabase-lib/v1/queries/StructuredQuery";
import Filter from "metabase-lib/v1/queries/structured/Filter";
import {
  createSampleDatabase,
  SAMPLE_DB_ID,
  ORDERS_ID,
  ORDERS,
  PRODUCTS,
} from "metabase-types/api/mocks/presets";

import { FilterPopover } from "./FilterPopover";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const QUERY = Question.create({
  databaseId: SAMPLE_DB_ID,
  tableId: ORDERS_ID,
  metadata,
})
  .legacyQuery({ useStructuredQuery: true })
  .aggregate(["count"])
  .filter(["time-interval", ["field", ORDERS.CREATED_AT, null], -30, "day"])
  .filter(["=", ["field", ORDERS.TOTAL, null], 1234])
  .filter([
    "contains",
    ["field", PRODUCTS.TITLE, { "source-field": ORDERS.PRODUCT_ID }],
    "asdf",
  ]);
const [RELATIVE_DAY_FILTER, NUMERIC_FILTER, STRING_CONTAINS_FILTER]: Filter[] =
  QUERY.filters();

const dummyFunction = jest.fn();

const setup = ({
  filter,
  onChange = dummyFunction,
  onChangeFilter = dummyFunction,
  showFieldPicker = true,
}: {
  filter: Filter;
  query?: StructuredQuery;
  onChange?: (filter: Filter) => void;
  onChangeFilter?: (filter: Filter) => void;
  showFieldPicker?: boolean;
}) => {
  renderWithProviders(
    <FilterPopover
      query={QUERY}
      filter={filter}
      onChange={onChange}
      onChangeFilter={onChangeFilter}
      showFieldPicker={showFieldPicker}
    />,
  );
};

describe("FilterPopover", () => {
  describe("existing filter", () => {
    describe("DatePicker", () => {
      it("should render a date picker for a date filter", () => {
        setup({ filter: RELATIVE_DAY_FILTER });

        expect(screen.getByTestId("date-picker")).toBeInTheDocument();
      });
    });
    describe("filter operator selection", () => {
      it("should have an operator selector", () => {
        setup({ filter: NUMERIC_FILTER });
        expect(screen.getByText("Equal to")).toBeInTheDocument();
        expect(screen.getByText("1,234")).toBeInTheDocument();
      });
    });
    describe("filter options", () => {
      it("should not show a control to the user if the filter has no options", () => {
        setup({ filter: RELATIVE_DAY_FILTER });
        expect(screen.queryByText("Include")).not.toBeInTheDocument();
        expect(screen.queryByText("today")).not.toBeInTheDocument();
      });

      it('should show "case-sensitive" option to the user for "contains" filters', () => {
        setup({ filter: STRING_CONTAINS_FILTER });
        expect(screen.getByText("Case sensitive")).toBeInTheDocument();
      });

      // Note: couldn't get it to work with React Testing library no matter what!
      // Tried to click on checkbox, label, their parent - nothing seems to be working, while it works fine in UI
      // eslint-disable-next-line jest/no-disabled-tests, jest/expect-expect
      it.skip("should let the user toggle an option", async () => {
        setup({ filter: RELATIVE_DAY_FILTER });
        const ellipsis = screen.getByLabelText("ellipsis icon");
        await userEvent.click(ellipsis);
        const includeToday = await screen.findByText("Include today");
        await userEvent.click(includeToday);
      });

      // eslint-disable-next-line jest/no-disabled-tests
      it.skip("should let the user toggle a date filter type", async () => {
        setup({ filter: RELATIVE_DAY_FILTER });
        const back = screen.getByLabelText("chevronleft icon");
        await userEvent.click(back);
        expect(
          await screen.findByTestId("date-picker-shortcuts"),
        ).toBeInTheDocument();
      });

      // eslint-disable-next-line jest/no-disabled-tests
      it.skip("should let the user toggle a text filter type", async () => {
        setup({ filter: STRING_CONTAINS_FILTER });
        await userEvent.click(await screen.findByText("Contains"));
        await userEvent.click(await screen.findByText("Is"));

        expect(
          await screen.findByTestId("date-picker-shortcuts"),
        ).toBeInTheDocument();
      });
    });
  });
  describe("filter rendering", () => {
    describe("no-value filters", () => {
      it.each(["is-null", "not-null", "is-empty", "not-empty"])(
        "should not render picker or separator when selecting '%s' filter from the column dropdown",
        async operator => {
          setup({
            filter: new Filter(
              [operator, ["field", PRODUCTS.TITLE, null], null],
              null,
              QUERY,
            ),
            showFieldPicker: false,
          });

          expect(
            screen.getByTestId("empty-picker-placeholder"),
          ).toBeInTheDocument();
        },
      );
    });

    describe("non datetime filters", () => {
      it.each([
        { filter: STRING_CONTAINS_FILTER, label: "contains" },
        { filter: NUMERIC_FILTER, label: "equals" },
      ])(
        "should render the default filter picker and separator if the $label filter has arguments",
        async ({ filter }) => {
          setup({ filter });

          expect(
            screen.getByTestId("filter-popover-separator"),
          ).toBeInTheDocument();

          expect(
            screen.queryByTestId("default-filter-picker"),
          ).not.toBeInTheDocument();
        },
      );
    });
  });
});

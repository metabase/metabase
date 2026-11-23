import userEvent from "@testing-library/user-event";

import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, within } from "__support__/ui";
import { selectMetadataProvider } from "metabase/metadata-store";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { TestFilterSpec } from "metabase-types/api";
import { createMockSegment } from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  createOrdersTable,
  createPeopleTable,
  createProductsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { FilterPills } from "./FilterPills";

const SEGMENT = createMockSegment({
  id: 1,
  table_id: ORDERS_ID,
  name: "Discounted",
  definition: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        filters: [
          {
            type: "operator",
            operator: "not-null",
            args: [{ type: "column", fieldId: ORDERS.DISCOUNT }],
          },
        ],
      },
    ],
  }),
});

const DATABASE = createSampleDatabase({
  tables: [
    createOrdersTable({ segments: [SEGMENT] }),
    createPeopleTable(),
    createProductsTable(),
  ],
});

const STATE = createMockState({
  entities: createMockEntitiesState({
    databases: [DATABASE],
    segments: [SEGMENT],
  }),
});

const PROVIDER = selectMetadataProvider(STATE, DATABASE.id);

const TOTAL_FILTER: TestFilterSpec = {
  type: "operator",
  operator: ">",
  args: [
    { type: "column", name: "TOTAL" },
    { type: "literal", value: 100 },
  ],
};

const QUANTITY_FILTER: TestFilterSpec = {
  type: "operator",
  operator: "<",
  args: [
    { type: "column", name: "QUANTITY" },
    { type: "literal", value: 5 },
  ],
};

const createQuery = (filters: TestFilterSpec[] = []) =>
  Lib.createTestQuery(PROVIDER, {
    stages: [{ source: { type: "table", id: ORDERS_ID }, filters }],
  });

const getFilterNames = (query: Lib.Query) =>
  Lib.filters(query, -1).map(
    (filter) => Lib.displayInfo(query, -1, filter).displayName,
  );

type SetupOpts = {
  query?: Lib.Query;
};

const setup = ({ query = createQuery() }: SetupOpts = {}) => {
  const onChange = jest.fn<void, [Lib.Query]>();
  renderWithProviders(<FilterPills query={query} onChange={onChange} />, {
    storeInitialState: STATE,
  });
  const getNextQuery = () => checkNotNull(onChange.mock.lastCall)[0];
  return { onChange, getNextQuery };
};

describe("FilterPills", () => {
  it("shows a pill for each filter, and an add button", () => {
    setup({ query: createQuery([TOTAL_FILTER, QUANTITY_FILTER]) });

    expect(
      screen.getAllByTestId("filter-pill").map((pill) => pill.textContent),
    ).toEqual(["Total is greater than 100", "Quantity is less than 5"]);
    expect(
      screen.getByRole("button", { name: "Add a filter" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Discounted")).not.toBeInTheDocument();
  });

  it("removes a filter from its pill", async () => {
    const { onChange, getNextQuery } = setup({
      query: createQuery([TOTAL_FILTER, QUANTITY_FILTER]),
    });

    const [totalPill] = screen.getAllByTestId("filter-pill");
    await userEvent.click(within(totalPill).getByLabelText("Remove"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(getFilterNames(getNextQuery())).toEqual(["Quantity is less than 5"]);
  });

  it("adds a filter after the others", async () => {
    const { onChange, getNextQuery } = setup({
      query: createQuery([QUANTITY_FILTER]),
    });

    await userEvent.click(screen.getByRole("button", { name: "Add a filter" }));
    await userEvent.click(await screen.findByText("Total"));
    await userEvent.click(screen.getByText("Between"));
    await userEvent.click(screen.getByText("Greater than"));
    await userEvent.type(screen.getByPlaceholderText("Enter a number"), "100");
    await userEvent.click(screen.getByText("Add filter"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(getFilterNames(getNextQuery())).toEqual([
      "Quantity is less than 5",
      "Total is greater than 100",
    ]);
  });

  it("adds a segment as a filter", async () => {
    const { onChange, getNextQuery } = setup({
      query: createQuery([QUANTITY_FILTER]),
    });

    await userEvent.click(screen.getByRole("button", { name: "Add a filter" }));
    await userEvent.click(await screen.findByText("Discounted"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(getFilterNames(getNextQuery())).toEqual([
      "Quantity is less than 5",
      "Discounted",
    ]);
  });
});

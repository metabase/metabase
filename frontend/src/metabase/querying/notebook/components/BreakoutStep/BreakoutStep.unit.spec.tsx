import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { createMockMetadata } from "__support__/metadata";
import {
  fireEvent,
  getIcon,
  queryIcon,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_PROVIDER,
  createMetadataProvider,
} from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { FieldReference, TemporalUnit } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockFingerprint,
  createMockNumberFieldFingerprint,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCTS_ID,
  REVIEWS_ID,
  createOrdersIdField,
  createOrdersTable,
  createOrdersUserIdField,
  createPeopleTable,
  createProductsTable,
  createReviewsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { DEFAULT_QUESTION, createMockNotebookStep } from "../../test-utils";
import type { NotebookStep } from "../../types";

import { BreakoutStep } from "./BreakoutStep";

function createQueryWithBreakout() {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: {
          type: "table",
          id: ORDERS_ID,
        },
        breakouts: [
          {
            type: "column",
            name: "TAX",
          },
        ],
      },
    ],
  });
}

function createQueryWithBreakoutAndBinningCount(
  binningCount: number | undefined,
) {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: {
          type: "table",
          id: ORDERS_ID,
        },
        breakouts: [
          {
            type: "column",
            name: "TAX",
            binning:
              binningCount != null
                ? { strategy: "num-bins", numBins: binningCount }
                : undefined,
          },
        ],
      },
    ],
  });
}

function createQueryWithMultipleBreakoutsAndBinningStrategy() {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: {
          type: "table",
          id: ORDERS_ID,
        },
        breakouts: [
          {
            type: "column",
            name: "TAX",
            binning: { strategy: "num-bins", numBins: 10 },
          },
          {
            type: "column",
            name: "TAX",
            binning: { strategy: "num-bins", numBins: 50 },
          },
        ],
      },
    ],
  });
}

function createQueryWithBreakoutAndTemporalBucket(
  temporalBucketName: TemporalUnit | undefined,
) {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: {
          type: "table",
          id: ORDERS_ID,
        },
        breakouts: [
          {
            type: "column",
            name: "CREATED_AT",
            unit: temporalBucketName,
          },
        ],
      },
    ],
  });
}

function createQueryWithMultipleBreakoutsAndTemporalBucket() {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: {
          type: "table",
          id: ORDERS_ID,
        },
        breakouts: [
          {
            type: "column",
            name: "CREATED_AT",
            unit: "year",
          },
          {
            type: "column",
            name: "CREATED_AT",
            unit: "month",
          },
        ],
      },
    ],
  });
}

type NativeCardColumnOpts = {
  name: string;
  baseType: string;
};

function createNativeCardColumn({ name, baseType }: NativeCardColumnOpts) {
  const fieldRef: FieldReference = ["field", name, { "base-type": baseType }];
  return createMockColumn({
    id: undefined,
    table_id: undefined,
    field_ref: fieldRef,
    name,
    display_name: name,
    base_type: baseType,
    effective_type: baseType,
  });
}

function createQueryWithCustomColumns() {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        expressions: [
          {
            name: "Half Price",
            value: {
              type: "operator",
              operator: "/",
              args: [
                {
                  type: "column",
                  name: "PRICE",
                  sourceFieldId: ORDERS.PRODUCT_ID,
                },
                { type: "literal", value: 2 },
              ],
            },
          },
          {
            name: "Product Date",
            value: {
              type: "column",
              name: "CREATED_AT",
              sourceFieldId: ORDERS.PRODUCT_ID,
            },
          },
          {
            name: "UserLAT",
            value: {
              type: "column",
              name: "LATITUDE",
              sourceFieldId: ORDERS.USER_ID,
            },
          },
        ],
        aggregations: [{ type: "operator", operator: "count", args: [] }],
      },
    ],
  });
}

/**
 * Orders where User ID has a number range, as in the real sample database, so
 * only its foreign key type can rule out binning.
 */
function createOrdersQueryWithBinnableUserId() {
  const ordersTable = createOrdersTable();
  const userIdField = createOrdersUserIdField({
    fingerprint: createMockFingerprint({
      type: {
        "type/Number": createMockNumberFieldFingerprint({ min: 1, max: 2500 }),
      },
    }),
  });
  const database = createSampleDatabase({
    tables: [
      createOrdersTable({
        fields: ordersTable.fields?.map((field) =>
          field.id === ORDERS.USER_ID ? userIdField : field,
        ),
      }),
      createPeopleTable(),
      createProductsTable(),
      createReviewsTable(),
    ],
  });
  const metadata = createMockMetadata({ databases: [database] });
  return Lib.createTestQuery(
    createMetadataProvider({ metadata }),
    DEFAULT_TEST_QUERY,
  );
}

/**
 * Orders joined with Reviews and counted by month, then joined with Reviews
 * again on the month and counted in a second stage.
 */
function createSecondStageQueryWithJoin() {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        joins: [
          {
            source: { type: "table", id: REVIEWS_ID },
            strategy: "left-join",
            conditions: [
              {
                operator: "=",
                left: { type: "column", name: "PRODUCT_ID" },
                right: { type: "column", name: "PRODUCT_ID" },
              },
            ],
          },
        ],
        aggregations: [{ type: "operator", operator: "count", args: [] }],
        breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }],
      },
      {
        joins: [
          {
            source: { type: "table", id: REVIEWS_ID },
            strategy: "left-join",
            conditions: [
              {
                operator: "=",
                left: { type: "column", name: "CREATED_AT" },
                right: { type: "column", name: "CREATED_AT" },
              },
            ],
          },
        ],
        aggregations: [{ type: "operator", operator: "count", args: [] }],
      },
    ],
  });
}

interface SetupOpts {
  step?: NotebookStep;
  readOnly?: boolean;
}

function setup({ step = createMockNotebookStep(), readOnly }: SetupOpts = {}) {
  const updateQuery = jest.fn();

  renderWithProviders(
    <BreakoutStep
      step={step}
      stageIndex={step.stageIndex}
      query={step.query}
      color="core-summarize"
      readOnly={readOnly}
      isLastOpened={false}
      reportTimezone="UTC"
      updateQuery={updateQuery}
    />,
  );

  function getNextQuery(): Lib.Query {
    const [lastCall] = updateQuery.mock.calls.slice(-1);
    return lastCall[0];
  }

  function getNextBreakouts() {
    const query = getNextQuery();
    const breakouts = Lib.breakouts(query, 0);
    return breakouts.map((breakout) => Lib.displayInfo(query, 0, breakout));
  }

  return {
    getNextQuery,
    getNextBreakouts,
    updateQuery,
  };
}

interface SetupWithQueryUpdatesOpts {
  query: Lib.Query;
}

function setupWithQueryUpdates({ query }: SetupWithQueryUpdatesOpts) {
  const onQueryChange = jest.fn<void, [Lib.Query]>();

  function BreakoutStepWithQueryUpdates() {
    const [currentQuery, setCurrentQuery] = useState(query);
    const step = createMockNotebookStep({ query: currentQuery });

    const handleUpdateQuery = async (nextQuery: Lib.Query) => {
      setCurrentQuery(nextQuery);
      onQueryChange(nextQuery);
    };

    return (
      <BreakoutStep
        step={step}
        stageIndex={step.stageIndex}
        query={step.query}
        color="core-summarize"
        isLastOpened={false}
        reportTimezone="UTC"
        updateQuery={handleUpdateQuery}
      />
    );
  }

  renderWithProviders(<BreakoutStepWithQueryUpdates />);

  function getRecentBreakoutNames(): string[] {
    expect(onQueryChange).toHaveBeenCalled();
    const [recentQuery] = checkNotNull(onQueryChange.mock.lastCall);
    return Lib.breakouts(recentQuery, 0).map(
      (breakout) => Lib.displayInfo(recentQuery, 0, breakout).displayName,
    );
  }

  return { getRecentBreakoutNames };
}

describe("BreakoutStep", () => {
  it("should render correctly without a breakout", () => {
    setup();
    expect(screen.getByText("Pick a column to group by")).toBeInTheDocument();
  });

  it("should render a breakout correctly", async () => {
    const query = createQueryWithBreakout();
    setup({ step: createMockNotebookStep({ query }) });

    await userEvent.click(screen.getByText("Tax"));

    const listItem = await screen.findByRole("option", { name: "Tax" });
    expect(listItem).toBeInTheDocument();
    expect(listItem).toHaveAttribute("aria-selected", "true");
  });

  it("should add a breakout", async () => {
    const { getNextBreakouts } = setup();

    await userEvent.click(screen.getByText("Pick a column to group by"));
    await userEvent.click(await screen.findByText("Created At"));

    const [breakout] = getNextBreakouts();
    expect(breakout.displayName).toBe("Created At: Month");
  });

  it("should change a breakout column", async () => {
    const query = createQueryWithBreakout();
    const { getNextBreakouts } = setup({
      step: createMockNotebookStep({ query }),
    });

    await userEvent.click(screen.getByText("Tax"));
    await userEvent.click(await screen.findByText("Discount"));

    const [breakout] = getNextBreakouts();
    expect(breakout.displayName).toBe("Discount: Auto binned");
  });

  it("should remove a breakout", async () => {
    const query = createQueryWithBreakout();
    const { getNextQuery } = setup({ step: createMockNotebookStep({ query }) });

    await userEvent.click(getIcon("close"));

    const nextQuery = getNextQuery();
    expect(Lib.breakouts(nextQuery, 0)).toHaveLength(0);
  });

  describe("second stage with a join (metabase#46832)", () => {
    function getBreakoutNames(query: Lib.Query, stageIndex: number) {
      return Lib.breakouts(query, stageIndex).map(
        (breakout) =>
          Lib.displayInfo(query, stageIndex, breakout).longDisplayName,
      );
    }

    it("should list the previous stage columns and the joined columns in separate groups", async () => {
      const query = createSecondStageQueryWithJoin();
      const { getNextQuery } = setup({
        step: createMockNotebookStep({ query, stageIndex: 1 }),
      });

      await userEvent.click(screen.getByText("Pick a column to group by"));
      expect(await screen.findByText("Summaries")).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "Created At: Month" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Count" })).toBeInTheDocument();

      await userEvent.click(screen.getByText("Reviews"));
      expect(
        screen.queryByRole("option", { name: "Created At: Month" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: "Count" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "Rating" }),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByText("Summaries"));
      expect(
        screen.getByRole("option", { name: "Created At: Month" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Count" })).toBeInTheDocument();

      await userEvent.click(screen.getByText("Reviews"));
      await userEvent.click(screen.getByText("Rating"));

      expect(getBreakoutNames(getNextQuery(), 1)).toEqual([
        "Reviews - Created At: Month → Rating: Auto binned",
      ]);
    });

    it("should open the group of an edited breakout and keep the previous stage columns in their group", async () => {
      const baseQuery = createSecondStageQueryWithJoin();
      const rating = checkNotNull(
        Lib.breakoutableColumns(baseQuery, 1).find(
          (column) =>
            Lib.displayInfo(baseQuery, 1, column).displayName === "Rating" &&
            Lib.displayInfo(baseQuery, 1, column).isFromJoin,
        ),
      );
      const query = Lib.breakout(
        baseQuery,
        1,
        Lib.withDefaultBinning(baseQuery, 1, rating),
      );
      setup({ step: createMockNotebookStep({ query, stageIndex: 1 }) });

      await userEvent.click(
        screen.getByText("Reviews - Created At: Month → Rating: Auto binned"),
      );
      expect(await screen.findByText("Summaries")).toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: "Created At: Month" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: "Count" }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Rating" })).toHaveAttribute(
        "aria-selected",
        "true",
      );

      await userEvent.click(screen.getByText("Summaries"));
      expect(
        screen.getByRole("option", { name: "Created At: Month" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Count" })).toBeInTheDocument();
    });
  });

  describe("bucketing", () => {
    it("should offer bucketing for date and number columns but not for a foreign key (metabase#16787)", async () => {
      setup({
        step: createMockNotebookStep({
          query: createOrdersQueryWithBinnableUserId(),
        }),
      });

      await userEvent.click(screen.getByText("Pick a column to group by"));

      const createdAtOption = await screen.findByRole("option", {
        name: "Created At",
      });
      expect(
        within(createdAtOption).getByLabelText("Temporal bucket"),
      ).toBeInTheDocument();
      const subtotalOption = screen.getByRole("option", { name: "Subtotal" });
      expect(
        within(subtotalOption).getByLabelText("Binning strategy"),
      ).toBeInTheDocument();
      const userIdOption = screen.getByRole("option", { name: "User ID" });
      expect(
        within(userIdOption).queryByLabelText("Binning strategy"),
      ).not.toBeInTheDocument();
      expect(
        within(userIdOption).queryByLabelText("Temporal bucket"),
      ).not.toBeInTheDocument();
    });

    it("should open only one bucketing menu at a time (metabase#45036)", async () => {
      const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: PRODUCTS_ID },
            aggregations: [{ type: "operator", operator: "count", args: [] }],
          },
        ],
      });
      setup({ step: createMockNotebookStep({ query }) });

      await userEvent.click(screen.getByText("Pick a column to group by"));
      const createdAtOption = await screen.findByRole("option", {
        name: "Created At",
      });
      await userEvent.click(
        within(createdAtOption).getByLabelText("Temporal bucket"),
      );

      let menu = await screen.findByRole("menu");
      expect(
        within(menu).getByRole("menuitem", { name: "Year" }),
      ).toBeInTheDocument();
      expect(
        within(menu).queryByRole("menuitem", { name: "Hour of day" }),
      ).not.toBeInTheDocument();
      await userEvent.click(within(menu).getByText("More…"));
      expect(
        await within(menu).findByRole("menuitem", { name: "Hour of day" }),
      ).toBeInTheDocument();

      const priceOption = screen.getByRole("option", { name: "Price" });
      await userEvent.click(
        within(priceOption).getByLabelText("Binning strategy"),
      );

      await waitFor(() =>
        expect(
          screen.queryByRole("menuitem", { name: "Year" }),
        ).not.toBeInTheDocument(),
      );
      menu = screen.getByRole("menu");
      expect(
        within(menu).getByRole("menuitem", { name: "Auto bin" }),
      ).toBeInTheDocument();
      expect(
        within(menu).getByRole("menuitem", { name: "50 bins" }),
      ).toBeInTheDocument();
      expect(
        within(menu).getByRole("menuitem", { name: "Don't bin" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("menuitem", { name: "Hour of day" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("More…")).not.toBeInTheDocument();
      expect(screen.getAllByRole("menu")).toHaveLength(1);
    });

    it("should apply default binning strategy", async () => {
      const { getNextBreakouts } = setup();

      await userEvent.click(screen.getByText("Pick a column to group by"));
      const option = await screen.findByRole("option", { name: "Total" });

      expect(within(option).getByText("Auto bin")).toBeInTheDocument();

      await userEvent.click(screen.getByText("Total"));

      const [breakout] = getNextBreakouts();
      expect(breakout.displayName).toBe("Total: Auto binned");
    });

    it("should apply selected binning strategy", async () => {
      const { getNextBreakouts } = setup();

      await userEvent.click(screen.getByText("Pick a column to group by"));
      const option = await screen.findByRole("option", { name: "Total" });
      await userEvent.click(within(option).getByLabelText("Binning strategy"));
      await userEvent.click(
        await screen.findByRole("menuitem", { name: "10 bins" }),
      );

      const [breakout] = getNextBreakouts();
      expect(breakout.displayName).toBe("Total: 10 bins");
    });

    it("should highlight selected binning strategy", async () => {
      const query = createQueryWithBreakoutAndBinningCount(10);
      setup({ step: createMockNotebookStep({ query }) });

      await userEvent.click(screen.getByText("Tax: 10 bins"));
      const option = await screen.findByRole("option", { name: "Tax" });
      await userEvent.click(within(option).getByLabelText("Binning strategy"));

      expect(
        await screen.findByRole("menuitem", { name: "10 bins" }),
      ).toHaveAttribute("aria-selected", "true");
    });

    it("shouldn't update a query when clicking a selected binned column", async () => {
      const query = createQueryWithBreakoutAndBinningCount(10);
      const { updateQuery } = setup({
        step: createMockNotebookStep({ query }),
      });

      await userEvent.click(screen.getByText("Tax: 10 bins"));
      await userEvent.click(await screen.findByText("Tax"));

      expect(updateQuery).not.toHaveBeenCalled();
    });

    it("should highlight the `Don't bin` option when a column is not binned", async () => {
      const query = createQueryWithBreakoutAndBinningCount(undefined);
      setup({ step: createMockNotebookStep({ query }) });

      await userEvent.click(screen.getByText("Tax"));
      const option = await screen.findByRole("option", {
        name: "Tax",
      });

      expect(within(option).getByText("Unbinned")).toBeInTheDocument();

      await userEvent.click(within(option).getByLabelText("Binning strategy"));
      expect(
        await screen.findByRole("menuitem", { name: "Don't bin" }),
      ).toHaveAttribute("aria-selected", "true");
    });

    it("should apply default temporal bucket", async () => {
      const { getNextBreakouts } = setup();

      await userEvent.click(screen.getByText("Pick a column to group by"));
      await userEvent.click(await screen.findByText("Created At"));

      const [breakout] = getNextBreakouts();
      expect(breakout.displayName).toBe("Created At: Month");
    });

    it("should apply selected temporal bucket", async () => {
      const { getNextBreakouts } = setup();

      await userEvent.click(screen.getByText("Pick a column to group by"));
      const option = await screen.findByRole("option", { name: "Created At" });
      await userEvent.click(within(option).getByLabelText("Temporal bucket"));

      // For some reason, a click won't happen with `userEvent.click`
      // if the test is running together with other tests.
      fireEvent.click(await screen.findByRole("menuitem", { name: "Quarter" }));

      const [breakout] = getNextBreakouts();
      expect(breakout.displayName).toBe("Created At: Quarter");
    });

    it("should highlight selected temporal bucket", async () => {
      const query = createQueryWithBreakoutAndTemporalBucket("quarter");
      setup({ step: createMockNotebookStep({ query }) });

      await userEvent.click(screen.getByText("Created At: Quarter"));
      const option = await screen.findByRole("option", { name: "Created At" });
      await userEvent.click(within(option).getByLabelText("Temporal bucket"));

      expect(
        await screen.findByRole("menuitem", { name: "Quarter" }),
      ).toHaveAttribute("aria-selected", "true");
    });

    it("should handle `Don't bin` option for temporal bucket (metabase#19684)", async () => {
      const query = createQueryWithBreakoutAndTemporalBucket(undefined);
      setup({ step: createMockNotebookStep({ query }) });

      await userEvent.click(screen.getByText("Created At"));
      const option = await screen.findByRole("option", {
        name: "Created At",
      });

      expect(within(option).getByText("Unbinned")).toBeInTheDocument();

      await userEvent.click(within(option).getByLabelText("Temporal bucket"));

      // click on More... item as Don't bin is hidden
      // userEvent.click closes popup
      fireEvent.click(await screen.findByText("More…"));

      expect(
        await screen.findByRole("menuitem", { name: "Don't bin" }),
      ).toHaveAttribute("aria-selected", "true");
    });

    it("shouldn't update a query when clicking a selected column with temporal bucketing", async () => {
      const query = createQueryWithBreakoutAndTemporalBucket("quarter");
      const { updateQuery } = setup({
        step: createMockNotebookStep({ query }),
      });

      await userEvent.click(screen.getByText("Created At: Quarter"));
      await userEvent.click(await screen.findByText("Created At"));

      expect(updateQuery).not.toHaveBeenCalled();
    });

    it("should allow to add a breakout for a column with an existing breakout but with a different binning strategy", async () => {
      const query = createQueryWithBreakoutAndBinningCount(10);
      const { getNextBreakouts } = setup({
        step: createMockNotebookStep({ query }),
      });

      await userEvent.click(getIcon("add"));
      const option = await screen.findByRole("option", { name: "Tax" });
      await userEvent.click(within(option).getByLabelText("Binning strategy"));
      await userEvent.click(await screen.findByText("50 bins"));

      const breakouts = getNextBreakouts();
      expect(breakouts).toHaveLength(2);
      expect(breakouts[0].displayName).toBe("Tax: 10 bins");
      expect(breakouts[1].displayName).toBe("Tax: 50 bins");
    });

    it("should ignore attempts to add a breakout for a column with the same binning strategy", async () => {
      const query = createQueryWithBreakoutAndBinningCount(10);
      const { getNextBreakouts } = setup({
        step: createMockNotebookStep({ query }),
      });

      await userEvent.click(getIcon("add"));
      const option = await screen.findByRole("option", { name: "Tax" });
      await userEvent.click(within(option).getByLabelText("Binning strategy"));
      await userEvent.click(await screen.findByText("10 bins"));

      const breakouts = getNextBreakouts();
      expect(breakouts).toHaveLength(1);
      expect(breakouts[0].displayName).toBe("Tax: 10 bins");
    });

    it("should allow to change a breakout for a column with an existing breakout but with a different binning strategy", async () => {
      const query = createQueryWithMultipleBreakoutsAndBinningStrategy();
      const { getNextBreakouts } = setup({
        step: createMockNotebookStep({ query }),
      });

      await userEvent.click(await screen.findByText("Tax: 10 bins"));
      const option = await screen.findByRole("option", { name: "Tax" });
      await userEvent.click(within(option).getByLabelText("Binning strategy"));
      await userEvent.click(await screen.findByText("100 bins"));

      const breakouts = getNextBreakouts();
      expect(breakouts).toHaveLength(2);
      expect(breakouts[0].displayName).toBe("Tax: 100 bins");
      expect(breakouts[1].displayName).toBe("Tax: 50 bins");
    });

    it("should ignore attempts to create duplicate breakouts by changing the binning strategy for an existing breakout", async () => {
      const query = createQueryWithMultipleBreakoutsAndBinningStrategy();
      const { getNextBreakouts } = setup({
        step: createMockNotebookStep({ query }),
      });

      await userEvent.click(await screen.findByText("Tax: 10 bins"));
      const option = await screen.findByRole("option", { name: "Tax" });
      await userEvent.click(within(option).getByLabelText("Binning strategy"));
      await userEvent.click(await screen.findByText("50 bins"));

      const breakouts = getNextBreakouts();
      expect(breakouts).toHaveLength(2);
      expect(breakouts[0].displayName).toBe("Tax: 10 bins");
      expect(breakouts[1].displayName).toBe("Tax: 50 bins");
    });

    it("should allow to remove a breakout for a column with an existing breakout but with a different binning strategy", async () => {
      const query = createQueryWithMultipleBreakoutsAndBinningStrategy();
      const { getNextBreakouts } = setup({
        step: createMockNotebookStep({ query }),
      });

      const clause = await screen.findByText("Tax: 50 bins");
      await userEvent.click(within(clause).getByLabelText("close icon"));

      const breakouts = getNextBreakouts();
      expect(breakouts).toHaveLength(1);
      expect(breakouts[0].displayName).toBe("Tax: 10 bins");
    });

    it("should allow to add a breakout for a column with an existing breakout but with a different temporal bucket", async () => {
      const query = createQueryWithBreakoutAndTemporalBucket("year");
      const { getNextBreakouts } = setup({
        step: createMockNotebookStep({ query }),
      });

      await userEvent.click(getIcon("add"));
      const option = await screen.findByRole("option", { name: "Created At" });
      await userEvent.click(within(option).getByLabelText("Temporal bucket"));
      await userEvent.click(await screen.findByText("Quarter"));

      const breakouts = getNextBreakouts();
      expect(breakouts).toHaveLength(2);
      expect(breakouts[0].displayName).toBe("Created At: Year");
      expect(breakouts[1].displayName).toBe("Created At: Quarter");
    });

    it("should ignore attempts to add a breakout for a column with the same temporal bucket", async () => {
      const query = createQueryWithBreakoutAndTemporalBucket("year");
      const { getNextBreakouts } = setup({
        step: createMockNotebookStep({ query }),
      });

      await userEvent.click(getIcon("add"));
      const option = await screen.findByRole("option", { name: "Created At" });
      await userEvent.click(within(option).getByLabelText("Temporal bucket"));
      await userEvent.click(await screen.findByText("Year"));

      const breakouts = getNextBreakouts();
      expect(breakouts).toHaveLength(1);
      expect(breakouts[0].displayName).toBe("Created At: Year");
    });

    it("should allow to change a breakout for a column with an existing breakout but with a different temporal bucket", async () => {
      const query = createQueryWithMultipleBreakoutsAndTemporalBucket();
      const { getNextBreakouts } = setup({
        step: createMockNotebookStep({ query }),
      });

      await userEvent.click(await screen.findByText("Created At: Month"));
      const option = await screen.findByRole("option", { name: "Created At" });
      await userEvent.click(within(option).getByLabelText("Temporal bucket"));
      await userEvent.click(await screen.findByText("Quarter"));

      const breakouts = getNextBreakouts();
      expect(breakouts).toHaveLength(2);
      expect(breakouts[0].displayName).toBe("Created At: Year");
      expect(breakouts[1].displayName).toBe("Created At: Quarter");
    });

    it("should ignore attempts to create duplicate breakouts by changing the temporal bucket for an existing breakout", async () => {
      const query = createQueryWithMultipleBreakoutsAndTemporalBucket();
      const { getNextBreakouts } = setup({
        step: createMockNotebookStep({ query }),
      });

      await userEvent.click(await screen.findByText("Created At: Month"));
      const option = await screen.findByRole("option", { name: "Created At" });
      await userEvent.click(within(option).getByLabelText("Temporal bucket"));
      await userEvent.click(await screen.findByText("Year"));

      const breakouts = getNextBreakouts();
      expect(breakouts).toHaveLength(2);
      expect(breakouts[0].displayName).toBe("Created At: Year");
      expect(breakouts[1].displayName).toBe("Created At: Month");
    });

    it("should allow to remove a breakout for a column with an existing breakout but with a different temporal bucket", async () => {
      const query = createQueryWithMultipleBreakoutsAndTemporalBucket();
      const { getNextBreakouts } = setup({
        step: createMockNotebookStep({ query }),
      });

      const clause = await screen.findByText("Created At: Month");
      await userEvent.click(within(clause).getByLabelText("close icon"));

      const breakouts = getNextBreakouts();
      expect(breakouts).toHaveLength(1);
      expect(breakouts[0].displayName).toBe("Created At: Year");
    });
  });

  describe("custom columns", () => {
    it("should only show bucketing options that fit the type of a custom column", async () => {
      setup({
        step: createMockNotebookStep({ query: createQueryWithCustomColumns() }),
      });

      await userEvent.click(screen.getByText("Pick a column to group by"));

      const totalOption = await screen.findByRole("option", { name: "Total" });
      expect(
        within(totalOption).getByLabelText("Binning strategy"),
      ).toBeInTheDocument();

      const halfPriceOption = screen.getByRole("option", {
        name: "Half Price",
      });
      expect(
        within(halfPriceOption).queryByLabelText("Binning strategy"),
      ).not.toBeInTheDocument();
      expect(
        within(halfPriceOption).queryByLabelText("Temporal bucket"),
      ).not.toBeInTheDocument();

      const userLatOption = screen.getByRole("option", { name: "UserLAT" });
      expect(
        within(userLatOption).queryByLabelText("Binning strategy"),
      ).not.toBeInTheDocument();
      expect(
        within(userLatOption).queryByLabelText("Temporal bucket"),
      ).not.toBeInTheDocument();

      const productDateOption = screen.getByRole("option", {
        name: "Product Date",
      });
      expect(
        within(productDateOption).queryByLabelText("Binning strategy"),
      ).not.toBeInTheDocument();
      expect(
        within(productDateOption).getByLabelText("Temporal bucket"),
      ).toBeInTheDocument();
    });

    it("should allow to pick each custom column as the breakout", async () => {
      const { getRecentBreakoutNames } = setupWithQueryUpdates({
        query: createQueryWithCustomColumns(),
      });

      await userEvent.click(screen.getByText("Pick a column to group by"));
      await userEvent.click(
        within(
          await screen.findByRole("option", { name: "Product Date" }),
        ).getByText("Product Date"),
      );
      expect(
        await screen.findByText("Product Date: Month"),
      ).toBeInTheDocument();
      expect(getRecentBreakoutNames()).toEqual(["Product Date: Month"]);

      await userEvent.click(screen.getByText("Product Date: Month"));
      await userEvent.click(
        within(
          await screen.findByRole("option", { name: "Half Price" }),
        ).getByText("Half Price"),
      );
      expect(await screen.findByText("Half Price")).toBeInTheDocument();
      expect(screen.queryByText("Product Date: Month")).not.toBeInTheDocument();
      expect(getRecentBreakoutNames()).toEqual(["Half Price"]);

      await userEvent.click(screen.getByText("Half Price"));
      await userEvent.click(
        within(
          await screen.findByRole("option", { name: "UserLAT" }),
        ).getByText("UserLAT"),
      );
      expect(await screen.findByText("UserLAT")).toBeInTheDocument();
      expect(screen.queryByText("Half Price")).not.toBeInTheDocument();
      expect(getRecentBreakoutNames()).toEqual(["UserLAT"]);
    });
  });

  describe("saved native question source", () => {
    const NATIVE_CARD = createMockCard({
      display: "table",
      visualization_settings: {},
      id: 2,
      name: "Native products",
      dataset_query: Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, {
        query: "select * from products",
      }),
      result_metadata: [
        createNativeCardColumn({ name: "ID", baseType: "type/BigInteger" }),
        createNativeCardColumn({
          name: "CREATED_AT",
          baseType: "type/DateTimeWithLocalTZ",
        }),
      ],
    });

    const NATIVE_CARD_PROVIDER = createMetadataProvider({
      metadata: createMockMetadata({
        databases: [createSampleDatabase()],
        questions: [NATIVE_CARD],
      }),
    });

    it("should not render duplicate temporal buckets (metabase#16327)", async () => {
      const query = Lib.createTestQuery(NATIVE_CARD_PROVIDER, {
        stages: [{ source: { type: "card", id: NATIVE_CARD.id } }],
      });
      setup({ step: createMockNotebookStep({ query }) });

      await userEvent.click(screen.getByText("Pick a column to group by"));
      const option = await screen.findByRole("option", { name: "CREATED_AT" });
      await userEvent.click(within(option).getByLabelText("Temporal bucket"));

      // userEvent.click closes the popover
      fireEvent.click(await screen.findByText("More…"));

      const itemNames = screen
        .getAllByRole("menuitem")
        .map((item) => item.textContent);
      expect(itemNames).toContain("Day");
      expect(itemNames).toContain("Hour of day");
      expect(new Set(itemNames).size).toBe(itemNames.length);
    });

    it("should keep the sort in sync when changing the temporal bucket of a breakout (metabase#17975)", async () => {
      const query = Lib.createTestQuery(NATIVE_CARD_PROVIDER, {
        stages: [
          {
            source: { type: "card", id: NATIVE_CARD.id },
            aggregations: [{ type: "operator", operator: "count", args: [] }],
            breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }],
            orderBys: [{ type: "column", name: "CREATED_AT", unit: "month" }],
          },
        ],
      });
      const { getNextQuery } = setup({
        step: createMockNotebookStep({ query }),
      });

      await userEvent.click(screen.getByText("CREATED_AT: Month"));
      const option = await screen.findByRole("option", { name: "CREATED_AT" });
      await userEvent.click(within(option).getByLabelText("Temporal bucket"));
      fireEvent.click(await screen.findByRole("menuitem", { name: "Quarter" }));

      const nextQuery = getNextQuery();
      const orderBys = Lib.orderBys(nextQuery, 0).map(
        (orderBy) => Lib.displayInfo(nextQuery, 0, orderBy).displayName,
      );
      expect(orderBys).toEqual(["CREATED_AT: Quarter"]);
    });

    it("should apply the default temporal bucket to a column of a joined native question (metabase#10441, metabase#18646)", async () => {
      const query = Lib.createTestQuery(NATIVE_CARD_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            joins: [
              {
                source: { type: "card", id: NATIVE_CARD.id },
                strategy: "left-join",
                conditions: [
                  {
                    operator: "=",
                    left: { type: "column", name: "PRODUCT_ID" },
                    right: { type: "column", name: "ID" },
                  },
                ],
              },
            ],
          },
        ],
      });
      const { getNextQuery, getNextBreakouts } = setup({
        step: createMockNotebookStep({ query }),
      });

      await userEvent.click(screen.getByText("Pick a column to group by"));
      await userEvent.click(await screen.findByText("Native products"));
      const option = await screen.findByRole("option", {
        name: "Native products - Product → CREATED_AT",
      });
      expect(within(option).getByText("by month")).toBeInTheDocument();

      await userEvent.click(
        within(option).getByText("Native products - Product → CREATED_AT"),
      );
      expect(getNextBreakouts()).toMatchObject([
        { longDisplayName: "Native products - Product → CREATED_AT: Month" },
      ]);
      expect(Lib.toJsQuery(getNextQuery())).toMatchObject({
        stages: [
          {
            breakout: [
              [
                "field",
                {
                  "base-type": "type/DateTimeWithLocalTZ",
                  "join-alias": "Native products - Product",
                  "temporal-unit": "month",
                },
                "CREATED_AT",
              ],
            ],
          },
        ],
      });
    });
  });

  describe("metrics", () => {
    it("should allow selecting breakoutable columns", async () => {
      const question = DEFAULT_QUESTION.setType("metric");
      const step = createMockNotebookStep({ question });
      const { getNextBreakouts } = setup({ step });

      await userEvent.click(screen.getByText("Pick a column to group by"));
      expect(await screen.findByText("Orders")).toBeInTheDocument();
      expect(await screen.findByText("Created At")).toBeInTheDocument();
      expect(await screen.findByText("Tax")).toBeInTheDocument();

      await userEvent.click(screen.getByText("User"));
      expect(await screen.findByText("Created At")).toBeInTheDocument();
      expect(await screen.findByText("Birth Date")).toBeInTheDocument();
      expect(await screen.findByText("Email")).toBeInTheDocument();

      await userEvent.click(await screen.findByText("Created At"));
      expect(getNextBreakouts()).toMatchObject([
        { displayName: "Created At: Month" },
      ]);
    });

    it("should not allow to select columns in readonly mode", () => {
      const question = DEFAULT_QUESTION.setType("metric");
      const step = createMockNotebookStep({ question });
      setup({ step, readOnly: true });

      expect(
        screen.queryByText("Pick a column to group by"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("No columns available"),
      ).not.toBeInTheDocument();
    });

    it("should allow selecting a numeric column when there are no temporal columns", async () => {
      const metadata = createMockMetadata({
        databases: [
          createSampleDatabase({
            tables: [createOrdersTable({ fields: [createOrdersIdField()] })],
          }),
        ],
      });
      const question = new Question(
        createMockCard({
          type: "metric",
          dataset_query: Lib.createTestJsQuery(
            createMetadataProvider({ metadata }),
            DEFAULT_TEST_QUERY,
          ),
        }),
        metadata,
      );
      const step = createMockNotebookStep({
        question,
        query: question.query(),
      });
      const { getNextBreakouts } = setup({ step });

      await userEvent.click(screen.getByText("Pick a column to group by"));
      await userEvent.click(await screen.findByText("ID"));

      expect(getNextBreakouts()).toMatchObject([{ displayName: "ID" }]);
    });

    it("should not allow to add more than 1 breakout", async () => {
      const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: {
              type: "table",
              id: ORDERS_ID,
            },
            breakouts: [{ type: "column", name: "CREATED_AT" }],
          },
        ],
      });
      const question = DEFAULT_QUESTION.setType("metric").setQuery(query);
      const step = createMockNotebookStep({ question });
      setup({ step });

      expect(queryIcon("add")).not.toBeInTheDocument();
    });
  });
});

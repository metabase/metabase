import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import {
  fireEvent,
  getIcon,
  queryIcon,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";
import * as Lib from "metabase-lib";
import { createQueryWithClauses } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import { createMockCard } from "metabase-types/api/mocks";
import {
  createOrdersIdField,
  createOrdersTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { DEFAULT_QUESTION, createMockNotebookStep } from "../../test-utils";
import type { NotebookStep } from "../../types";

import { BreakoutStep } from "./BreakoutStep";

function createQueryWithBreakout() {
  return createQueryWithClauses({
    breakouts: [{ tableName: "ORDERS", columnName: "TAX" }],
  });
}

function createQueryWithBreakoutAndBinningStrategy(
  binningStrategyName = "10 bins",
) {
  return createQueryWithClauses({
    breakouts: [
      {
        tableName: "ORDERS",
        columnName: "TAX",
        binningStrategyName,
      },
    ],
  });
}

function createQueryWithMultipleBreakoutsAndBinningStrategy() {
  return createQueryWithClauses({
    breakouts: [
      {
        tableName: "ORDERS",
        columnName: "TAX",
        binningStrategyName: "10 bins",
      },
      {
        tableName: "ORDERS",
        columnName: "TAX",
        binningStrategyName: "50 bins",
      },
    ],
  });
}

function createQueryWithBreakoutAndTemporalBucket(temporalBucketName: string) {
  return createQueryWithClauses({
    breakouts: [
      {
        tableName: "ORDERS",
        columnName: "CREATED_AT",
        temporalBucketName,
      },
    ],
  });
}

function createQueryWithMultipleBreakoutsAndTemporalBucket() {
  return createQueryWithClauses({
    breakouts: [
      {
        tableName: "ORDERS",
        columnName: "CREATED_AT",
        temporalBucketName: "Year",
      },
      {
        tableName: "ORDERS",
        columnName: "CREATED_AT",
        temporalBucketName: "Month",
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
      color="summarize"
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

  describe("bucketing", () => {
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
      const query = createQueryWithBreakoutAndBinningStrategy();
      setup({ step: createMockNotebookStep({ query }) });

      await userEvent.click(screen.getByText("Tax: 10 bins"));
      const option = await screen.findByRole("option", { name: "Tax" });
      await userEvent.click(within(option).getByLabelText("Binning strategy"));

      expect(
        await screen.findByRole("menuitem", { name: "10 bins" }),
      ).toHaveAttribute("aria-selected", "true");
    });

    it("shouldn't update a query when clicking a selected binned column", async () => {
      const query = createQueryWithBreakoutAndBinningStrategy();
      const { updateQuery } = setup({
        step: createMockNotebookStep({ query }),
      });

      await userEvent.click(screen.getByText("Tax: 10 bins"));
      await userEvent.click(await screen.findByText("Tax"));

      expect(updateQuery).not.toHaveBeenCalled();
    });

    it("should highlight the `Don't bin` option when a column is not binned", async () => {
      const query = createQueryWithBreakoutAndBinningStrategy("Don't bin");
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
      const query = createQueryWithBreakoutAndTemporalBucket("Quarter");
      setup({ step: createMockNotebookStep({ query }) });

      await userEvent.click(screen.getByText("Created At: Quarter"));
      const option = await screen.findByRole("option", { name: "Created At" });
      await userEvent.click(within(option).getByLabelText("Temporal bucket"));

      expect(
        await screen.findByRole("menuitem", { name: "Quarter" }),
      ).toHaveAttribute("aria-selected", "true");
    });

    it("should handle `Don't bin` option for temporal bucket (metabase#19684)", async () => {
      const query = createQueryWithBreakoutAndTemporalBucket("Don't bin");
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
      const query = createQueryWithBreakoutAndTemporalBucket("Quarter");
      const { updateQuery } = setup({
        step: createMockNotebookStep({ query }),
      });

      await userEvent.click(screen.getByText("Created At: Quarter"));
      await userEvent.click(await screen.findByText("Created At"));

      expect(updateQuery).not.toHaveBeenCalled();
    });

    it("should allow to add a breakout for a column with an existing breakout but with a different binning strategy", async () => {
      const query = createQueryWithBreakoutAndBinningStrategy("10 bins");
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
      const query = createQueryWithBreakoutAndBinningStrategy("10 bins");
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
      const query = createQueryWithBreakoutAndTemporalBucket("Year");
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
      const query = createQueryWithBreakoutAndTemporalBucket("Year");
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

  describe("metrics", () => {
    it("should allow to select date and datetime columns only", async () => {
      const question = DEFAULT_QUESTION.setType("metric");
      const step = createMockNotebookStep({ question });
      const { getNextBreakouts } = setup({ step });

      await userEvent.click(screen.getByText("Pick a column to group by"));
      expect(await screen.findByText("Orders")).toBeInTheDocument();
      expect(await screen.findByText("Created At")).toBeInTheDocument();
      expect(screen.queryByText("Tax")).not.toBeInTheDocument();

      await userEvent.click(screen.getByText("User"));
      expect(await screen.findByText("Created At")).toBeInTheDocument();
      expect(await screen.findByText("Birth Date")).toBeInTheDocument();
      expect(screen.queryByText("Email")).not.toBeInTheDocument();

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
        screen.queryByText("No datetime columns available"),
      ).not.toBeInTheDocument();
    });

    it("should not allow to select when there are no date or datetime columns", () => {
      const metadata = createMockMetadata({
        databases: [
          createSampleDatabase({
            tables: [createOrdersTable({ fields: [createOrdersIdField()] })],
          }),
        ],
      });
      const question = new Question(
        createMockCard({ type: "metric" }),
        metadata,
      );
      const step = createMockNotebookStep({
        question,
        query: question.query(),
      });
      setup({ step });

      expect(
        screen.getByText("No datetime columns available"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Pick a column to group by"),
      ).not.toBeInTheDocument();
    });

    it("should not allow to add more than 1 breakout", async () => {
      const query = createQueryWithClauses({
        breakouts: [{ tableName: "ORDERS", columnName: "CREATED_AT" }],
      });
      const question = DEFAULT_QUESTION.setType("metric").setQuery(query);
      const step = createMockNotebookStep({ question });
      setup({ step });

      expect(queryIcon("add")).not.toBeInTheDocument();
    });
  });
});

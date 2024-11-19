import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";
import * as Lib from "metabase-lib";
import { createQueryWithClauses } from "metabase-lib/test-helpers";

import { CompareAggregations } from "./CompareAggregations";

const queryWithCountAggregation = createQueryWithClauses({
  aggregations: [{ operatorName: "count" }],
});

const queryWithCountAndSumAggregations = createQueryWithClauses({
  aggregations: [
    { operatorName: "count" },
    { operatorName: "sum", columnName: "PRICE", tableName: "PRODUCTS" },
  ],
});

const queryWithYearBreakout = createQueryWithClauses({
  aggregations: [{ operatorName: "count" }],
  breakouts: [
    {
      tableName: "ORDERS",
      columnName: "CREATED_AT",
      temporalBucketName: "Year",
    },
  ],
});

interface SetupOpts {
  query: Lib.Query;
}

const setup = ({ query }: SetupOpts) => {
  const stageIndex = -1;
  const onClose = jest.fn();
  const onSubmit = jest.fn();
  const aggregations = Lib.aggregations(query, stageIndex);

  renderWithProviders(
    <CompareAggregations
      aggregations={aggregations}
      query={query}
      stageIndex={stageIndex}
      onClose={onClose}
      onSubmit={onSubmit}
    />,
  );

  return { onClose, onSubmit };
};

describe("CompareAggregations", () => {
  describe("single aggregation", () => {
    it("does not show step to pick aggregation", () => {
      setup({ query: queryWithCountAggregation });

      expect(
        screen.getByText("Compare “Count” to the past"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Compare one of these to the past"),
      ).not.toBeInTheDocument();
    });

    it("calls onClose when going back to previous step", async () => {
      const { onClose } = setup({ query: queryWithCountAggregation });

      expect(
        screen.getByText("Compare “Count” to the past"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Compare one of these to the past"),
      ).not.toBeInTheDocument();

      await userEvent.click(screen.getByText("Compare “Count” to the past"));

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("multiple aggregations", () => {
    it("shows step to pick aggregation", async () => {
      setup({ query: queryWithCountAndSumAggregations });

      expect(
        screen.getByText("Compare one of these to the past"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Compare “Count” to the past"),
      ).not.toBeInTheDocument();
      expect(screen.getByText("Count")).toBeInTheDocument();
      expect(screen.getByText("Sum of Price")).toBeInTheDocument();
    });

    it("allows to go back and forth between steps", async () => {
      const { onClose } = setup({
        query: queryWithCountAndSumAggregations,
      });

      await userEvent.click(screen.getByText("Count"));

      expect(
        screen.getByText("Compare “Count” to the past"),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByText("Compare “Count” to the past"));

      await userEvent.click(screen.getByText("Sum of Price"));

      expect(
        screen.getByText("Compare “Sum of Price” to the past"),
      ).toBeInTheDocument();

      await userEvent.click(
        screen.getByText("Compare “Sum of Price” to the past"),
      );

      expect(onClose).not.toHaveBeenCalled();

      await userEvent.click(
        screen.getByText("Compare one of these to the past"),
      );

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("offset", () => {
    describe("presets", () => {
      it("should show relevant presets for the breakout", async () => {
        setup({ query: queryWithCountAggregation });

        expect(screen.getByText("Previous month")).toBeInTheDocument();
        expect(screen.getByText("Previous year")).toBeInTheDocument();
        expect(screen.getByText("Custom...")).toBeInTheDocument();

        expect(screen.getByText("Done")).toBeEnabled();
      });
    });

    describe("custom period", () => {
      describe("offset input", () => {
        it("does not allow negative values", async () => {
          setup({ query: queryWithCountAggregation });

          await userEvent.click(screen.getByText("Custom..."));
          const input = screen.getByLabelText("Offset");

          await userEvent.clear(input);
          await userEvent.type(input, "-5");
          await userEvent.tab();

          expect(input).toHaveValue(5);
        });

        it("does not allow zero value", async () => {
          setup({ query: queryWithCountAggregation });

          await userEvent.click(screen.getByText("Custom..."));
          const input = screen.getByLabelText("Offset");

          await userEvent.clear(input);
          await userEvent.type(input, "0");
          await userEvent.tab();

          expect(input).toHaveValue(1);
        });

        it("does not allow non-integer values", async () => {
          setup({ query: queryWithCountAggregation });

          await userEvent.click(screen.getByText("Custom..."));
          const input = screen.getByLabelText("Offset");

          await userEvent.clear(input);
          await userEvent.type(input, "1.234");
          await userEvent.tab();

          expect(input).toHaveValue(1);
        });
      });

      describe("unit input", () => {
        it("should render with the currently picked bucket", async () => {
          setup({ query: queryWithYearBreakout });

          await userEvent.click(screen.getByText("Custom..."));
          const input = screen.getByLabelText("Unit");
          expect(input).toHaveValue("Year");
        });

        it("should pluralize the unit when appropriate", async () => {
          setup({ query: queryWithYearBreakout });

          await userEvent.click(screen.getByText("Custom..."));

          const offsetInput = screen.getByLabelText("Offset");

          await userEvent.clear(offsetInput);
          await userEvent.type(offsetInput, "2");
          await userEvent.tab();

          const input = screen.getByLabelText("Unit");
          expect(input).toHaveValue("Years");
        });
      });
    });
  });

  describe("moving average", () => {
    it("allows switching to moving averages", async () => {
      setup({ query: queryWithCountAggregation });
      expect(screen.getByText("Moving average")).toBeInTheDocument();
      await userEvent.click(screen.getByText("Moving average"));

      expect(screen.getByText("Include this month")).toBeInTheDocument();
    });

    describe("input", () => {
      it("should not allow setting a moving average for less than 2 periods", async () => {
        setup({ query: queryWithCountAggregation });

        expect(screen.getByText("Moving average")).toBeInTheDocument();
        await userEvent.click(screen.getByText("Moving average"));

        const input = screen.getByLabelText("Offset");
        expect(input).toHaveValue(2);

        await userEvent.clear(input);
        await userEvent.type(input, "1");
        await userEvent.tab();

        expect(input).toHaveValue(2);
      });
    });

    describe("unit input", () => {
      it("should not pluralize the unit", async () => {
        setup({ query: queryWithCountAggregation });

        expect(screen.getByText("Moving average")).toBeInTheDocument();
        await userEvent.click(screen.getByText("Moving average"));

        const input = screen.getByLabelText("Unit");
        expect(input).toHaveValue("Month");
      });
    });

    describe("current period checkbox", () => {
      it("should be disabled by default", async () => {
        setup({ query: queryWithCountAggregation });

        expect(screen.getByText("Moving average")).toBeInTheDocument();
        await userEvent.click(screen.getByText("Moving average"));

        const input = screen.getByLabelText("Include this month");
        expect(input).not.toBeChecked();
      });

      it("respect the selected bucket name", async () => {
        setup({ query: queryWithYearBreakout });

        expect(screen.getByText("Moving average")).toBeInTheDocument();
        await userEvent.click(screen.getByText("Moving average"));

        const input = screen.getByLabelText("Include this year");
        expect(input).not.toBeChecked();
      });
    });
  });

  describe("submit", () => {
    it("is submittable by default", async () => {
      setup({ query: queryWithCountAggregation });

      await userEvent.click(screen.getByText("Custom..."));
      expect(screen.getByLabelText("Offset")).toHaveValue(1);
      expect(screen.getByText("Previous value")).toBeInTheDocument();
      expect(screen.getByText("Percentage difference")).toBeInTheDocument();
      expect(screen.queryByText("Value difference")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
    });

    it("disables the submit button when offset input is empty", async () => {
      setup({ query: queryWithCountAggregation });

      await userEvent.click(screen.getByText("Custom..."));
      const input = screen.getByLabelText("Offset");
      await userEvent.clear(input);

      expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();
    });

    it("disables the submit button when no columns are selected", async () => {
      setup({ query: queryWithCountAggregation });

      await userEvent.click(screen.getByText("Custom..."));
      await userEvent.click(screen.getByLabelText("Columns to create"));

      const listBox = screen.getByRole("listbox");
      await userEvent.click(within(listBox).getByText("Previous value"));
      await userEvent.click(within(listBox).getByText("Percentage difference"));

      expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();
    });

    it("calls 'onSubmit' with single aggregation", async () => {
      const { onSubmit } = setup({ query: queryWithCountAggregation });

      await userEvent.click(screen.getByLabelText("Columns to create"));

      const listBox = screen.getByRole("listbox");
      await userEvent.click(within(listBox).getByText("Previous value"));
      await userEvent.click(screen.getByRole("button", { name: "Done" }));

      const [_, aggregations] = onSubmit.mock.lastCall;
      expect(onSubmit).toHaveBeenCalled();
      expect(aggregations).toHaveLength(1);
    });

    it("calls 'onSubmit' with multiple aggregations", async () => {
      const { onSubmit } = setup({ query: queryWithCountAggregation });

      await userEvent.click(screen.getByRole("button", { name: "Done" }));

      const [_, aggregations] = onSubmit.mock.lastCall;
      expect(onSubmit).toHaveBeenCalled();
      expect(aggregations).toHaveLength(2);
    });
  });
});

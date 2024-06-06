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
        screen.getByText("Compare “Count” to previous period"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Compare one of these to the previous period"),
      ).not.toBeInTheDocument();
    });

    it("calls onClose when going back to previous step", async () => {
      const { onClose } = setup({ query: queryWithCountAggregation });

      expect(
        screen.getByText("Compare “Count” to previous period"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Compare one of these to the previous period"),
      ).not.toBeInTheDocument();

      await userEvent.click(
        screen.getByText("Compare “Count” to previous period"),
      );

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("multiple aggregations", () => {
    it("shows step to pick aggregation", async () => {
      setup({ query: queryWithCountAndSumAggregations });

      expect(
        screen.getByText("Compare one of these to the previous period"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Compare “Count” to previous period"),
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
        screen.getByText("Compare “Count” to previous period"),
      ).toBeInTheDocument();

      await userEvent.click(
        screen.getByText("Compare “Count” to previous period"),
      );

      await userEvent.click(screen.getByText("Sum of Price"));

      expect(
        screen.getByText("Compare “Sum of Price” to previous period"),
      ).toBeInTheDocument();

      await userEvent.click(
        screen.getByText("Compare “Sum of Price” to previous period"),
      );

      expect(onClose).not.toHaveBeenCalled();

      await userEvent.click(
        screen.getByText("Compare one of these to the previous period"),
      );

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("offset input", () => {
    it("does not allow negative values", async () => {
      setup({ query: queryWithCountAggregation });

      const input = screen.getByLabelText("Previous period");

      await userEvent.clear(input);
      await userEvent.type(input, "-5");
      await userEvent.tab();

      expect(input).toHaveValue(5);
    });

    it("does not allow non-integer values", async () => {
      setup({ query: queryWithCountAggregation });

      const input = screen.getByLabelText("Previous period");

      await userEvent.clear(input);
      await userEvent.type(input, "1.234");
      await userEvent.tab();

      expect(input).toHaveValue(1);
    });
  });

  describe("submit", () => {
    it("is submittable by default", () => {
      setup({ query: queryWithCountAggregation });

      expect(screen.getByLabelText("Previous period")).toHaveValue(1);
      expect(screen.getByText("Previous value")).toBeInTheDocument();
      expect(screen.getByText("Percentage difference")).toBeInTheDocument();
      expect(screen.queryByText("Value difference")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
    });

    it("disables the submit button when offset input is empty", async () => {
      setup({ query: queryWithCountAggregation });

      const input = screen.getByLabelText("Previous period");

      await userEvent.clear(input);

      expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();
    });

    it("disables the submit button when no columns are selected", async () => {
      setup({ query: queryWithCountAggregation });

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

      const [aggregations] = onSubmit.mock.lastCall;
      expect(onSubmit).toHaveBeenCalled();
      expect(aggregations).toHaveLength(1);
    });

    it("calls 'onSubmit' with multiple aggregations", async () => {
      const { onSubmit } = setup({ query: queryWithCountAggregation });

      await userEvent.click(screen.getByRole("button", { name: "Done" }));

      const [aggregations] = onSubmit.mock.lastCall;
      expect(onSubmit).toHaveBeenCalled();
      expect(aggregations).toHaveLength(2);
    });
  });
});

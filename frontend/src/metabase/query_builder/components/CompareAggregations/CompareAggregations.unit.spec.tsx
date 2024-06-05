import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type * as Lib from "metabase-lib";
import { createQueryWithClauses } from "metabase-lib/test-helpers";

import { CompareAggregations } from "./CompareAggregations";

interface SetupOpts {
  query: Lib.Query;
}

const setup = ({ query }: SetupOpts) => {
  const stageIndex = -1;
  const onClose = jest.fn();
  const onSubmit = jest.fn();

  renderWithProviders(
    <CompareAggregations
      query={query}
      stageIndex={stageIndex}
      onClose={onClose}
      onSubmit={onSubmit}
    />,
  );

  return { onClose };
};

describe("CompareAggregations", () => {
  describe("single aggregation", () => {
    it("does not show step to pick aggregation", () => {
      setup({ query: createQueryWithCountAggregation() });

      expect(
        screen.getByText("Compare “Count” to previous period"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Compare one of these to the previous period"),
      ).not.toBeInTheDocument();
    });

    it("calls onClose when going back to previous step", async () => {
      const { onClose } = setup({ query: createQueryWithCountAggregation() });

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
      setup({ query: createQueryWithCountAndSumAggregations() });

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
        query: createQueryWithCountAndSumAggregations(),
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
      setup({ query: createQueryWithCountAggregation() });

      const input = screen.getByLabelText("Previous period");

      await userEvent.clear(input);
      await userEvent.type(input, "-5");
      await userEvent.tab();

      expect(input).toHaveValue(5);
    });

    it("does not allow non-integer values", async () => {
      setup({ query: createQueryWithCountAggregation() });

      const input = screen.getByLabelText("Previous period");

      await userEvent.clear(input);
      await userEvent.type(input, "1.234");
      await userEvent.tab();

      expect(input).toHaveValue(1);
    });
  });
});

function createQueryWithCountAggregation() {
  return createQueryWithClauses({
    aggregations: [{ operatorName: "count" }],
  });
}

function createQueryWithCountAndSumAggregations() {
  return createQueryWithClauses({
    aggregations: [
      { operatorName: "count" },
      { operatorName: "sum", columnName: "PRICE", tableName: "PRODUCTS" },
    ],
  });
}

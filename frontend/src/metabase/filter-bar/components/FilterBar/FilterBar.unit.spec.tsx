import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import {
  MOCK_ADAPTER,
  type MockFilter,
  and,
  leaf,
  mockExpression,
  mockFilter,
  mockSegment,
  or,
} from "../../test-utils";
import type { FilterStages } from "../../types";

import { FilterBar } from "./FilterBar";

type SetupOpts = {
  value: FilterStages<MockFilter>;
};

const setup = ({ value }: SetupOpts) => {
  const onChange = jest.fn<void, [FilterStages<MockFilter>]>();
  renderWithProviders(
    <FilterBar value={value} onChange={onChange} adapter={MOCK_ADAPTER} />,
  );
  return { onChange };
};

const getPillTexts = () =>
  screen.getAllByTestId("filter-pill").map((pill) => pill.textContent);

describe("FilterBar", () => {
  it("shows a comparison operator by its key", () => {
    setup({ value: [leaf(mockFilter("id", ">=", "10"))] });

    expect(getPillTexts()).toEqual(["ID>=10"]);
  });

  it("shows other operators by their label", () => {
    setup({ value: [leaf(mockFilter("status", "=", "paid"))] });

    expect(getPillTexts()).toEqual(["Statusispaid"]);
  });

  it("shows the two values of a range apart", () => {
    setup({ value: [leaf(mockFilter("subtotal", "between", "20", "100"))] });

    expect(getPillTexts()).toEqual(["Subtotalis between20and100"]);
  });

  it("shows three values and the number of the rest", () => {
    setup({
      value: [leaf(mockFilter("state", "=", "CA", "NY", "TX", "WA", "OR"))],
    });

    expect(getPillTexts()).toEqual(["StateisCA, NY, TX, ...+2"]);
  });

  it("shows no values for an operator without values", () => {
    setup({ value: [leaf(mockFilter("status", "is-empty"))] });

    expect(getPillTexts()).toEqual(["Statusis empty"]);
  });

  it("shows an opaque pill by its name", () => {
    setup({ value: [leaf(mockSegment("Active users"))] });

    expect(getPillTexts()).toEqual(["Active users"]);
  });

  it("shows a custom expression as its text", () => {
    setup({ value: [leaf(mockExpression("[Subtotal] > 10"))] });

    expect(getPillTexts()).toEqual(["[Subtotal] > 10"]);
  });

  it("hides the and without an or and the then before the first pill", () => {
    setup({
      value: [
        and(),
        and(
          leaf(mockFilter("count", ">", "5")),
          leaf(mockFilter("count", "<", "10")),
        ),
      ],
    });

    expect(screen.queryByText("and")).not.toBeInTheDocument();
    expect(screen.queryByText("then")).not.toBeInTheDocument();
    expect(getPillTexts()).toEqual(["Count>5", "Count<10"]);
  });

  it("shows connectors and parentheses once there is an or", () => {
    setup({
      value: [
        and(
          leaf(mockFilter("id", "=", "1")),
          or(
            leaf(mockFilter("id", "=", "2")),
            leaf(mockFilter("id", "=", "3")),
          ),
        ),
      ],
    });

    expect(screen.getByText("and")).toBeInTheDocument();
    expect(screen.getByText("or")).toBeInTheDocument();
    expect(screen.getByText("(")).toBeInTheDocument();
    expect(screen.getByText(")")).toBeInTheDocument();
  });

  it("clears all filters", async () => {
    const { onChange } = setup({ value: [leaf(mockFilter("id", "=", "1"))] });

    await userEvent.click(screen.getByLabelText("Clear all filters"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("has no clear button without filters", () => {
    setup({ value: [] });

    expect(
      screen.queryByLabelText("Clear all filters"),
    ).not.toBeInTheDocument();
  });
});

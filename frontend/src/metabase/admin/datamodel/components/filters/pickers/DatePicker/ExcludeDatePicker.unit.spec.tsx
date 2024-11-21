import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/lib/types";
import Filter from "metabase-lib/v1/queries/structured/Filter";
import {
  ORDERS,
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import ExcludeDatePicker from "./ExcludeDatePicker";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});
const ordersTable = checkNotNull(metadata.table(ORDERS_ID));
// eslint-disable-next-line no-restricted-syntax
const query = ordersTable.legacyQuery({ useStructuredQuery: true });
const filter = new Filter(
  [null, ["field", ORDERS.CREATED_AT, null]],
  null,
  query,
);
const hours = Array.from({ length: 24 }, (_, i) => i);

type SetupOpts = {
  filter: Filter;
};

function setup({ filter }: SetupOpts) {
  const onFilterChange = jest.fn();
  const onCommit = jest.fn();

  render(
    <ExcludeDatePicker
      filter={filter}
      onFilterChange={onFilterChange}
      onCommit={onCommit}
    />,
  );

  return { onFilterChange, onCommit };
}

describe("ExcludeDatePicker", () => {
  beforeAll(() => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(new Date(2020, 0, 1));
  });

  it("should allow to exclude hours", async () => {
    const filter = new Filter(
      ["!=", ["field", ORDERS.CREATED_AT, { "temporal-unit": "hour-of-day" }]],
      null,
      query,
    );
    const { onFilterChange } = setup({ filter });
    expect(screen.getByLabelText("Select all")).not.toBeChecked();
    expect(screen.getByLabelText("8 AM")).not.toBeChecked();

    await userEvent.click(screen.getByLabelText("8 AM"));
    expect(onFilterChange).toHaveBeenCalledWith([
      "!=",
      ["field", ORDERS.CREATED_AT, { "temporal-unit": "hour-of-day" }],
      8,
    ]);
  });

  it("should allow to exclude all options", async () => {
    const filter = new Filter(
      [
        "!=",
        ["field", ORDERS.CREATED_AT, { "temporal-unit": "hour-of-day" }],
        8,
      ],
      null,
      query,
    );
    const { onFilterChange } = setup({ filter });
    expect(screen.getByLabelText("Select all")).not.toBeChecked();
    expect(screen.getByLabelText("8 AM")).toBeChecked();

    await userEvent.click(screen.getByLabelText("Select all"));
    expect(onFilterChange).toHaveBeenCalledWith([
      "!=",
      ["field", ORDERS.CREATED_AT, { "temporal-unit": "hour-of-day" }],
      ...hours,
    ]);
  });

  it("should allow to deselect all options", async () => {
    const filter = new Filter(
      [
        "!=",
        ["field", ORDERS.CREATED_AT, { "temporal-unit": "hour-of-day" }],
        ...hours,
      ],
      null,
      query,
    );
    const { onFilterChange } = setup({ filter });
    expect(screen.getByLabelText("Select none")).toBeChecked();
    expect(screen.getByLabelText("8 AM")).toBeChecked();

    await userEvent.click(screen.getByLabelText("Select none"));
    expect(onFilterChange).toHaveBeenCalledWith([
      "!=",
      ["field", ORDERS.CREATED_AT, { "temporal-unit": "hour-of-day" }],
    ]);
  });

  it("is empty option should exclude empty values by applying not-null filter", async () => {
    const { onCommit } = setup({ filter });

    await userEvent.click(screen.getByText("Is empty"));

    expect(onCommit).toHaveBeenCalledWith([
      "not-null",
      ["field", ORDERS.CREATED_AT, null],
    ]);
  });

  it("is not empty option should exclude non-empty values by applying is-null filter", async () => {
    const { onCommit } = setup({ filter });

    await userEvent.click(screen.getByText("Is not empty"));

    expect(onCommit).toHaveBeenCalledWith([
      "is-null",
      ["field", ORDERS.CREATED_AT, null],
    ]);
  });
});

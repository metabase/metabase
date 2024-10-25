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
const query = ordersTable.legacyQuery({ useStructuredQuery: true });

const filter = new Filter(
  [null, ["field", ORDERS.CREATED_AT, null]],
  null,
  query,
);

type SetupOpts = {
  filter: Filter;
};

function setup({ filter }: SetupOpts) {
  const onFilterChange = jest.fn();
  const onCommit = jest.fn();

  render(
    <ExcludeDatePicker
      filter={filter}
      onFilterChange={jest.fn()}
      onCommit={onCommit}
    />,
  );

  return { onFilterChange, onCommit };
}

describe("ExcludeDatePicker", () => {
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

import { render, fireEvent, screen } from "@testing-library/react";

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

describe("ExcludeDatePicker", () => {
  it("is empty option should exclude empty values by applying not-null filter", () => {
    const commitMock = jest.fn();
    render(
      <ExcludeDatePicker
        onFilterChange={jest.fn()}
        onCommit={commitMock}
        filter={filter}
      />,
    );

    fireEvent.click(screen.getByText("Is empty"));

    expect(commitMock).toHaveBeenCalledWith([
      "not-null",
      ["field", ORDERS.CREATED_AT, null],
    ]);
  });

  it("is not empty option should exclude non-empty values by applying is-null filter", () => {
    const commitMock = jest.fn();
    render(
      <ExcludeDatePicker
        onFilterChange={jest.fn()}
        onCommit={commitMock}
        filter={filter}
      />,
    );

    fireEvent.click(screen.getByText("Is not empty"));

    expect(commitMock).toHaveBeenCalledWith([
      "is-null",
      ["field", ORDERS.CREATED_AT, null],
    ]);
  });
});

import { renderHook } from "@testing-library/react";

import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER, columnFinder } from "metabase-lib/test-helpers";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import { useStableQuery, useStableValue } from "./use-stable-value";

const buildOrdersQuery = (total: number) => {
  const table = Lib.tableOrCardMetadata(SAMPLE_PROVIDER, ORDERS_ID);
  if (table === null) {
    throw new Error("No ORDERS table");
  }
  const query = Lib.queryFromTableOrCardMetadata(SAMPLE_PROVIDER, table);
  const findColumn = columnFinder(query, Lib.filterableColumns(query, 0));
  return Lib.filter(
    query,
    0,
    Lib.numberFilterClause({
      operator: ">",
      column: findColumn("ORDERS", "TOTAL"),
      values: [total],
    }),
  );
};

describe("useStableValue", () => {
  it("keeps the first value while later ones are deep-equal", () => {
    const first = { a: [1] };
    const { result, rerender } = renderHook(
      ({ value }) => useStableValue(value),
      {
        initialProps: { value: first },
      },
    );

    rerender({ value: { a: [1] } });
    expect(result.current).toBe(first);

    const changed = { a: [2] };
    rerender({ value: changed });
    expect(result.current).toBe(changed);
  });
});

describe("useStableQuery", () => {
  it("keeps the query when it's built again with new clause uuids", () => {
    const first = buildOrdersQuery(10);
    const { result, rerender } = renderHook(
      ({ query }) => useStableQuery(query),
      { initialProps: { query: first } },
    );

    rerender({ query: buildOrdersQuery(10) });
    expect(result.current).toBe(first);
  });

  it("gives the new query when it changes", () => {
    const { result, rerender } = renderHook(
      ({ query }) => useStableQuery(query),
      { initialProps: { query: buildOrdersQuery(10) } },
    );

    const changed = buildOrdersQuery(20);
    rerender({ query: changed });
    expect(result.current).toBe(changed);
  });
});

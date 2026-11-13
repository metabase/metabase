import { act, renderHookWithProviders } from "__support__/ui";
import type { Field, Table } from "metabase-types/api";
import { createMockField, createMockTable } from "metabase-types/api/mocks";

import { useTableStructures } from "./table-structure";

const field = (id: number, name: string, opts: Partial<Field> = {}) =>
  createMockField({ id, name, display_name: name, table_id: 1, ...opts });

const ORDERS_FIELDS = [
  field(1, "id", { semantic_type: "type/PK" }),
  field(2, "customer_id"),
  field(3, "created_at", {
    base_type: "type/DateTime",
    effective_type: "type/DateTime",
  }),
];

const HISTORY_FIELDS = [
  field(11, "id", { semantic_type: "type/PK", table_id: 2 }),
  field(12, "worker_id", { table_id: 2 }),
  field(13, "valid_from", {
    table_id: 2,
    base_type: "type/Date",
    effective_type: "type/Date",
  }),
  field(14, "valid_to", {
    table_id: 2,
    base_type: "type/Date",
    effective_type: "type/Date",
  }),
];

type SetupOpts = { table: Table };

function setup({ table }: SetupOpts) {
  const { result } = renderHookWithProviders(() => useTableStructures(), {});
  const getGrainNames = () =>
    result.current
      .getTableStructure(table)
      .grainFields.map((grainField) => grainField.name);
  return { result, getGrainNames };
}

describe("useTableStructures grain", () => {
  beforeEach(() => window.localStorage.clear());

  it("starts as the primary key", () => {
    const table = createMockTable({
      id: 1,
      name: "orders",
      fields: ORDERS_FIELDS,
    });
    const { getGrainNames } = setup({ table });

    expect(getGrainNames()).toEqual(["id"]);
  });

  it("starts as the matched-on column and start date for a history table", () => {
    const table = createMockTable({
      id: 2,
      name: "worker_address_history",
      fields: HISTORY_FIELDS,
    });
    const { getGrainNames } = setup({ table });

    expect(getGrainNames()).toEqual(["worker_id", "valid_from"]);
  });

  it("saves the columns picked for a table", () => {
    const table = createMockTable({
      id: 1,
      name: "orders",
      fields: ORDERS_FIELDS,
    });
    const { result, getGrainNames } = setup({ table });

    act(() => result.current.setTableGrain(table, [2, 3]));
    expect(getGrainNames()).toEqual(["customer_id", "created_at"]);

    act(() => result.current.setTableGrain(table, [1]));
    expect(getGrainNames()).toEqual(["id"]);
  });
});

import fetchMock from "fetch-mock";

import { getMainStore } from "__support__/entities-store";
import {
  setupTableQueryMetadataEndpoint,
  setupUnauthorizedFieldEndpoint,
} from "__support__/server-mocks";
import { getMetadata } from "metabase/metadata-store";
import { createMockField, createMockTable } from "metabase-types/api/mocks";

import { fetchTableMetadataAndForeignKeys } from "./tables";

const TABLE_ID = 1;
const FK_TARGET_FIELD_ID = 3;

const FK_FIELD = createMockField({
  id: 1,
  table_id: TABLE_ID,
  name: "a",
  // This field is a foreign key to a table that the user doesn't have access to
  semantic_type: "type/FK",
  fk_target_field_id: FK_TARGET_FIELD_ID,
  target: undefined,
});

const TABLE_A = createMockTable({
  id: TABLE_ID,
  fields: [FK_FIELD],
});

const LINKED_TABLE_ID = 2;
const LINKED_FIELD_ID = 4;

const LINKED_TABLE = createMockTable({
  id: LINKED_TABLE_ID,
  fields: [createMockField({ id: LINKED_FIELD_ID, table_id: LINKED_TABLE_ID })],
});

const TABLE_B = createMockTable({
  id: TABLE_ID,
  fields: [
    createMockField({
      id: 1,
      table_id: TABLE_ID,
      semantic_type: "type/FK",
      fk_target_field_id: LINKED_FIELD_ID,
    }),
  ],
});

describe("fetchTableMetadataAndForeignKeys", () => {
  it("resolves and loads the table even when a foreign key target field is forbidden", async () => {
    setupTableQueryMetadataEndpoint(TABLE_A);
    setupUnauthorizedFieldEndpoint(createMockField({ id: FK_TARGET_FIELD_ID }));

    const store = getMainStore();

    // Check there's no permission error
    await expect(
      store.dispatch(fetchTableMetadataAndForeignKeys({ id: TABLE_ID })),
    ).resolves.toBeUndefined();

    expect(
      fetchMock.callHistory.called(`path:/api/field/${FK_TARGET_FIELD_ID}`),
    ).toBe(true);

    const table = getMetadata(store.getState()).table(TABLE_ID);
    expect(table).toBeDefined();
  });

  it("loads the table a reachable foreign key target belongs to", async () => {
    setupTableQueryMetadataEndpoint(TABLE_B);
    setupTableQueryMetadataEndpoint(LINKED_TABLE);

    const store = getMainStore();
    // Seed the target field so the thunk can resolve the table it belongs to.
    await store.dispatch(
      fetchTableMetadataAndForeignKeys({ id: LINKED_TABLE_ID }),
    );

    await store.dispatch(fetchTableMetadataAndForeignKeys({ id: TABLE_ID }));

    // The foreign key resolves to a field the store holds, so the thunk asks
    // for that field's table. It never falls back to fetching the field.
    expect(
      fetchMock.callHistory.called(`path:/api/field/${LINKED_FIELD_ID}`),
    ).toBe(false);
    expect(getMetadata(store.getState()).table(LINKED_TABLE_ID)).toBeDefined();
  });
});

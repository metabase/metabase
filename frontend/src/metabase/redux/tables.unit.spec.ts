import fetchMock from "fetch-mock";

import { getMainStore } from "__support__/entities-store";
import {
  setupTableQueryMetadataEndpoint,
  setupUnauthorizedFieldEndpoint,
} from "__support__/server-mocks";
import { getMetadata } from "metabase/selectors/metadata";
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
});

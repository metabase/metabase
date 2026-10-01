import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { render, screen } from "__support__/ui";
import { getEntityLookups } from "metabase/querying/common/components/DataSelector";
import { checkNotNull } from "metabase/utils/types";
import { getSchemaDisplayName } from "metabase-lib/v1/metadata/utils/schema";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";

import { DataSelectorSchemaPicker } from "./DataSelectorSchemaPicker";

describe("DataSelectorSchemaPicker", () => {
  it("displays schema name", () => {
    const schemaName = "Schema name";
    const database = createMockDatabase({
      tables: [createMockTable({ id: 1, db_id: 1, schema: schemaName })],
    });
    const state = createMockState({
      entities: createMockEntitiesState({ databases: [database] }),
    });
    const lookups = getEntityLookups(state);
    const schemas = lookups.databaseSchemas(database.id);

    render(
      <DataSelectorSchemaPicker
        schemas={schemas}
        hasFiltering={false}
        hasInitialFocus={false}
        hasNextStep={false}
        onChangeSchema={jest.fn()}
      />,
    );

    expect(
      screen.getByText(checkNotNull(getSchemaDisplayName(schemaName))),
    ).toBeInTheDocument();
  });
});

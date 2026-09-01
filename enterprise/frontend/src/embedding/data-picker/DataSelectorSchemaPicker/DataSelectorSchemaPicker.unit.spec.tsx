import { createMockEntitiesState } from "__support__/store";
import { render, screen } from "__support__/ui";
import { getMetadata } from "metabase/metadata-store";
import { createMockState } from "metabase/redux/store/mocks";
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
    const schemas = checkNotNull(
      getMetadata(state).database(database.id),
    ).getSchemas();

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

import { render, screen } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import type Schema from "metabase-lib/v1/metadata/Schema";
import { getSchemaDisplayName } from "metabase-lib/v1/metadata/utils/schema";

import { DataSelectorSchemaPicker } from "./DataSelectorSchemaPicker";

describe("DataSelectorSchemaPicker", () => {
  it("displays schema name", () => {
    const schemaName = "Schema name";
    // The picker only reads schema names, so a partial mock is enough here.
    const schemas = [{ name: schemaName }] as Schema[];
    render(
      <DataSelectorSchemaPicker
        schemas={schemas}
        hasFiltering
        hasInitialFocus
        hasNextStep={false}
        isLoading={false}
        onChangeSchema={jest.fn()}
      />,
    );

    expect(
      screen.getByText(checkNotNull(getSchemaDisplayName(schemaName))),
    ).toBeInTheDocument();
  });
});

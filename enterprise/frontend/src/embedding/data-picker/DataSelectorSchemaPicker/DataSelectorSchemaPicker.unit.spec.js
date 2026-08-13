import { render, screen } from "__support__/ui";
import { getSchemaDisplayName } from "metabase-lib/v1/metadata/utils/schema";

import DataSelectorSchemaPicker from "./DataSelectorSchemaPicker";

describe("DataSelectorSchemaPicker", () => {
  it("displays schema name", () => {
    const schemaName = "Schema name";
    const schemas = [{ name: schemaName }];
    render(<DataSelectorSchemaPicker schemas={schemas} />);

    expect(
      screen.getByText(getSchemaDisplayName(schemaName)),
    ).toBeInTheDocument();
  });
});

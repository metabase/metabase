import type { PythonTransformTableAliases } from "metabase-types/api";
import { createMockTable } from "metabase-types/api/mocks";

import { updateTransformSignature } from "./utils";

const TEMPLATE_BODY = `# Write your Python transformation script here
import common
import pandas as pd

def transform():
    """
    Your transformation function.

    Select tables above to add them as function parameters.

    Returns:
        DataFrame to write to the destination table
    """
    # Your transformation logic here
    return pd.DataFrame([{"message": "Hello from Python transform!"}])`;

const TABLE = createMockTable();

const TABLES: PythonTransformTableAliases = [
  { alias: "orders", table_id: 1, schema: "PUBLIC", database_id: 1 },
];

describe("updateTransformSignature", () => {
  it("should add the table alias to the signature and the Args docstring section", () => {
    const script = updateTransformSignature(TEMPLATE_BODY, TABLES, [TABLE]);

    expect(script).toContain("def transform(orders):");
    expect(script).toContain("Args:");
    expect(script).toContain("orders: DataFrame containing the data");
  });

  it("should be idempotent, so re-applying the same tables does not change the script (GDGT-1570)", () => {
    const script = updateTransformSignature(TEMPLATE_BODY, TABLES, [TABLE]);
    const scriptAfter2ndPass = updateTransformSignature(script, TABLES, [
      TABLE,
    ]);

    expect(scriptAfter2ndPass).toBe(script);
  });

  it("should not leave trailing whitespace on the signature line when replacing an existing Args section (GDGT-1570)", () => {
    const script = updateTransformSignature(TEMPLATE_BODY, TABLES, [TABLE]);
    const scriptAfter2ndPass = updateTransformSignature(script, TABLES, [
      TABLE,
    ]);

    expect(scriptAfter2ndPass).toContain("def transform(orders):\n");
    expect(scriptAfter2ndPass).not.toMatch(/[ ]+\n/);
  });
});

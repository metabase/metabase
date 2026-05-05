import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import { createMetadataProvider } from "metabase-lib/test-helpers";
import {
  createMockDatabase,
  createMockField,
  createMockTable,
} from "metabase-types/api/mocks";

import { getName } from "./util";

const DATE = createMockField({
  id: 2,
  name: "Date",
  display_name: "Date",
  semantic_type: "type/Date",
  base_type: "type/String",
});

const TABLE = createMockTable({
  fields: [DATE],
});

const DATABASE = createMockDatabase({
  tables: [TABLE],
});

const METADATA = createMockMetadata({ databases: [DATABASE] });
const PROVIDER = createMetadataProvider({
  databaseId: DATABASE.id,
  metadata: METADATA,
});

const QUERY = Lib.createTestQuery(PROVIDER, {
  stages: [
    {
      source: { type: "table", id: TABLE.id },
    },
  ],
});

describe("getName", () => {
  it("should return a plain name without suffix when no duplicates exist", () => {
    expect(
      getName(QUERY, -1, { displayName: "Bar" } as Lib.ColumnExtractionInfo),
    ).toBe("Bar");
  });

  it("should return a name with a suffix to avoid name clashes", () => {
    expect(
      getName(QUERY, -1, { displayName: "Date" } as Lib.ColumnExtractionInfo),
    ).toBe("Date (1)");
  });
});

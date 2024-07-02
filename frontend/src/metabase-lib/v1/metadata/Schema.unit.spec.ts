import { createMockMetadata } from "__support__/metadata";
import type { Table } from "metabase-types/api";
import { createMockTable } from "metabase-types/api/mocks";

const TEST_TABLE = createMockTable({
  schema: "foo_bar",
});

interface SetupOpts {
  table?: Table;
}

const setup = ({ table = TEST_TABLE }: SetupOpts = {}) => {
  const metadata = createMockMetadata({ tables: [table] });
  const instance = metadata.table(table.id)?.schema;
  if (!instance) {
    throw new TypeError();
  }

  return instance;
};

describe("Schema", () => {
  describe("displayName", () => {
    it("should return a formatted `name` string", () => {
      const schema = setup();
      expect(schema.displayName()).toBe("Foo Bar");
    });
  });
});

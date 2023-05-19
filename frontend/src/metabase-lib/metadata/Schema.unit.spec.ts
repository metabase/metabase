import { Table } from "metabase-types/api";
import { createMockTable } from "metabase-types/api/mocks";
import { createMockMetadata } from "__support__/metadata";

const TEST_TABLE = createMockTable({
  schema: "foo_bar",
});

interface SetupOpts {
  table?: Table;
}

const setup = ({ table = TEST_TABLE }: SetupOpts = {}) => {
  const metadata = createMockMetadata({
    tables: [table],
  });

  return metadata.table(table.id)?.schema;
};

describe("Schema", () => {
  describe("displayName", () => {
    it("should return a formatted `name` string", () => {
      const schema = setup();
      expect(schema?.displayName()).toBe("Foo Bar");
    });
  });
});

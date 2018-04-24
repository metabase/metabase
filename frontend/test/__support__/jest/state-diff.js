const { diffJson } = require("diff");
require("colors");

// default getSnapshot that gets the sample dataset metadata
const { MetabaseApi } = require("metabase/services");
const { useSharedAdminLogin } = require("__support__/integrated_tests");
const GET_SNAPSHOT_DEFAULT = () => {
  useSharedAdminLogin();
  return Promise.all(
    [1, 2, 3, 4].map(tableId => MetabaseApi.table_query_metadata({ tableId })),
  );
};

module.exports = (getSnapshot = GET_SNAPSHOT_DEFAULT) => {
  let beforeSnapshot;
  beforeAll(async () => {
    beforeSnapshot = await getSnapshot();
  });
  afterAll(async () => {
    try {
      const afterSnapshot = await getSnapshot();
      const changes = diffJson(beforeSnapshot, afterSnapshot).filter(
        c => (c.added || c.removed) && c.value.indexOf('"updated_at"') < 0,
      );
      if (changes.length > 0) {
        process.stdout.write("WARNING: METADATA CHANGED\n".red);
        for (const part of changes) {
          const color = part.added ? "green" : part.removed ? "red" : "grey";
          process.stdout.write(part.value[color]);
        }
      }
    } catch (e) {
      console.warn("ERROR", e);
    }
  });
};

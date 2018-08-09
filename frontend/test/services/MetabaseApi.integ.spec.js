import { useSharedAdminLogin } from "__support__/integrated_tests";

import { MetabaseApi } from "metabase/services";

describe("MetabaseApi", () => {
  beforeAll(() => useSharedAdminLogin());
  describe("table_query_metadata", () => {
    // these table IDs correspond to the sample dataset in the fixture db
    [1, 2, 3, 4].map(tableId =>
      it(`should have the correct metadata for table ${tableId}`, async () => {
        expect(
          stripKeys(await MetabaseApi.table_query_metadata({ tableId })),
        ).toMatchSnapshot();
      }),
    );
  });
});

function stripKeys(object) {
  // handles both arrays and objects
  if (object && typeof object === "object") {
    for (const key in object) {
      if (
        /^((updated|created)_at|last_analyzed|timezone|is_on_demand|fields_hash)$/.test(
          key,
        )
      ) {
        delete object[key];
      } else {
        stripKeys(object[key]);
      }
    }
  }
  return object;
}

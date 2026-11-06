import { createMockCard } from "metabase-types/api/mocks";

import { createDataSourceQuery } from "./data-source";

describe("createDataSourceQuery", () => {
  it("should read the data source card so goal references can be answered against it", () => {
    expect(
      createDataSourceQuery(createMockCard({ id: 7, database_id: 3 })),
    ).toEqual({
      type: "query",
      database: 3,
      query: { "source-table": "card__7" },
    });
  });
});

import * as Lib from "metabase-lib";
import { createQueryWithClauses } from "metabase-lib/test-helpers";

import { getGroupItems } from "./filters";

describe("getGroupItems", () => {
  it("should return groups for all stages", () => {
    const query1 = createQueryWithClauses({
      aggregations: [{ operatorName: "count" }],
      breakouts: [{ tableName: "ORDERS", columnName: "TOTAL" }],
    });
    const query2 = createQueryWithClauses({
      query: Lib.appendStage(query1),
      aggregations: [{ operatorName: "count" }],
      breakouts: [{ tableName: "ORDERS", columnName: "TOTAL" }],
    });
    const query3 = createQueryWithClauses({
      query: Lib.appendStage(query2),
      aggregations: [{ operatorName: "count" }],
      breakouts: [{ tableName: "ORDERS", columnName: "TOTAL" }],
    });
    const query4 = createQueryWithClauses({
      query: Lib.appendStage(query3),
      aggregations: [{ operatorName: "count" }],
      breakouts: [{ tableName: "ORDERS", columnName: "TOTAL" }],
    });
    expect(getGroupItems(query1).map(group => group.displayName)).toEqual([
      "Orders",
      "Product",
      "User",
    ]);
    expect(getGroupItems(query2).map(group => group.displayName)).toEqual([
      "Orders",
      "Product",
      "User",
      "Summaries",
    ]);
    expect(getGroupItems(query3).map(group => group.displayName)).toEqual([
      "Orders",
      "Product",
      "User",
      "Summaries",
      "Summaries (2)",
    ]);
    expect(getGroupItems(query4).map(group => group.displayName)).toEqual([
      "Orders",
      "Product",
      "User",
      "Summaries",
      "Summaries (2)",
      "Summaries (3)",
    ]);
  });
});

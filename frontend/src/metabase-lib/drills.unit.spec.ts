import { availableDrillThrus } from "metabase-lib/drills";
import { orderableColumns } from "metabase-lib/order_by";
import { columnFinder, createQuery } from "./test-helpers";

describe("availableDrillThrus", () => {
  it("should return list of available drills", () => {
    const query = createQuery();
    const stageIndex = -1;
    const columns = orderableColumns(query, stageIndex);
    console.log(window.$CLJS.cljs.core.pr_str(query), columns);
    const column = columnFinder(query, columns)("ORDERS", "SUBTOTAL");

    expect(availableDrillThrus(query, stageIndex, column, /* row */ null, /* dimensions */ null)).toEqual([]);
  });
});

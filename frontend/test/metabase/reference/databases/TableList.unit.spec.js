import { separateTablesBySchema } from "metabase/reference/databases/TableList";

describe("separateTablesBySchema", () => {
  it("should filter out hidden tables", () => {
    const tables = { 1: {}, 2: { visibility_type: "hidden" } };
    expect(separateTablesBySchema(tables).length).toBe(1);
  });
});

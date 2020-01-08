import { sortObject } from "metabase-lib/lib/utils";

describe("sortObject", () => {
  it("should serialize identically regardless of property creation order", () => {
    const o1 = {};
    o1.a = 1;
    o1.b = 2;
    const o2 = {};
    o2.b = 2;
    o2.a = 1;

    expect(JSON.stringify(sortObject(o1))).toEqual(
      JSON.stringify(sortObject(o2)),
    );
  });

  it("should not sort arrays", () => {
    expect(sortObject(["a", "c", "b"])).toEqual(["a", "c", "b"]);
  });

  it("should sort keys recursively", () => {
    const o1 = { o: {} };
    o1.o.a = 1;
    o1.o.b = 2;
    const o2 = { o: {} };
    o2.o.b = 2;
    o2.o.a = 1;

    expect(JSON.stringify(sortObject(o1))).toEqual(
      JSON.stringify(sortObject(o2)),
    );
  });
});

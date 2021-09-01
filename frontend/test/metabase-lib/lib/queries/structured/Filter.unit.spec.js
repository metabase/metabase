import Filter from "metabase-lib/lib/queries/structured/Filter";

import { ORDERS, PEOPLE } from "__support__/sample_dataset_fixture";

const query = ORDERS.query();

function filter(mbql) {
  return new Filter(mbql, 0, query);
}

describe("Filter", () => {
  describe("displayName", () => {
    it("should return the correct string for an = filter", () => {
      expect(
        filter(["=", ["field", ORDERS.TOTAL.id, null], 42]).displayName(),
      ).toEqual("Total is equal to 42");
    });
    it("should return the correct string for a segment filter", () => {
      expect(filter(["segment", 1]).displayName()).toEqual("Expensive Things");
    });
  });
  describe("isValid", () => {
    describe("with a field filter", () => {
      it("should return true for a field that exists", () => {
        expect(
          filter(["=", ["field", ORDERS.TOTAL.id, null], 42]).isValid(),
        ).toBe(true);
      });
      it("should return false for a field that doesn't exists", () => {
        expect(filter(["=", ["field", 12341234, null], 42]).isValid()).toBe(
          false,
        );
      });
      it("should return true for a filter with an expression for the field", () => {
        expect(
          filter(["=", ["/", ["field", 12341234, null], 43], 42]).isValid(),
        ).toBe(true);
      });
    });
  });
  describe("operator", () => {
    it("should return the correct FilterOperator", () => {
      expect(
        filter(["=", ["field", ORDERS.TOTAL.id, null], 42]).operator().name,
      ).toBe("=");
    });
  });
  describe("setDimension", () => {
    it("should set the dimension for existing filter clause", () => {
      expect(
        filter(["=", ["field", ORDERS.SUBTOTAL.id, null], 42]).setDimension(
          ["field", ORDERS.TOTAL.id, null],
          {
            useDefaultOperator: true,
          },
        ),
      ).toEqual(["=", ["field", ORDERS.TOTAL.id, null], 42]);
    });
    it("should set the dimension for new filter clause", () => {
      expect(filter([]).setDimension(["field", ORDERS.TOTAL.id, null])).toEqual(
        [null, ["field", ORDERS.TOTAL.id, null]],
      );
    });
    it("should set the dimension and default operator for empty filter clauses", () => {
      expect(
        filter([]).setDimension(["field", ORDERS.TOTAL.id, null], {
          useDefaultOperator: true,
        }),
      ).toEqual(["=", ["field", ORDERS.TOTAL.id, null], undefined]);
    });
    it("should set the dimension correctly when changing from segment", () => {
      expect(
        filter(["segment", 1]).setDimension(["field", ORDERS.TOTAL.id, null]),
      ).toEqual([null, ["field", ORDERS.TOTAL.id, null]]);
    });
    it("should set joined-field for new filter clause", () => {
      const q = ORDERS.query().join({
        alias: "foo",
        "source-table": PEOPLE.id,
      });
      const f = new Filter([], 0, q);
      expect(
        f.setDimension(["field", PEOPLE.EMAIL.id, { "join-alias": "foo" }], {
          useDefaultOperator: true,
        }),
      ).toEqual([
        "=",
        ["field", PEOPLE.EMAIL.id, { "join-alias": "foo" }],
        undefined,
      ]);
    });
  });

  const CASES = [
    ["isStandard", ["=", ["field", 1, null], 42]],
    ["isStandard", [null, ["field", 1, null]]], // assume null operator is standard
    ["isStandard", ["between", ["field", 1, null], 1, 4]],
    ["isStandard", ["contains", ["field", 1, null], "river"]],
    ["isStandard", ["is-empty", ["field", 1, null]]],
    ["isStandard", ["starts-with", ["field", 1, null], "X"]],
    ["isStandard", ["ends-with", ["field", 1, null], "Y"]],
    ["isStandard", ["=", ["field", 1, null], undefined]], // standard but invalid
    ["isStandard", ["between", ["field", 1, null], undefined, 4]], // standard but invalid
    ["isSegment", ["segment", 1]],
    ["isCustom", ["or", ["=", ["field", 1, null], 42]]],
    ["isCustom", ["=", ["field", 1, null], ["field", 2, null]]],
    ["isCustom", ["between", ["field", 1, null], 1, ["field", 2, null]]],
    ["isCustom", ["between", ["field", 1, null], ["field", 2, null], 3]],
    ["isCustom", ["between", ["field", 1, null], ["field", 7], ["field", 9]]],
    ["isCustom", ["contains", ["field", 8], ["upper", "cat"]]],
    ["isCustom", ["starts-with", ["field", 1, null], ["lower", "X"]]],
    ["isCustom", ["ends-with", ["field", 1, null], ["trim", "Y"]]],
  ];
  for (const method of ["isStandard", "isSegment", "isCustom"]) {
    describe(method, () => {
      for (const [method_, mbql] of CASES) {
        const expected = method_ === method;
        it(`should return ${expected} for ${JSON.stringify(mbql)}`, () => {
          expect(filter(mbql)[method]()).toEqual(expected);
        });
      }
    });
  }
});

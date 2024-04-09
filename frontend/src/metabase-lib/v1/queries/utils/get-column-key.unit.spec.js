import { getColumnKey } from "metabase-lib/v1/queries/utils/get-column-key";

describe("getColumnKey", () => {
  // NOTE: run legacy tests with and without a field_ref. without is disabled in latest since it now always uses
  // field_ref, leaving test code in place to compare against older versions
  for (const fieldRefEnabled of [/*false,*/ true]) {
    describe(fieldRefEnabled ? "with field_ref" : "without field_ref", () => {
      it("should return [ref [field ...]] for field", () => {
        expect(
          getColumnKey({
            name: "foo",
            id: 1,
            field_ref: fieldRefEnabled ? ["field", 1, null] : undefined,
          }),
        ).toEqual(JSON.stringify(["ref", ["field", 1, null]]));
      });
      it("should return [ref [field ...]] for foreign field", () => {
        expect(
          getColumnKey({
            name: "foo",
            id: 1,
            fk_field_id: 2,
            field_ref: fieldRefEnabled
              ? ["field", 1, { "source-field": 2 }]
              : undefined,
          }),
        ).toEqual(JSON.stringify(["ref", ["field", 1, { "source-field": 2 }]]));
      });
      it("should return [ref [expression ...]] for expression", () => {
        expect(
          getColumnKey({
            name: "foo",
            expression_name: "foo",
            field_ref: fieldRefEnabled ? ["expression", "foo"] : undefined,
          }),
        ).toEqual(JSON.stringify(["ref", ["expression", "foo"]]));
      });
      it("should return [name ...] for aggregation", () => {
        const col = {
          name: "foo",
          source: "aggregation",
          field_ref: fieldRefEnabled ? ["aggregation", 0] : undefined,
        };
        expect(getColumnKey(col, [col])).toEqual(
          // NOTE: not ideal, matches existing behavior, but should be ["aggregation", 0]
          JSON.stringify(["name", "foo"]),
        );
      });
      it("should return [name ...] for aggregation on field literal", () => {
        const col = {
          name: "foo",
          id: ["field", "foo", { "base-type": "type/Integer" }],
          field_ref: fieldRefEnabled
            ? ["field", "foo", { "base-type": "type/Integer" }]
            : undefined,
        };
        expect(getColumnKey(col, [col])).toEqual(
          // NOTE: not ideal, matches existing behavior, but should be ["field", "foo", {"base-type": "type/Integer"}]
          JSON.stringify(["name", "foo"]),
        );
      });
      it("should return [field ...] for native query column", () => {
        expect(
          getColumnKey({
            name: "foo",
            field_ref: fieldRefEnabled
              ? ["field", "foo", { "base-type": "type/Integer" }]
              : undefined,
          }),
        ).toEqual(
          // NOTE: not ideal, matches existing behavior, but should be ["field", "foo", {"base-type": "type/Integer"}]
          JSON.stringify(["name", "foo"]),
        );
      });
    });
  }

  describe("with field_ref", () => {
    it("should return [ref [field ...]] for joined field", () => {
      const col = {
        name: "foo",
        id: 1,
        field_ref: ["field", 1, { "join-alias": "x" }],
      };
      expect(getColumnKey(col)).toEqual(
        JSON.stringify(["ref", ["field", 1, { "join-alias": "x" }]]),
      );
    });
  });
});

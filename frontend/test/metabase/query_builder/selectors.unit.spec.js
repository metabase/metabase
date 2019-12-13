import { getIsResultDirty } from "metabase/query_builder/selectors";
import { state as sampleState } from "__support__/sample_dataset_fixture";

describe("getIsResultDirty", () => {
  describe("structure query", () => {
    function getState(q1, q2) {
      const card = query => ({
        dataset_query: { database: 1, type: "query", query },
      });
      const qb = { lastRunCard: card(q1), card: card(q2) };
      return { ...sampleState, qb };
    }

    it("should not be dirty for empty queries", () => {
      const state = getState({}, {});
      expect(getIsResultDirty(state)).toBe(false);
    });

    it("should be dirty if the table was changed", () => {
      const state = getState({ "source-table": 1 }, { "source-table": 2 });
      expect(getIsResultDirty(state)).toBe(true);
    });

    it("should be dirty if the fields were changed", () => {
      const state = getState(
        { "source-table": 1, fields: [["field-id", 1]] },
        { "source-table": 1, fields: [["field-id", 2]] },
      );
      expect(getIsResultDirty(state)).toBe(true);
    });

    it("should not be dirty if the fields were reordered", () => {
      const state = getState(
        { "source-table": 1, fields: [["field-id", 1], ["field-id", 2]] },
        { "source-table": 1, fields: [["field-id", 2], ["field-id", 1]] },
      );
      expect(getIsResultDirty(state)).toBe(false);
    });

    it("should not be dirty if fields with fk refs were reordered", () => {
      const state = getState(
        {
          "source-table": 1,
          fields: [["fk->", ["field-id", 1], ["field-id", 2]], ["field-id", 1]],
        },
        {
          "source-table": 1,
          fields: [["field-id", 1], ["fk->", ["field-id", 1], ["field-id", 2]]],
        },
      );
      expect(getIsResultDirty(state)).toBe(false);
    });

    it("should not be dirty if fields were just made explicit", () => {
      const state = getState(
        { "source-table": 1 },
        {
          "source-table": 1,
          fields: [
            ["field-id", 1],
            ["field-id", 2],
            ["field-id", 3],
            ["field-id", 4],
            ["field-id", 5],
            ["field-id", 6],
            ["field-id", 7],
          ],
        },
      );
      expect(getIsResultDirty(state)).toBe(false);
    });
  });
  describe("native query", () => {
    function getState(q1, q2) {
      const card = native => ({
        dataset_query: { database: 1, type: "query", native },
      });
      const qb = { lastRunCard: card(q1), card: card(q2) };
      return { ...sampleState, qb };
    }

    it("should not be dirty if template-tags is empty vs an empty object", () => {
      const state = getState({}, { "template-tags": {} });
      expect(getIsResultDirty(state)).toBe(false);
    });

    it("should be dirty if template-tags differ", () => {
      const state = getState(
        { "template-tags": { foo: {} } },
        { "template-tags": { bar: {} } },
      );
      expect(getIsResultDirty(state)).toBe(true);
    });
  });
});

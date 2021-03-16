import {
  getIsResultDirty,
  getNativeEditorCursorOffset,
  getNativeEditorSelectedText,
} from "metabase/query_builder/selectors";
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
        { "source-table": 1, fields: [["field", 1, null]] },
        { "source-table": 1, fields: [["field", 2, null]] },
      );
      expect(getIsResultDirty(state)).toBe(true);
    });

    it("should not be dirty if the fields were reordered", () => {
      const state = getState(
        { "source-table": 1, fields: [["field", 1, null], ["field", 2, null]] },
        { "source-table": 1, fields: [["field", 2, null], ["field", 1, null]] },
      );
      expect(getIsResultDirty(state)).toBe(false);
    });

    it("should not be dirty if fields with fk refs were reordered", () => {
      const state = getState(
        {
          "source-table": 1,
          fields: [["field", 2, { "source-field": 1 }], ["field", 1, null]],
        },
        {
          "source-table": 1,
          fields: [["field", 1, null], ["field", 2, { "source-field": 1 }]],
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
            ["field", 1, null],
            ["field", 2, null],
            ["field", 3, null],
            ["field", 4, null],
            ["field", 5, null],
            ["field", 6, null],
            ["field", 7, null],
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

    describe("native editor selection/cursor", () => {
      function getState(start, end) {
        return {
          qb: {
            card: {
              dataset_query: {
                database: 1,
                type: "query",
                native: { query: "1\n22\n333" },
              },
            },
            uiControls: {
              nativeEditorSelectedRange: { start, end },
            },
          },
        };
      }
      [
        [{ row: 0, column: 0 }, 0],
        [{ row: 1, column: 1 }, 3],
        [{ row: 2, column: 3 }, 8],
      ].forEach(([position, offset]) =>
        it(`should correctly determine the cursor offset for ${JSON.stringify(
          position,
        )}`, () => {
          const state = getState(position, position);
          expect(getNativeEditorCursorOffset(state)).toBe(offset);
        }),
      );

      [
        [{ row: 0, column: 0 }, { row: 0, column: 0 }, ""],
        [{ row: 0, column: 0 }, { row: 2, column: 3 }, "1\n22\n333"],
        [{ row: 1, column: 0 }, { row: 1, column: 2 }, "22"],
      ].forEach(([start, end, text]) =>
        it(`should correctly get selected text from ${JSON.stringify(
          start,
        )} to ${JSON.stringify(end)}`, () => {
          const state = getState(start, end);
          expect(getNativeEditorSelectedText(state)).toBe(text);
        }),
      );
    });
  });
});

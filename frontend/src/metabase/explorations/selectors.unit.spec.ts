import { setHighlightedComment } from "metabase/explorations/explorations.slice";
import {
  createBlock,
  createExploration,
  createPage,
  createQuery,
} from "metabase/explorations/test-utils";
import { createMockState } from "metabase/redux/store/mocks";

import { getHighlightedForChildTarget, getQueriesById } from "./selectors";

describe("getHighlightedForChildTarget", () => {
  it("returns a stable null for non-matching child targets", () => {
    const state = createMockState({
      explorations: {
        highlightedComment: {
          childTargetId: "7",
          highlighted: { columnName: "count" },
          explorationQueryIds: [101],
        },
      },
    });

    const first = getHighlightedForChildTarget(state, "99");
    const second = getHighlightedForChildTarget(state, "88");

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(first).toBe(second);
  });

  it("returns the same state for two consumers sharing one child target id", () => {
    const highlightedComment = {
      childTargetId: "7",
      highlighted: { columnName: "count" },
      explorationQueryIds: [101],
    };
    const state = createMockState({
      explorations: { highlightedComment },
    });

    expect(getHighlightedForChildTarget(state, "7")).toBe(highlightedComment);
    expect(getHighlightedForChildTarget(state, "7")).toBe(highlightedComment);
  });

  it("clears when setHighlightedComment(null) is reflected in state", () => {
    const withHighlight = createMockState({
      explorations: {
        highlightedComment: {
          childTargetId: "7",
          highlighted: { columnName: "count" },
          explorationQueryIds: [101],
        },
      },
    });
    expect(getHighlightedForChildTarget(withHighlight, "7")).toEqual({
      childTargetId: "7",
      highlighted: { columnName: "count" },
      explorationQueryIds: [101],
    });

    const cleared = createMockState({
      explorations: { highlightedComment: null },
    });
    expect(getHighlightedForChildTarget(cleared, "7")).toBeNull();

    // Keep the action import exercised so the slice contract stays visible.
    expect(setHighlightedComment(null).type).toBe(
      "explorations/setHighlightedComment",
    );
  });
});

describe("getQueriesById", () => {
  it("returns all queries from the current exploration", () => {
    const queries = [
      createQuery({ id: 101, name: "US", status: "done" }),
      createQuery({ id: 102, name: "EU", status: "done" }),
    ];
    const state = createMockState({
      explorations: {
        currentExploration: createExploration({
          queries,
          blocks: [
            createBlock({
              id: 1,
              pages: [
                createPage({
                  id: 7,
                  name: "Page",
                  query_ids: queries.map((query) => query.id),
                }),
              ],
            }),
          ],
        }),
        highlightedComment: null,
      },
    });

    expect(Object.keys(getQueriesById(state)).map(Number).sort()).toEqual([
      101, 102,
    ]);
    expect(getQueriesById(state)[101]?.id).toBe(101);
  });

  it("returns a stable empty record when there is no exploration", () => {
    const state = createMockState({
      explorations: { highlightedComment: null },
    });
    expect(getQueriesById(state)).toEqual({});
    expect(getQueriesById(state)).toBe(getQueriesById(state));
  });
});

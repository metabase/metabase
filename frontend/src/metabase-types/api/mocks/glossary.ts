import type { GlossaryItem } from "metabase-types/api";

export const createMockGlossaryItem = (
  opts?: Partial<GlossaryItem>,
): GlossaryItem => ({
  id: 1,
  term: "Term",
  definition: "Definition",
  worktree_id: null,
  ...opts,
});

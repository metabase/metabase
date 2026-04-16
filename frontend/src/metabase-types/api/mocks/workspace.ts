import type { WorkspaceProblem } from "../workspace";

export const createMockWorkspaceProblem = (
  opts?: Partial<WorkspaceProblem>,
): WorkspaceProblem => ({
  category: "internal",
  problem: "not-run",
  severity: "error",
  block_merge: false,
  description: "Test problem",
  data: {
    output: {
      db_id: 1,
      schema: "public",
      table: "test_table",
    },
    transform: {
      type: "workspace-transform",
      id: "1",
      name: "Test Transform",
    },
  },
  ...opts,
});

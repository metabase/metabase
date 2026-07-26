import { t } from "ttag";
import * as Yup from "yup";

import * as Errors from "metabase/utils/errors";
import type { RemoteSyncWorktree } from "metabase-types/api";

export function getValidationSchema(
  worktrees: RemoteSyncWorktree[],
  mainBranch: string | null | undefined,
) {
  const usedBranches = new Set(worktrees.map((worktree) => worktree.branch));

  return Yup.object({
    branch: Yup.string()
      .nullable()
      .required(Errors.required)
      .test(
        "not-main-branch",
        t`You can't create a worktree for the main branch.`,
        (value) => value !== mainBranch,
      )
      .test(
        "not-used-branch",
        t`A worktree already exists for this branch.`,
        (value) => !usedBranches.has(value ?? ""),
      ),
  });
}

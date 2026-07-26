import { t } from "ttag";
import * as Yup from "yup";

import * as Errors from "metabase/utils/errors";
import type { Workspace } from "metabase-types/api";

export function getValidationSchema(
  workspaces: Workspace[],
  mainBranch: string | null | undefined,
) {
  const usedBranches = new Set(workspaces.map((workspace) => workspace.branch));

  return Yup.object({
    branch: Yup.string()
      .nullable()
      .required(Errors.required)
      .test(
        "not-main-branch",
        t`You can't create a workspace for the main branch.`,
        (value) => value !== mainBranch,
      )
      .test(
        "not-used-branch",
        t`A workspace already exists for this branch.`,
        (value) => !usedBranches.has(value ?? ""),
      ),
  });
}

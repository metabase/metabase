import { t } from "ttag";

import type {
  CheckoutDisabledReason,
  WorkspaceSetupStatus,
} from "metabase-types/api";

export const isWorkspaceUninitialized = (workspace: {
  status: WorkspaceSetupStatus;
}) => {
  return workspace.status === "uninitialized";
};

export const isWorkspaceReady = (workspace: {
  status: WorkspaceSetupStatus;
}) => {
  return workspace.status === "ready";
};

export function getCheckoutDisabledMessage(
  reason: CheckoutDisabledReason | undefined,
): string | undefined {
  switch (reason) {
    case "mbql":
      return t`This transform cannot be edited in a workspace because it uses MBQL.`;
    case "card-reference":
      return t`This transform cannot be edited in a workspace because it references other questions.`;
    case null:
    case undefined:
      return undefined;
    default:
      return t`This transform cannot be edited in a workspace.`;
  }
}

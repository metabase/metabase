import type { ReactNode } from "react";
import { t } from "ttag";

import { Icon, Loader } from "metabase/ui";

import type { WorkspaceInfo } from "../../../types";
import {
  isDatabaseProvisioned,
  isDatabaseProvisioning,
  isDatabaseUnprovisioned,
  isDatabaseUnprovisioning,
} from "../../../utils";

export function getStatusIcon(workspace: WorkspaceInfo): ReactNode {
  if (workspace.databases.some(isDatabaseProvisioning)) {
    return <Loader size="sm" />;
  }
  if (workspace.databases.some(isDatabaseUnprovisioning)) {
    return <Loader size="sm" />;
  }
  if (workspace.databases.every(isDatabaseProvisioned)) {
    return <Icon name="check_filled" c="success" />;
  }
  return <Icon name="warning" c="warning" />;
}

export function getStatusMessage(workspace: WorkspaceInfo): string {
  if (workspace.databases.some(isDatabaseProvisioning)) {
    return t`Provisioning this workspace…`;
  }
  if (workspace.databases.some(isDatabaseUnprovisioning)) {
    return t`Unprovisioning this workspace…`;
  }
  if (workspace.databases.every(isDatabaseProvisioned)) {
    return t`This workspace is provisioned and ready to use.`;
  }
  if (workspace.databases.every(isDatabaseUnprovisioned)) {
    return t`This workspace is not provisioned yet.`;
  }
  return t`This workspace is partially provisioned.`;
}

export function getButtonLabel(workspace: WorkspaceInfo): string {
  if (workspace.databases.some(isDatabaseProvisioning)) {
    return t`Provisioning…`;
  }
  if (workspace.databases.some(isDatabaseUnprovisioning)) {
    return t`Unprovisioning…`;
  }
  if (workspace.databases.every(isDatabaseProvisioned)) {
    return t`Unprovision workspace`;
  }
  return t`Provision workspace`;
}

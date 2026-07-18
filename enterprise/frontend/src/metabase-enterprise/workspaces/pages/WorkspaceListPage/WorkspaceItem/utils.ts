import { t } from "ttag";

import type { WorkspaceStatus } from "metabase-types/api";

export function getStatusMessage(status: WorkspaceStatus): string {
  switch (status) {
    case "unprovisioned":
      return t`Not provisioned`;
    case "database-provisioning":
      return t`Setting up databases…`;
    case "database-provisioning-failure":
      return t`Failed to set up databases`;
    case "instance-provisioning":
      return t`Setting up the instance…`;
    case "instance-provisioning-failure":
      return t`Failed to set up the instance`;
    case "provisioned":
      return t`Provisioned`;
    case "instance-deprovisioning":
      return t`Deprovisioning the instance…`;
    case "instance-deprovisioning-failure":
      return t`Failed to deprovision the instance`;
    case "database-deprovisioning":
      return t`Deprovisioning databases…`;
    case "database-deprovisioning-failure":
      return t`Failed to deprovision databases`;
  }
}

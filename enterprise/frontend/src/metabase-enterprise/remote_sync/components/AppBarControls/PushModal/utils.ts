import { t } from "ttag";

export function getDefaultCommitMessage(applicationName: string) {
  return t`Exported from ${applicationName}`;
}

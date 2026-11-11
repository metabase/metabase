import { t } from "ttag";

export const getDefaultCommitMessage = (applicationName: string) =>
  t`Exported from ${applicationName}`;

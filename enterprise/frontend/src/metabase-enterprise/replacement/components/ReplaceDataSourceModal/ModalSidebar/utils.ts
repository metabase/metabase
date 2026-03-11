import { msgid, ngettext, t } from "ttag";

import type { CheckReplaceSourceInfo } from "metabase-types/api";

import {
  getGenericErrorMessage,
  getSourceErrorMessage,
  getTargetErrorMessage,
} from "../../../utils";

export function getSourceError(
  checkInfo: CheckReplaceSourceInfo | undefined,
  dependentsCount: number | undefined,
) {
  if (dependentsCount != null && dependentsCount === 0) {
    return t`Nothing uses this data source, so there's nothing to replace.`;
  }
  if (checkInfo == null || checkInfo.success) {
    return undefined;
  }

  const errors = checkInfo.errors ?? [];
  return errors.map(getSourceErrorMessage).find((error) => error != null);
}

export function getTargetError(checkInfo: CheckReplaceSourceInfo | undefined) {
  if (checkInfo == null || checkInfo.success) {
    return undefined;
  }

  const errors = checkInfo.errors ?? [];
  const targetError = errors
    .map(getTargetErrorMessage)
    .find((error) => error != null);
  if (targetError != null) {
    return targetError;
  }

  const sourceError = errors
    .map(getSourceErrorMessage)
    .find((error) => error != null);
  if (sourceError == null) {
    return getGenericErrorMessage();
  }
}

export function getSubmitLabel(
  dependentsCount: number | undefined,
  canReplace: boolean,
) {
  if (dependentsCount == null || !canReplace) {
    return t`Replace data source`;
  }
  return ngettext(
    msgid`Replace data source in ${dependentsCount} items`,
    `Replace data source in ${dependentsCount} items`,
    dependentsCount,
  );
}

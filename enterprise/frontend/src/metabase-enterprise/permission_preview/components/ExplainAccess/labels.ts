import { t } from "ttag";

import type { ColorName } from "metabase/ui/colors/types";
import type { IconName } from "metabase-types/api";

export interface ValueStatus {
  label: string;
  icon: IconName;
  color: ColorName;
}

export function getCollectionValueLabel(value: string) {
  switch (value) {
    case "curate":
      return t`Curate`;
    case "view":
      return t`View`;
    default:
      return t`No access`;
  }
}

export function getCollectionStatus(value: string): ValueStatus {
  const label = getCollectionValueLabel(value);
  switch (value) {
    case "curate":
      return { label, icon: "check", color: "feedback-positive" };
    case "view":
      return { label, icon: "eye", color: "feedback-warning" };
    default:
      return { label, icon: "close", color: "feedback-negative" };
  }
}

export function getViewDataLabel(value: string) {
  switch (value) {
    case "unrestricted":
      return t`Can view`;
    case "legacy-no-self-service":
      return t`Can view, no self-service`;
    default:
      return t`Blocked`;
  }
}

export function getCreateQueriesLabel(value: string) {
  switch (value) {
    case "query-builder-and-native":
      return t`Query builder and native`;
    case "query-builder":
      return t`Query builder only`;
    default:
      return t`No`;
  }
}

export function getCreateQueriesStatus(value: string): ValueStatus {
  const label = getCreateQueriesLabel(value);
  switch (value) {
    case "query-builder-and-native":
      return { label, icon: "check", color: "feedback-positive" };
    case "query-builder":
      return { label, icon: "permissions_limited", color: "feedback-warning" };
    default:
      return { label, icon: "close", color: "feedback-negative" };
  }
}

export function getDownloadLabel(value: string) {
  switch (value) {
    case "one-million-rows":
      return t`Up to 1 million rows`;
    case "ten-thousand-rows":
      return t`Up to 10,000 rows`;
    default:
      return t`No downloads`;
  }
}

export function getDownloadStatus(value: string): ValueStatus {
  const label = getDownloadLabel(value);
  switch (value) {
    case "one-million-rows":
      return { label, icon: "check", color: "feedback-positive" };
    case "ten-thousand-rows":
      return { label, icon: "permissions_limited", color: "feedback-warning" };
    default:
      return { label, icon: "close", color: "feedback-negative" };
  }
}

export function getViewDataStatus(value: string): ValueStatus {
  const label = getViewDataLabel(value);
  return value === "blocked"
    ? { label, icon: "close", color: "feedback-negative" }
    : { label, icon: "eye", color: "feedback-positive" };
}

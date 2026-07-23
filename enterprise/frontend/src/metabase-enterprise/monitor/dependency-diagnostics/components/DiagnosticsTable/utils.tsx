import { t } from "ttag";

import {
  getDependentsErrorsColumn,
  getDependentsWithErrorsColumn,
  getLocationColumn,
  getNameColumn,
} from "metabase-enterprise/dependencies/components/DependencyTable";

import type { DependencyDiagnosticsMode } from "../types";

export function getColumns(mode: DependencyDiagnosticsMode) {
  return [
    getNameColumn(mode === "broken" ? t`Dependency` : t`Name`),
    getLocationColumn(),
    ...(mode === "broken" ? [getDependentsErrorsColumn()] : []),
    ...(mode === "broken" ? [getDependentsWithErrorsColumn()] : []),
  ];
}

export function getColumnWidths(mode: DependencyDiagnosticsMode): number[] {
  if (mode === "broken") {
    return [0.3, 0.3, 0.3, 0.1];
  } else {
    return [0.5, 0.5];
  }
}

export function getNotFoundMessage(mode: DependencyDiagnosticsMode) {
  return mode === "broken"
    ? t`No broken dependencies found`
    : t`No unreferenced entities found`;
}

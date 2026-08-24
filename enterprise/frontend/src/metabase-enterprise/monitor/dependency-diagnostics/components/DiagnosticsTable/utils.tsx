import { t } from "ttag";

import {
  getDependentsErrorsColumn,
  getDependentsWithErrorsColumn,
  getLocationColumn,
  getNameColumn,
} from "metabase-enterprise/dependencies/components/DependencyTable";

import type { DependencyDiagnosticsMode } from "../types";

export function getColumns(mode: DependencyDiagnosticsMode) {
  const nameColumn = {
    ...getNameColumn(mode === "broken" ? t`Dependency` : t`Name`),
    width: undefined,
    maxAutoWidth: undefined,
    minWidth: 200,
  };
  const locationColumn = {
    ...getLocationColumn(),
    width: undefined,
    maxAutoWidth: undefined,
    minWidth: 160,
  };

  if (mode !== "broken") {
    return [nameColumn, locationColumn];
  }

  return [
    nameColumn,
    locationColumn,
    getDependentsErrorsColumn(),
    getDependentsWithErrorsColumn(),
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

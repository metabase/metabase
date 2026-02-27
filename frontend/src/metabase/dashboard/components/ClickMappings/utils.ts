import { t } from "ttag";

import { isPivotGroupColumn } from "metabase/lib/data_grid";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { Dashboard, DatasetColumn, Parameter } from "metabase-types/api";

import type { SourceOption, TargetItem } from "./types";

export function isMappableColumn(column: { name: string }) {
  // Pivot tables have a column in the result set that shouldn't be displayed.
  return !isPivotGroupColumn(column);
}

export function clickTargetObjectType(
  object: Dashboard | Question | undefined,
): "dashboard" | "native" | "gui" {
  if (!(object instanceof Question)) {
    return "dashboard";
  }

  const query = object.query();
  const { isNative } = Lib.queryDisplayInfo(query);

  return isNative ? "native" : "gui";
}

export const getSourceOption = {
  column: (column: DatasetColumn): SourceOption => ({
    type: "column",
    id: column.name,
    name: column.display_name,
  }),
  parameter: (parameter: Parameter): SourceOption => ({
    type: "parameter",
    id: parameter.id,
    name: parameter.name,
  }),
  userAttribute: (name: string): SourceOption => ({
    type: "userAttribute",
    name: name,
    id: name,
  }),
};

export function getTargetName(object: Dashboard | Question | undefined) {
  const objectType = clickTargetObjectType(object);
  return { dashboard: t`filter`, native: t`variable`, gui: t`column` }[
    objectType
  ];
}

export function getTargetsHeading(
  object: Dashboard | Question | undefined,
  setTargets: TargetItem[],
) {
  const objectType = clickTargetObjectType(object);
  if (objectType === "dashboard") {
    return setTargets.length > 0
      ? t`Other available filters`
      : t`Available filters`;
  }
  if (objectType === "native") {
    return setTargets.length > 0
      ? t`Other available variables`
      : t`Available variables`;
  }
  if (objectType === "gui") {
    return setTargets.length > 0
      ? t`Other available columns`
      : t`Available columns`;
  }
  return "Unknown";
}

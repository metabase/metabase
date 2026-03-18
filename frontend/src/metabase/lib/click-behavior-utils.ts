import _ from "underscore";

import type { ValueAndColumnForColumnNameDate } from "metabase/lib/formatting/link";
import type {
  ClickBehavior,
  Dashboard,
  DatasetColumn,
  ParameterValueOrArray,
  RowValue,
  UserAttributeMap,
} from "metabase-types/api";
import { isImplicitActionClickBehavior } from "metabase-types/guards";

export interface ClickObjectDimension {
  value: RowValue;
  column: DatasetColumn;
}

export interface ClickObjectDataRow {
  col: DatasetColumn | null; // can be null for custom columns
  value: RowValue;
}

export function getDataFromClicked({
  extraData: { dashboard, parameterValuesBySlug = {}, userAttributes } = {},
  dimensions = [],
  data = [],
}: {
  extraData?: {
    dashboard?: Dashboard;
    parameterValuesBySlug?: Record<string, ParameterValueOrArray>;
    userAttributes?: UserAttributeMap | null;
  };
  dimensions?: ClickObjectDimension[];
  data?: (ClickObjectDataRow & {
    clickBehaviorValue?: ClickObjectDataRow["value"];
  })[];
}): ValueAndColumnForColumnNameDate {
  const column = [
    ...dimensions,
    ...data.map((d) => ({
      column: d.col,
      // When the data is changed to a display value for use in tooltips, we can set clickBehaviorValue to the raw value for filtering.
      value: d.clickBehaviorValue || d.value,
    })),
  ]
    .filter((d) => d.column != null)
    .reduce<ValueAndColumnForColumnNameDate["column"]>(
      (acc, { column, value }) => {
        if (!column) {
          return acc;
        }

        const name = column.name.toLowerCase();

        if (acc[name] === undefined) {
          return { ...acc, [name]: { value, column } };
        }

        return acc;
      },
      {},
    );

  const dashboardParameters = (dashboard?.parameters || []).filter(
    ({ slug }) => parameterValuesBySlug[slug] != null,
  );

  const parameterByName = Object.fromEntries(
    dashboardParameters.map(({ name, slug }) => [
      name.toLowerCase(),
      { value: parameterValuesBySlug[slug] },
    ]),
  );

  const parameterBySlug = _.mapObject(parameterValuesBySlug, (value) => ({
    value,
  }));

  const parameter = Object.fromEntries(
    dashboardParameters.map(({ id, slug }) => [
      id,
      { value: parameterValuesBySlug[slug] },
    ]),
  );

  const userAttribute = Object.fromEntries(
    Object.entries(userAttributes || {}).map(([key, value]) => [
      key,
      { value },
    ]),
  );

  return { column, parameter, parameterByName, parameterBySlug, userAttribute };
}

export function clickBehaviorIsValid(
  clickBehavior: ClickBehavior | undefined | null,
): boolean {
  // opens drill-through menu
  if (clickBehavior == null) {
    return true;
  }

  if (clickBehavior.type === "crossfilter") {
    return Object.keys(clickBehavior.parameterMapping || {}).length > 0;
  }

  if (clickBehavior.type === "action") {
    return isImplicitActionClickBehavior(clickBehavior);
  }

  if (clickBehavior.type === "link") {
    const { linkType } = clickBehavior;

    if (linkType === "url") {
      return (clickBehavior.linkTemplate || "").length > 0;
    }

    if (linkType === "dashboard" || linkType === "question") {
      return clickBehavior.targetId != null;
    }
  }

  // we've picked "link" without picking a link type
  return false;
}

export function canSaveClickBehavior(
  clickBehavior: ClickBehavior | undefined | null,
  targetDashboard: Dashboard | undefined,
): boolean {
  if (
    clickBehavior?.type === "link" &&
    clickBehavior.linkType === "dashboard"
  ) {
    const tabs = targetDashboard?.tabs || [];
    const dashboardTabExists = tabs.some(
      (tab) => tab.id === clickBehavior.tabId,
    );

    if (tabs.length > 1 && !dashboardTabExists) {
      return false;
    }
  }

  return clickBehaviorIsValid(clickBehavior);
}

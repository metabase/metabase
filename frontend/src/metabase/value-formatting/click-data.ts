import _ from "underscore";

import type { ClickObjectDimension } from "metabase-lib";
import type { ClickObjectDataRow } from "metabase-lib/v1/queries/drills/types";
import { getColumnSettings } from "metabase-lib/v1/queries/utils/column-key";
import type {
  ClickBehavior,
  ColumnSettings,
  Dashboard,
  DatasetColumn,
  ParameterValueOrArray,
  UserAttributeMap,
  VisualizationSettings,
} from "metabase-types/api";
import { isImplicitActionClickBehavior } from "metabase-types/guards";

import type { ValueAndColumnForColumnNameDate } from "./link";

export function getDataFromClicked({
  extraData: { dashboard, parameterValuesBySlug = {}, userAttributes } = {},
  dimensions = [],
  data = [],
  settings,
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
  // Accept computed viz settings (with the per-column resolver) so
  // we can read user-configured formatting + type-derived defaults.
  settings?: VisualizationSettings & {
    column?: (col: DatasetColumn) => ColumnSettings;
  };
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
          // The raw DatasetColumn only carries metadata-level settings.
          // Pull the computed per-column viz settings (which include
          // user-saved formatting + type-derived defaults like
          // `number_style: "currency"` for currency columns) so
          // downstream formatters (e.g. renderLinkTextForClick) can
          // apply them. Fall back to the raw column_settings lookup if
          // the computed resolver isn't attached (e.g. some non-cell
          // click contexts).
          const vizColumnSettings =
            settings?.column?.(column) ?? getColumnSettings(settings, column);
          const columnWithSettings = vizColumnSettings
            ? {
                ...column,
                settings: { ...(column.settings ?? {}), ...vizColumnSettings },
              }
            : column;
          return { ...acc, [name]: { value, column: columnWithSettings } };
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

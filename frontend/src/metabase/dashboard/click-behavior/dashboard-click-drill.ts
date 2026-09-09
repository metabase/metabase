import querystring from "querystring";

import type { ClickBehaviorExtraData } from "metabase/dashboard/utils/click-behavior";
import {
  formatSourceForTarget,
  getTargetForQueryParams,
} from "metabase/dashboard/utils/click-behavior";
import * as Urls from "metabase/urls";
import { checkNotNull } from "metabase/utils/types";
import type { ValueAndColumnForColumnNameDate } from "metabase/value-formatting";
import {
  getDataFromClicked,
  renderLinkURLForClick,
} from "metabase/value-formatting";
import type { ClickObject } from "metabase/visualizations/types";
import type { ComputedVisualizationSettings } from "metabase/viz-core";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { ParameterWithTarget } from "metabase-lib/v1/parameters/types";
import { getObjectColumnSettings } from "metabase-lib/v1/queries/utils/column-key";
import { isDate } from "metabase-lib/v1/types/utils/isa";
import type {
  ClickBehavior,
  ClickBehaviorParameterMapping,
  ClickBehaviorSource,
  DatasetColumn,
  ParameterValueOrArray,
} from "metabase-types/api";

import { getStructuredQuestionUrlWithParameters } from "./question-url";
import type {
  ClickBehaviorClickObject,
  ClickBehaviorDataOptions,
  ClickBehaviorProperties,
  DashboardDrillType,
  DrillExtraData,
  ParameterIdValuePair,
} from "./types";

export function getDashboardDrillType(
  clicked: ClickObject,
): DashboardDrillType | null {
  const clickBehavior = getClickBehavior(clicked);
  if (clickBehavior == null) {
    return null;
  }

  const { type, linkType, targetId, extraData } = getClickBehaviorData(
    clicked,
    clickBehavior,
  );

  if (!hasLinkTargetData(clickBehavior, extraData)) {
    return null;
  }

  if (type === "crossfilter") {
    return "dashboard-filter";
  } else if (type === "link") {
    if (linkType === "url") {
      return "link-url";
    } else if (linkType === "dashboard") {
      if (extraData?.dashboard?.id === targetId) {
        return "dashboard-reset";
      } else {
        return "dashboard-url";
      }
    } else if (linkType === "question" && extraData && extraData.questions) {
      return "question-url";
    }
  }

  return null;
}

export function getDashboardDrillTab(clicked: ClickObject) {
  const clickBehavior = checkNotNull(getClickBehavior(clicked));
  const { tabId } = getClickBehaviorData(clicked, clickBehavior);

  return tabId;
}

export function getDashboardDrillParameters(clicked: ClickObject) {
  const clickBehavior = checkNotNull(getClickBehavior(clicked));
  const { data, parameterMapping, extraData } = getClickBehaviorData(
    clicked,
    clickBehavior,
  );

  return getParameterIdValuePairs(parameterMapping, {
    data,
    extraData,
    clickBehavior,
  });
}

export function getDashboardDrillLinkUrl(clicked: ClickObject) {
  const clickBehavior = checkNotNull(getClickBehavior(clicked));
  const { data, linkTemplate } = getClickBehaviorData(clicked, clickBehavior);

  return renderLinkURLForClick(linkTemplate || "", data);
}

export function getDashboardDrillUrl(clicked: ClickObject) {
  const clickBehavior = checkNotNull(getClickBehavior(clicked));
  const { data, extraData, linkType, parameterMapping, tabId, targetId } =
    getClickBehaviorData(clicked, clickBehavior);

  const targetDashboardId = checkNotNull(
    linkType === "dashboard" ? targetId : undefined,
  );
  const targetDashboard = checkNotNull(
    extraData?.dashboards?.[targetDashboardId],
  );
  const targetDefaultParameters = Object.fromEntries(
    checkNotNull(targetDashboard.parameters).map((parameter) => [
      parameter.slug,
      parameter.default ?? "",
    ]),
  );

  const baseQueryParams = getParameterValuesBySlug(parameterMapping, {
    data,
    extraData,
    clickBehavior,
  });

  const tabParams = typeof tabId === "undefined" ? {} : { tab: tabId };

  const queryParams = {
    ...targetDefaultParameters,
    ...baseQueryParams,
    ...tabParams,
  };

  const path = Urls.dashboard({ id: targetDashboardId });
  return `${path}?${querystring.stringify(queryParams)}`;
}

export function getDashboardDrillQuestionUrl(
  question: Question,
  clicked: ClickObject,
) {
  const clickBehavior = checkNotNull(getClickBehavior(clicked));
  const { data, extraData, linkType, parameterMapping, targetId } =
    getClickBehaviorData(clicked, clickBehavior);

  const targetCardId = checkNotNull(
    linkType === "question" ? targetId : undefined,
  );
  const targetCard = checkNotNull(extraData?.questions?.[targetCardId]);
  const baseQuestion = new Question(
    targetCard,
    question.metadata(),
  ).lockDisplay();
  const targetQuestion =
    // Pivot tables cannot work when there is an extra stage added on top of breakouts and aggregations
    baseQuestion.display() === "pivot"
      ? baseQuestion
      : baseQuestion.setQuery(Lib.ensureFilterStage(baseQuestion.query()));

  // The cast covers what `ParameterWithTarget` requires, but these entries
  // lack: `name` (never read by URL building) and a target on non-dimension mappings.
  const parameters = Object.values(parameterMapping ?? {}).map(
    ({ target, id, source }) => ({
      target: target.type === "dimension" ? target.dimension : undefined,
      id,
      slug: id,
      type: getTypeForSource(source, data, extraData),
    }),
  ) as ParameterWithTarget[];

  const queryParams = getParameterValuesBySlug(parameterMapping, {
    data,
    extraData,
    clickBehavior,
  });

  const isTargetQuestionNative = Lib.queryDisplayInfo(
    targetQuestion.query(),
  ).isNative;
  const originalQuestion = targetQuestion;

  return !isTargetQuestionNative
    ? getStructuredQuestionUrlWithParameters(
        targetQuestion,
        originalQuestion,
        parameters,
        queryParams,
      )
    : Urls.question(targetQuestion, { query: queryParams });
}

export function getClickBehavior(
  clicked: ClickBehaviorClickObject,
): ClickBehavior | undefined {
  const settings: ComputedVisualizationSettings = clicked?.settings || {};
  const columnClickBehavior = getColumnClickBehavior(settings, clicked?.column);
  if (columnClickBehavior) {
    return columnClickBehavior;
  }

  const dimensionClickBehavior = (clicked?.dimensions || [])
    .map((dimension) => getColumnClickBehavior(settings, dimension.column))
    .find(Boolean);

  return dimensionClickBehavior || settings.click_behavior;
}

function getColumnClickBehavior(
  settings: ComputedVisualizationSettings,
  column: DatasetColumn | undefined,
): ClickBehavior | undefined {
  if (!column) {
    return undefined;
  }
  return (
    getObjectColumnSettings(settings.column_settings, column)?.click_behavior ??
    settings.column?.(column)?.click_behavior
  );
}

export function getClickBehaviorData(
  clicked: ClickBehaviorClickObject,
  clickBehavior: ClickBehaviorProperties,
) {
  // The spread (vs picking fields) preserves the linkType discrimination, so
  // callers can narrow targetId.
  return {
    ...clickBehavior,
    data: getDataFromClicked(clicked),
    extraData: clicked.extraData,
  };
}

export function getParameterIdValuePairs(
  parameterMapping: ClickBehaviorParameterMapping | undefined,
  { data, extraData, clickBehavior }: ClickBehaviorDataOptions,
): ParameterIdValuePair[] {
  return Object.values(parameterMapping ?? {}).map(({ source, target, id }) => {
    return [
      id,
      formatSourceForTarget(source, target, {
        data,
        extraData: extraData ?? {},
        clickBehavior,
      }),
    ];
  });
}

export function getParameterValuesBySlug(
  parameterMapping: ClickBehaviorParameterMapping | undefined,
  { data, extraData, clickBehavior }: ClickBehaviorDataOptions,
): Record<string, ParameterValueOrArray> {
  return Object.fromEntries(
    Object.values(parameterMapping ?? {})
      .map(({ source, target }) => [
        getTargetForQueryParams(target, {
          extraData: extraData ?? {},
          clickBehavior,
        }),
        formatSourceForTarget(source, target, {
          data,
          extraData: extraData ?? {},
          clickBehavior,
        }),
      ])
      .filter(([key, value]) => key != null && value != null),
  );
}

function getTypeForSource(
  source: ClickBehaviorSource,
  data: ValueAndColumnForColumnNameDate,
  extraData: ClickBehaviorExtraData | undefined,
): string {
  if (source.type === "parameter") {
    const parameters = extraData?.dashboard?.parameters ?? [];
    const parameter = parameters.find((p) => p.id === source.id);
    return parameter?.type ?? "text";
  }

  const datum = data[source.type][source.id.toLowerCase()] || [];
  if (datum.column && isDate(datum.column)) {
    return "date";
  }

  return "text";
}

function hasLinkTargetData(
  clickBehavior: ClickBehaviorProperties,
  extraData: DrillExtraData | undefined,
) {
  const { linkType, targetId } = clickBehavior;
  if (linkType === "question") {
    return targetId != null && extraData?.questions?.[targetId] != null;
  } else if (linkType === "dashboard") {
    return targetId != null && extraData?.dashboards?.[targetId] != null;
  }
  return true;
}

import dayjs from "dayjs";

import type { ClickAction, ClickObject } from "metabase/visualizations/types";
import * as LibMetric from "metabase-lib/metric";
import type { CardId, DatetimeUnit, TemporalUnit } from "metabase-types/api";

import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerTabState,
} from "../types/viewer-state";

import type { DimensionFilterValue } from "./metrics";

import { findDimensionById } from ".";

type MetricsViewerClickActionParams = {
  definitions: MetricsViewerDefinitionEntry[];
  tab: MetricsViewerTabState;
  onTabUpdate: (updates: Partial<MetricsViewerTabState>) => void;
  cardIdToDimensionId: Record<CardId, MetricSourceId>;
};

export class MetricsViewerClickActionsMode {
  private definitions: MetricsViewerDefinitionEntry[];
  private tab: MetricsViewerTabState;
  private onTabUpdate: (updates: Partial<MetricsViewerTabState>) => void;
  private cardIdToDimensionId: Record<CardId, MetricSourceId>;
  constructor({
    definitions,
    tab,
    onTabUpdate,
    cardIdToDimensionId,
  }: MetricsViewerClickActionParams) {
    this.definitions = definitions;
    this.tab = tab;
    this.onTabUpdate = onTabUpdate;
    this.cardIdToDimensionId = cardIdToDimensionId;
  }
  actionsForClick(clickObject: ClickObject): ClickAction[] {
    const definition = this.definitions.find(
      (definition) =>
        definition.id ===
        this.cardIdToDimensionId[clickObject.cardId as CardId],
    );
    const params = {
      definitions: this.definitions,
      definition,
      tab: this.tab,
      onTabUpdate: this.onTabUpdate,
      clickObject,
    };
    return [getZoomInTimeSeriesAction(params)].filter(
      (action) => action !== undefined,
    );
  }
}

type GetActionParams = {
  definitions: MetricsViewerDefinitionEntry[];
  definition: MetricsViewerDefinitionEntry | undefined; //definition that was clicked on
  tab: MetricsViewerTabState;
  onTabUpdate: (updates: Partial<MetricsViewerTabState>) => void;
  clickObject: ClickObject;
};

function getZoomInTimeSeriesAction({
  definition,
  tab,
  onTabUpdate,
  clickObject,
}: GetActionParams): ClickAction | undefined {
  if (!definition || !definition.definition) {
    return;
  }
  const dimension = clickObject.dimensions?.[0];
  if (!dimension) {
    return;
  }
  const currentTemporalUnit = dimension.column.unit;
  if (!isValidTemporalUnit(currentTemporalUnit)) {
    return;
  }
  const nextTemporalUnit = getNextTemporalUnit(
    definition,
    tab,
    currentTemporalUnit,
  );
  if (!nextTemporalUnit) {
    return;
  }
  const dimensionValue = dimension.value;
  if (typeof dimensionValue !== "string") {
    return;
  }
  const dimensionFilter = getDimensionFilterForDateAndUnit(
    dimensionValue,
    currentTemporalUnit,
    nextTemporalUnit,
  );
  if (!dimensionFilter) {
    return;
  }
  return {
    type: "custom",
    name: "zoom-in.timeseries",
    title: `See this ${currentTemporalUnit} by ${nextTemporalUnit}`,
    section: "zoom",
    icon: "zoom_in",
    buttonType: "horizontal",
    onClick: ({ closePopover }) => {
      onTabUpdate({
        projectionConfig: {
          ...tab.projectionConfig,
          temporalUnit: nextTemporalUnit,
          dimensionFilter,
        },
      });
      closePopover();
    },
  };
}

function isValidTemporalUnit(unit?: DatetimeUnit): unit is TemporalUnit {
  return ["year", "quarter", "month", "week", "day", "hour"].includes(
    unit ?? "",
  );
}

function getDimensionFilterForDateAndUnit(
  date: string,
  unit: TemporalUnit,
  nextUnit: TemporalUnit,
): DimensionFilterValue | undefined {
  const d = dayjs(date);
  if (!d.isValid()) {
    return undefined;
  }
  return {
    type: "specific-date",
    operator: "between",
    values: [d.startOf(unit).toDate(), d.endOf(unit).toDate()],
    hasTime: nextUnit === "hour" || nextUnit === "minute",
  };
}

const nextTemporalUnitMap: Partial<Record<TemporalUnit, TemporalUnit>> = {
  year: "quarter",
  quarter: "month",
  month: "week",
  week: "day",
  day: "hour",
  hour: "minute",
};

function getNextTemporalUnit(
  entry: MetricsViewerDefinitionEntry,
  tab: MetricsViewerTabState,
  currentUnit: TemporalUnit,
): TemporalUnit | undefined {
  const definition = entry.definition;
  const dimensionId = tab.dimensionMapping[entry.id];
  if (!definition || !dimensionId) {
    return undefined;
  }
  const dimension = findDimensionById(definition, dimensionId);
  if (!dimension) {
    return undefined;
  }
  const availableBuckets = LibMetric.availableTemporalBuckets(
    definition,
    dimension,
  ).map((bucket) => LibMetric.displayInfo(definition, bucket).shortName);
  const filteredNextTemporalUnitMap = Object.fromEntries(
    Object.entries(nextTemporalUnitMap).filter(([_key, value]) =>
      availableBuckets.includes(value),
    ),
  );
  return filteredNextTemporalUnitMap[currentUnit];
}

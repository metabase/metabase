import dayjs from "dayjs";

import type {
  ClickAction,
  ClickActionsMode,
  ClickObject,
} from "metabase/visualizations/types";
import * as LibMetric from "metabase-lib/metric";
import type { CardId, DatetimeUnit, TemporalUnit } from "metabase-types/api";

import {
  type MetricDefinitionEntry,
  type MetricSourceId,
  type MetricsViewerDefinitionEntry,
  type MetricsViewerFormulaEntity,
  type MetricsViewerTabState,
  isMetricEntry,
} from "../types/viewer-state";

import { getEffectiveDefinitionEntry } from "./definition-entries";
import type { DimensionFilterValue } from "./dimension-filters";
import { findDimensionById } from "./dimension-lookup";
import { type MetricSlot, findStandaloneSlot } from "./metric-slots";

type MetricsViewerClickActionParams = {
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>;
  formulaEntities: MetricsViewerFormulaEntity[];
  metricSlots: MetricSlot[];
  tab: MetricsViewerTabState;
  onTabUpdate: (updates: Partial<MetricsViewerTabState>) => void;
  cardIdToEntityIndex: Record<CardId, number>;
};

export class MetricsViewerClickActionsMode implements ClickActionsMode {
  private definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>;
  private formulaEntities: MetricsViewerFormulaEntity[];
  private metricSlots: MetricSlot[];
  private tab: MetricsViewerTabState;
  private onTabUpdate: (updates: Partial<MetricsViewerTabState>) => void;
  private cardIdToEntityIndex: Record<CardId, number>;
  constructor({
    definitions,
    formulaEntities,
    metricSlots,
    tab,
    onTabUpdate,
    cardIdToEntityIndex,
  }: MetricsViewerClickActionParams) {
    this.definitions = definitions;
    this.formulaEntities = formulaEntities;
    this.metricSlots = metricSlots;
    this.tab = tab;
    this.onTabUpdate = onTabUpdate;
    this.cardIdToEntityIndex = cardIdToEntityIndex;
  }
  actionsForClick(clickObject: ClickObject): ClickAction[] {
    const cardId = clickObject.cardId;
    if (cardId == null) {
      return [];
    }
    const entityIndex = this.cardIdToEntityIndex[cardId];
    const entity = this.formulaEntities[entityIndex];
    const params = {
      definitions: this.definitions,
      entity,
      entityIndex,
      metricSlots: this.metricSlots,
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
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>;
  entity: MetricsViewerFormulaEntity | undefined; //entity that was clicked on
  entityIndex: number | undefined;
  metricSlots: MetricSlot[];
  tab: MetricsViewerTabState;
  onTabUpdate: (updates: Partial<MetricsViewerTabState>) => void;
  clickObject: ClickObject;
};

function getZoomInTimeSeriesAction({
  definitions,
  entity,
  entityIndex,
  metricSlots,
  tab,
  onTabUpdate,
  clickObject,
}: GetActionParams): ClickAction | undefined {
  if (!entity || entityIndex == null || !isMetricEntry(entity)) {
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
    definitions,
    entity,
    entityIndex,
    metricSlots,
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
  if (unit == null) {
    return false;
  }
  return ["year", "quarter", "month", "week", "day", "hour"].includes(unit);
}

function getDimensionFilterForDateAndUnit(
  date: string,
  unit: TemporalUnit,
  nextUnit: TemporalUnit,
): DimensionFilterValue | undefined {
  const parsedDate = dayjs(date);
  if (!parsedDate.isValid()) {
    return undefined;
  }
  return {
    type: "specific-date",
    operator: "between",
    values: [
      parsedDate.startOf(unit).toDate(),
      parsedDate.endOf(unit).toDate(),
    ],
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
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>,
  entity: MetricDefinitionEntry,
  entityIndex: number,
  metricSlots: MetricSlot[],
  tab: MetricsViewerTabState,
  currentUnit: TemporalUnit,
): TemporalUnit | undefined {
  const definition = getEffectiveDefinitionEntry(
    entity,
    definitions,
  )?.definition;
  const slot = findStandaloneSlot(metricSlots, entityIndex);
  if (!slot) {
    return undefined;
  }
  const dimensionId = tab.dimensionMapping[slot.slotIndex];
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

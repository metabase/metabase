import dayjs from "dayjs";

import type {
  ClickAction,
  ClickActionsMode,
  ClickObject,
} from "metabase/visualizations/types";
import * as LibMetric from "metabase-lib/metric";
import type { CardId, DatetimeUnit, TemporalUnit } from "metabase-types/api";

import {
  type ExpressionDefinitionEntry,
  type MetricDefinitionEntry,
  type MetricSourceId,
  type MetricsViewerDefinitionEntry,
  type MetricsViewerDimensionBreakoutState,
  type MetricsViewerFormulaEntity,
  isExpressionEntry,
  isMetricEntry,
} from "../types/viewer-state";

import {
  getEffectiveDefinitionEntry,
  getEffectiveTokenDefinitionEntry,
} from "./definition-entries";
import type { DimensionFilterValue } from "./dimension-filters";
import { findDimensionById } from "./dimension-lookup";
import {
  type MetricSlot,
  findStandaloneSlot,
  slotsForEntity,
} from "./metric-slots";

type MetricsViewerClickActionParams = {
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>;
  formulaEntities: MetricsViewerFormulaEntity[];
  metricSlots: MetricSlot[];
  dimensionBreakout: MetricsViewerDimensionBreakoutState;
  onDimensionBreakoutUpdate: (
    updates: Partial<MetricsViewerDimensionBreakoutState>,
  ) => void;
  cardIdToEntityIndex: Record<CardId, number>;
};

export class MetricsViewerClickActionsMode implements ClickActionsMode {
  private definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>;
  private formulaEntities: MetricsViewerFormulaEntity[];
  private metricSlots: MetricSlot[];
  private dimensionBreakout: MetricsViewerDimensionBreakoutState;
  private onDimensionBreakoutUpdate: (
    updates: Partial<MetricsViewerDimensionBreakoutState>,
  ) => void;
  private cardIdToEntityIndex: Record<CardId, number>;
  constructor({
    definitions,
    formulaEntities,
    metricSlots,
    dimensionBreakout,
    onDimensionBreakoutUpdate,
    cardIdToEntityIndex,
  }: MetricsViewerClickActionParams) {
    this.definitions = definitions;
    this.formulaEntities = formulaEntities;
    this.metricSlots = metricSlots;
    this.dimensionBreakout = dimensionBreakout;
    this.onDimensionBreakoutUpdate = onDimensionBreakoutUpdate;
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
      dimensionBreakout: this.dimensionBreakout,
      onDimensionBreakoutUpdate: this.onDimensionBreakoutUpdate,
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
  dimensionBreakout: MetricsViewerDimensionBreakoutState;
  onDimensionBreakoutUpdate: (
    updates: Partial<MetricsViewerDimensionBreakoutState>,
  ) => void;
  clickObject: ClickObject;
};

function getZoomInTimeSeriesAction({
  definitions,
  entity,
  entityIndex,
  metricSlots,
  dimensionBreakout,
  onDimensionBreakoutUpdate,
  clickObject,
}: GetActionParams): ClickAction | undefined {
  if (!entity || entityIndex == null) {
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
  let nextTemporalUnit: TemporalUnit | undefined;
  if (isMetricEntry(entity)) {
    nextTemporalUnit = getNextTemporalUnit(
      definitions,
      entity,
      entityIndex,
      metricSlots,
      dimensionBreakout,
      currentTemporalUnit,
    );
  } else if (isExpressionEntry(entity)) {
    nextTemporalUnit = getNextTemporalUnitForExpression(
      definitions,
      entity,
      entityIndex,
      metricSlots,
      dimensionBreakout,
      currentTemporalUnit,
    );
  }
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
      onDimensionBreakoutUpdate({
        projectionConfig: {
          ...dimensionBreakout.projectionConfig,
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
  dimensionBreakout: MetricsViewerDimensionBreakoutState,
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
  const dimensionId = dimensionBreakout.dimensionMapping[slot.slotIndex];
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

function getNextTemporalUnitForExpression(
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>,
  entity: ExpressionDefinitionEntry,
  entityIndex: number,
  metricSlots: MetricSlot[],
  dimensionBreakout: MetricsViewerDimensionBreakoutState,
  currentUnit: TemporalUnit,
): TemporalUnit | undefined {
  const expressionSlots = slotsForEntity(metricSlots, entityIndex);
  const firstSlot = expressionSlots[0];
  if (!firstSlot) {
    return undefined;
  }
  const tokenPosition = firstSlot.tokenPosition;
  if (tokenPosition === undefined) {
    return undefined;
  }
  const token = entity.tokens[tokenPosition];
  if (!token || token.type !== "metric") {
    return undefined;
  }
  const definitionEntry = getEffectiveTokenDefinitionEntry(token, definitions);
  const definition = definitionEntry.definition;
  const dimensionId = dimensionBreakout.dimensionMapping[firstSlot.slotIndex];
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

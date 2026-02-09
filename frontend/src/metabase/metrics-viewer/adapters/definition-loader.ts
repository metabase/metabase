import type { ThunkDispatch } from "@reduxjs/toolkit";

import { cardApi, measureApi, tableApi } from "metabase/api";
import { getMetadata } from "metabase/selectors/metadata";
import type * as Lib from "metabase-lib";
import type { Card, Measure, MeasureId, Table } from "metabase-types/api";
import type { MetricId } from "metabase-types/api/metric";
import type { State } from "metabase-types/store";

import type { TempJsMetricDefinition } from "../types/viewer-state";
import {
  isMeasureDefinition,
  isMetricDefinition,
} from "../types/viewer-state";
import { buildQueryForMeasure, buildQueryForMetric } from "../utils/queries";

type AppDispatch = ThunkDispatch<State, unknown, { type: string }>;

type GetState = () => State;

// TODO: When LibMetric is ready, this becomes:
//   const provider = LibMetric.metadataProvider(metadata);
//   const metricMeta = LibMetric.metricMetadata(provider, metricId);
//   return LibMetric.toJsMetricDefinition(LibMetric.fromMetricMetadata(provider, metricMeta));

export async function loadMetricDefinition(
  dispatch: AppDispatch,
  getState: GetState,
  metricId: MetricId,
): Promise<TempJsMetricDefinition> {
  const cardResult = await dispatch(
    cardApi.endpoints.getCard.initiate({ id: metricId }),
  );
  await dispatch(
    cardApi.endpoints.getCardQueryMetadata.initiate(metricId),
  );

  if (!cardResult.data) {
    throw new Error(`Failed to load metric ${metricId}`);
  }

  const card = cardResult.data as Card;
  const freshMetadata = getMetadata(getState());
  const query = buildQueryForMetric(card, freshMetadata);

  return {
    "source-metric": metricId,
    _card: card,
    _query: query,
  };
}

export async function loadMeasureDefinition(
  dispatch: AppDispatch,
  getState: GetState,
  measureId: MeasureId,
): Promise<TempJsMetricDefinition> {
  const measureResult = await dispatch(
    measureApi.endpoints.getMeasure.initiate(measureId),
  );

  if (!measureResult.data) {
    throw new Error(`Failed to load measure ${measureId}`);
  }

  const measure = measureResult.data as Measure;

  const tableResult = await dispatch(
    tableApi.endpoints.getTableQueryMetadata.initiate({
      id: measure.table_id,
    }),
  );

  if (!tableResult.data) {
    throw new Error(`Failed to load table for measure ${measureId}`);
  }

  const table = tableResult.data as Table;
  const freshMetadata = getMetadata(getState());
  const query = buildQueryForMeasure(measureId, measure, table, freshMetadata);

  return {
    "source-measure": measureId,
    _measure: measure,
    _table: table,
    _query: query ?? undefined,
  };
}

export function getQueryFromDefinition(
  def: TempJsMetricDefinition,
): Lib.Query | null {
  return def._query ?? null;
}

export function getDefinitionName(def: TempJsMetricDefinition): string {
  if (isMetricDefinition(def) && def._card) {
    return def._card.name;
  }
  if (isMeasureDefinition(def) && def._measure) {
    return def._measure.name;
  }
  return "";
}

export function getDefinitionCard(
  def: TempJsMetricDefinition,
): Card | null {
  return def._card ?? null;
}

export function getDefinitionMeasure(
  def: TempJsMetricDefinition,
): Measure | null {
  return def._measure ?? null;
}

export function getDefinitionTableId(
  def: TempJsMetricDefinition,
): number | null {
  const id = def._table?.id;
  return typeof id === "number" ? id : null;
}

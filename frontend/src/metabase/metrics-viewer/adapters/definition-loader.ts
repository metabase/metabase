import type { ThunkDispatch } from "@reduxjs/toolkit";

import { measureApi, metricApi } from "metabase/api";
import { getMetadata } from "metabase/selectors/metadata";
import type { MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { MeasureId } from "metabase-types/api";
import type { MetricId } from "metabase-types/api/metric";
import type { State } from "metabase-types/store";

type AppDispatch = ThunkDispatch<State, unknown, { type: string }>;

type GetState = () => State;

export async function loadMetricDefinition(
  dispatch: AppDispatch,
  getState: GetState,
  metricId: MetricId,
): Promise<MetricDefinition> {
  const result = await dispatch(
    metricApi.endpoints.getMetric.initiate(metricId),
  );

  if (!result.data) {
    throw new Error(`Failed to load metric ${metricId}`);
  }

  const metadata = getMetadata(getState());
  const provider = LibMetric.metadataProvider(metadata);
  const meta = LibMetric.metricMetadata(provider, metricId);
  if (!meta) {
    throw new Error(`Metric ${metricId} not found in metadata`);
  }
  return LibMetric.fromMetricMetadata(provider, meta);
}

export async function loadMeasureDefinition(
  dispatch: AppDispatch,
  getState: GetState,
  measureId: MeasureId,
): Promise<MetricDefinition> {
  const result = await dispatch(
    measureApi.endpoints.getMeasure.initiate(measureId),
  );

  if (!result.data) {
    throw new Error(`Failed to load measure ${measureId}`);
  }

  const metadata = getMetadata(getState());
  const provider = LibMetric.metadataProvider(metadata);
  const meta = LibMetric.measureMetadata(provider, measureId);
  if (!meta) {
    throw new Error(`Measure ${measureId} not found in metadata`);
  }
  return LibMetric.fromMeasureMetadata(provider, meta);
}

export function getDefinitionName(def: MetricDefinition): string | null {
  const meta = LibMetric.sourceMetricOrMeasureMetadata(def);
  return meta ? LibMetric.displayInfo(def, meta).displayName : null;
}

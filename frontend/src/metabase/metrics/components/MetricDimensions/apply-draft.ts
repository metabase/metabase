import { metricApi } from "metabase/api/metric";
import type { DispatchFn } from "metabase/redux";
import type {
  AddableMetricDimension,
  DimensionId,
  MetricDimension,
  MetricId,
} from "metabase-types/api";

import {
  type DimensionCandidate,
  type DimensionsDraft,
  getDraftDimensions,
  getSavedDimensionKey,
} from "./draft";

/**
 * PROTOTYPE: makes a just-created metric's dimensions match the draft the
 * person edited before saving. Reading the metric seeds the server's list;
 * this then removes, adds, renames, describes, sets the default and reorders
 * until it matches, matching dimensions by their source column.
 */
export async function applyDimensionsDraft(
  dispatch: DispatchFn,
  metricId: MetricId,
  candidates: DimensionCandidate[],
  draft: DimensionsDraft,
): Promise<void> {
  const wanted = getDraftDimensions(candidates, draft);
  const wantedKeys = new Set(wanted.map((dimension) => dimension.id));

  // Reading the metric is what seeds its dimension list
  const metricRequest = dispatch(
    metricApi.endpoints.getMetric.initiate(metricId, { forceRefetch: true }),
  );
  try {
    await metricRequest.unwrap();
  } finally {
    metricRequest.unsubscribe();
  }
  const seeded = await listDimensions(dispatch, metricId);

  const toRemove = seeded.added.filter((dimension) => {
    const key = getSavedDimensionKey(dimension);
    return key == null || !wantedKeys.has(key);
  });
  if (toRemove.length > 0) {
    await dispatch(
      metricApi.endpoints.removeMetricDimensions.initiate({
        metricId,
        dimension_ids: toRemove.map((dimension) => dimension.id),
      }),
    ).unwrap();
  }

  const seededKeys = new Set(seeded.added.map(getSavedDimensionKey));
  const addableByKey = new Map<DimensionId, AddableMetricDimension>(
    seeded.addable.flatMap(({ dimensions }) =>
      dimensions.flatMap((dimension) => {
        const key = getSavedDimensionKey(dimension);
        return key != null ? [[key, dimension] as const] : [];
      }),
    ),
  );
  const toAdd = wanted.flatMap((dimension) => {
    const addable = seededKeys.has(dimension.id)
      ? undefined
      : addableByKey.get(dimension.id);
    return addable
      ? [{ ...addable, display_name: dimension.display_name }]
      : [];
  });
  if (toAdd.length > 0) {
    await dispatch(
      metricApi.endpoints.addMetricDimensions.initiate({
        metricId,
        dimensions: toAdd,
      }),
    ).unwrap();
  }

  const saved = await listDimensions(dispatch, metricId);
  const savedByKey = new Map<DimensionId, MetricDimension>(
    saved.added.flatMap((dimension) => {
      const key = getSavedDimensionKey(dimension);
      return key != null ? [[key, dimension] as const] : [];
    }),
  );

  for (const dimension of wanted) {
    const savedDimension = savedByKey.get(dimension.id);
    if (savedDimension == null) {
      continue;
    }
    const changes = {
      ...(dimension.display_name !== savedDimension.display_name && {
        display_name: dimension.display_name,
      }),
      ...((dimension.description ?? null) !==
        (savedDimension.description ?? null) && {
        description: dimension.description,
      }),
      ...(dimension.default_temporal_unit != null &&
        dimension.default_temporal_unit !==
          savedDimension.default_temporal_unit && {
          default_temporal_unit: dimension.default_temporal_unit,
        }),
    };
    if (Object.keys(changes).length > 0) {
      await dispatch(
        metricApi.endpoints.updateMetricDimension.initiate({
          metricId,
          dimensionId: savedDimension.id,
          ...changes,
        }),
      ).unwrap();
    }
  }

  const defaultDimension =
    draft.defaultKey != null ? savedByKey.get(draft.defaultKey) : undefined;
  if (defaultDimension != null) {
    await dispatch(
      metricApi.endpoints.setDefaultMetricDimension.initiate({
        metricId,
        dimension_id: defaultDimension.id,
      }),
    ).unwrap();
  }

  const orderedIds = wanted.flatMap((dimension) => {
    const savedDimension = savedByKey.get(dimension.id);
    return savedDimension ? [savedDimension.id] : [];
  });
  if (orderedIds.length > 1) {
    await dispatch(
      metricApi.endpoints.reorderMetricDimensions.initiate({
        metricId,
        dimension_ids: orderedIds,
      }),
    ).unwrap();
  }
}

async function listDimensions(dispatch: DispatchFn, metricId: MetricId) {
  const request = dispatch(
    metricApi.endpoints.listMetricDimensions.initiate(
      { metricId, "with-addable": true, "include-orphaned": true },
      { forceRefetch: true },
    ),
  );
  try {
    return await request.unwrap();
  } finally {
    request.unsubscribe();
  }
}

import { useEffect, useMemo, useState } from "react";

import {
  measureApi,
  segmentApi,
  skipToken,
  useGetTableQueryMetadataQuery,
} from "metabase/api";
import { getMetadata } from "metabase/metadata-store";
import { useDispatch, useStore } from "metabase/redux";
import type { MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { Measure, MeasureId, Table, TableId } from "metabase-types/api";
import { isConcreteTableId } from "metabase-types/api";

import type { CubeCatalog } from "../generators/types";
import { buildCubeCatalog } from "../utils/catalog";

interface LoadedMeasureData {
  table: Table;
  measures: Measure[];
  definitions: Map<MeasureId, MetricDefinition>;
  metadata: Metadata;
}

export interface UseCubeCatalogResult {
  catalog: CubeCatalog | null;
  definitions: Map<MeasureId, MetricDefinition>;
  isLoading: boolean;
  error: unknown;
}

const EMPTY_DEFINITIONS: Map<MeasureId, MetricDefinition> = new Map();

/**
 * `GET /api/measure/:id` is the only endpoint that syncs a measure's
 * dimensions, so it runs for every measure after `query_metadata` resolves.
 * `listSegments` only ensures segment entities are in Redux before the
 * LibMetric provider is built.
 */
async function loadMeasureDefinitions(
  dispatch: ReturnType<typeof useDispatch>,
  getState: ReturnType<typeof useStore>["getState"],
  table: Table,
): Promise<LoadedMeasureData> {
  const measureIds = (table.measures ?? []).map((measure) => measure.id);
  const [measureResults] = await Promise.all([
    Promise.all(
      measureIds.map((id) =>
        dispatch(measureApi.endpoints.getMeasure.initiate(id)),
      ),
    ),
    dispatch(segmentApi.endpoints.listSegments.initiate()),
  ]);

  const measures = measureResults.flatMap((result) =>
    result.data ? [result.data] : [],
  );
  const metadata = getMetadata(getState());
  const provider = LibMetric.metadataProvider(metadata);
  const definitions = new Map<MeasureId, MetricDefinition>();
  for (const measure of measures) {
    const measureMetadata = LibMetric.measureMetadata(provider, measure.id);
    if (measureMetadata) {
      definitions.set(
        measure.id,
        LibMetric.fromMeasureMetadata(provider, measureMetadata),
      );
    }
  }

  return { table, measures, definitions, metadata };
}

export function useCubeCatalog(tableId: TableId): UseCubeCatalogResult {
  const dispatch = useDispatch();
  const store = useStore();
  const concreteTableId = isConcreteTableId(tableId) ? tableId : null;

  const {
    data: table,
    isLoading: isTableLoading,
    error: tableError,
  } = useGetTableQueryMetadataQuery(
    concreteTableId != null ? { id: concreteTableId } : skipToken,
  );

  const [loaded, setLoaded] = useState<LoadedMeasureData | null>(null);
  const [isLoadingMeasures, setIsLoadingMeasures] = useState(false);
  const [measuresError, setMeasuresError] = useState<unknown>(null);

  // Re-runs whenever the table response changes, including a tag invalidation
  // refetch, which would otherwise leave stale dimensions in `entities.measures`.
  useEffect(() => {
    if (!table) {
      return;
    }
    let isCancelled = false;
    setIsLoadingMeasures(true);
    setMeasuresError(null);

    loadMeasureDefinitions(dispatch, store.getState, table)
      .then((data) => {
        if (!isCancelled) {
          setLoaded(data);
        }
      })
      .catch((error: unknown) => {
        if (!isCancelled) {
          setMeasuresError(error);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoadingMeasures(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [table, dispatch, store]);

  // The previous table's data must not leak into a catalog for a new table id.
  const current =
    loaded != null && loaded.table.id === concreteTableId ? loaded : null;

  const catalog = useMemo(
    () =>
      current != null && concreteTableId != null
        ? buildCubeCatalog({
            tableId: concreteTableId,
            table: current.table,
            measures: current.measures,
            definitions: current.definitions,
            metadata: current.metadata,
          })
        : null,
    [current, concreteTableId],
  );

  const isWaitingForMeasures =
    table != null && current == null && measuresError == null;

  return {
    catalog,
    definitions: current?.definitions ?? EMPTY_DEFINITIONS,
    isLoading: isTableLoading || isLoadingMeasures || isWaitingForMeasures,
    error: tableError ?? measuresError ?? undefined,
  };
}

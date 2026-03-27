import { useEffect, useMemo, useRef } from "react";
import _ from "underscore";

import { getErrorMessage } from "metabase/api/utils";
import { useDryRunWorkspaceTransformMutation } from "metabase-enterprise/api";
import type {
  DatasetColumn,
  DatasetQuery,
  RawSeries,
  WorkspaceId,
} from "metabase-types/api";
import {
  createMockCard,
  createMockDatasetData,
} from "metabase-types/api/mocks";

interface UseTransformDryRunPreviewOptions {
  workspaceId?: WorkspaceId;
  transformId?: string;
  query?: DatasetQuery;
}

interface UseTransformDryRunPreviewResult {
  rawSeries?: RawSeries;
  isFetching: boolean;
  isLoading: boolean;
  isError: boolean;
  error?: string;
}

export function useTransformDryRunPreview({
  workspaceId,
  transformId,
  query,
}: UseTransformDryRunPreviewOptions): UseTransformDryRunPreviewResult {
  const [dryRunTransform, { data, error, isLoading }] =
    useDryRunWorkspaceTransformMutation();
  const abortRef = useRef<(() => void) | null>(null);

  // Track whether we should fetch based on having a query
  // We use a boolean to avoid re-fetching when query object reference changes
  const hasQuery = Boolean(query);

  useEffect(() => {
    if (!workspaceId || !transformId || !hasQuery) {
      return;
    }

    abortRef.current?.();

    const request = dryRunTransform({ workspaceId, transformId });
    abortRef.current = request.abort;

    return () => {
      abortRef.current?.();
      abortRef.current = null;
    };
  }, [workspaceId, transformId, hasQuery, dryRunTransform]);

  const normalizedCols = useMemo<DatasetColumn[]>(() => {
    const cols: Partial<DatasetColumn>[] = data?.data?.cols ?? [];
    return cols.map((col, index) => {
      const name = col.name ?? `column_${index + 1}`;

      return {
        ...col,
        name,
        display_name: col.display_name ?? name,
        source: col.source ?? "native",
      };
    });
  }, [data]);

  const previewData = useMemo(() => {
    if (
      !data?.data ||
      data.status === "failed" ||
      normalizedCols.length === 0
    ) {
      return null;
    }

    return createMockDatasetData({
      cols: normalizedCols,
      rows: data.data.rows ?? [],
      results_metadata: data.data.results_metadata,
    });
  }, [data, normalizedCols]);

  const rawSeries = useMemo<RawSeries | undefined>(() => {
    if (!previewData) {
      return undefined;
    }

    return [
      {
        card: createMockCard({
          display: "table",
          visualization_settings: {},
        }),
        data: {
          ...previewData,
          rows: _.uniq(previewData.rows ?? []),
        },
      },
    ];
  }, [previewData]);

  const errorMessage = useMemo(() => {
    if (error) {
      return getErrorMessage(error);
    }
    if (data?.status === "failed") {
      return data.message ?? "Transform preview failed";
    }
    return undefined;
  }, [data, error]);

  const hasRequest = Boolean(workspaceId && transformId && query);
  const isPending = hasRequest && !data && !error && !isLoading;
  const isFetching = isLoading || isPending;

  return {
    rawSeries,
    isFetching,
    isLoading,
    isError: Boolean(errorMessage),
    error: errorMessage,
  };
}

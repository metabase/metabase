import { skipToken } from "@reduxjs/toolkit/query";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDeleteSegmentMutation, useGetSegmentQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Center } from "metabase/ui";
import { useLoadTableWithMetadata } from "metabase-enterprise/data-studio/common/hooks/use-load-table-with-metadata";
import type { Segment, Table, TableId } from "metabase-types/api";

import {
  DataModelSegmentBreadcrumbs,
  PublishedTableSegmentBreadcrumbs,
} from "../../components/SegmentBreadcrumbs";

export type SegmentTabUrls = {
  definition: string;
  revisions: string;
  dependencies: string;
};

type SegmentContextValue = {
  segment: Segment;
  table: Table;
  breadcrumbs: ReactNode;
  tabUrls: SegmentTabUrls;
  onRemove: () => Promise<void>;
};

const SegmentContext = createContext<SegmentContextValue | null>(null);

export function useSegmentContext() {
  const context = useContext(SegmentContext);
  if (!context) {
    throw new Error("useSegmentContext must be used within SegmentLayout");
  }
  return context;
}

type SegmentLayoutParams = {
  segmentId: string;
  tableId?: string;
};

type SegmentLayoutProps = {
  params: SegmentLayoutParams;
  children?: ReactNode;
};

export function SegmentLayout({ params, children }: SegmentLayoutProps) {
  const segmentId = Urls.extractEntityId(params.segmentId);
  const publishedTableId: TableId | undefined = params.tableId
    ? Urls.extractEntityId(params.tableId)
    : undefined;

  const {
    data: segment,
    isLoading: isLoadingSegment,
    error: segmentError,
  } = useGetSegmentQuery(segmentId ?? skipToken);

  const {
    table,
    isLoading: isLoadingTable,
    error: tableError,
  } = useLoadTableWithMetadata(segment?.table_id, {
    includeForeignTables: true,
  });

  const isLoading = isLoadingSegment || isLoadingTable;
  const error = segmentError || tableError;

  if (isLoading || error != null || segment == null || table == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <SegmentLayoutContent
      segment={segment}
      table={table}
      publishedTableId={publishedTableId}
    >
      {children}
    </SegmentLayoutContent>
  );
}

type SegmentLayoutContentProps = {
  segment: Segment;
  table: Table;
  publishedTableId: TableId | undefined;
  children?: ReactNode;
};

function SegmentLayoutContent({
  segment,
  table,
  publishedTableId,
  children,
}: SegmentLayoutContentProps) {
  const dispatch = useDispatch();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const [deleteSegment] = useDeleteSegmentMutation();

  const backUrl = useMemo(() => {
    if (publishedTableId != null) {
      return Urls.dataStudioTableSegments(publishedTableId);
    }
    return Urls.dataStudioData({
      databaseId: table.db_id,
      schemaName: table.schema,
      tableId: table.id,
      tab: "segments",
    });
  }, [publishedTableId, table]);

  const tabUrls = useMemo<SegmentTabUrls>(() => {
    if (publishedTableId != null) {
      return {
        definition: Urls.dataStudioPublishedTableSegment(
          publishedTableId,
          segment.id,
        ),
        revisions: Urls.dataStudioPublishedTableSegmentRevisions(
          publishedTableId,
          segment.id,
        ),
        dependencies: Urls.dataStudioPublishedTableSegmentDependencies(
          publishedTableId,
          segment.id,
        ),
      };
    }
    return {
      definition: Urls.dataStudioSegment(segment.id),
      revisions: Urls.dataStudioSegmentRevisions(segment.id),
      dependencies: Urls.dataStudioSegmentDependencies(segment.id),
    };
  }, [publishedTableId, segment.id]);

  const handleRemove = useCallback(async () => {
    const { error } = await deleteSegment({
      id: segment.id,
      revision_message: t`Removed from Data Studio`,
    });

    if (error) {
      sendErrorToast(t`Failed to remove segment`);
    } else {
      sendSuccessToast(t`Segment removed`);
      dispatch(push(backUrl));
    }
  }, [
    segment.id,
    deleteSegment,
    dispatch,
    backUrl,
    sendSuccessToast,
    sendErrorToast,
  ]);

  const breadcrumbs = useMemo(
    () =>
      publishedTableId != null ? (
        <PublishedTableSegmentBreadcrumbs table={table} segment={segment} />
      ) : (
        <DataModelSegmentBreadcrumbs table={table} segment={segment} />
      ),
    [publishedTableId, table, segment],
  );

  const contextValue = useMemo(
    () => ({
      segment,
      table,
      breadcrumbs,
      tabUrls,
      onRemove: handleRemove,
    }),
    [segment, table, breadcrumbs, tabUrls, handleRemove],
  );

  return (
    <SegmentContext.Provider value={contextValue}>
      {children}
    </SegmentContext.Provider>
  );
}

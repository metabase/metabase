import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDeleteSegmentMutation, useGetSegmentQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Center } from "metabase/ui";
import { useLoadTableWithMetadata } from "metabase-enterprise/data-studio/common/hooks/use-load-table-with-metadata";
import type { Segment, SegmentId, Table, TableId } from "metabase-types/api";

export type SegmentTabUrls = {
  definition: string;
  revisions: string;
  dependencies: string;
};

// Context for pages with an existing segment (detail, revisions, dependencies)
type ExistingSegmentContextValue = {
  segment: Segment;
  table: Table;
  breadcrumbs: ReactNode;
  tabUrls: SegmentTabUrls;
  onRemove: () => Promise<void>;
};

const ExistingSegmentContext =
  createContext<ExistingSegmentContextValue | null>(null);

export function useExistingSegmentContext(): ExistingSegmentContextValue {
  const context = useContext(ExistingSegmentContext);
  if (!context) {
    throw new Error(
      "useExistingSegmentContext must be used within ExistingSegmentLayout",
    );
  }
  return context;
}

// Context for new segment page
type NewSegmentContextValue = {
  table: Table;
  breadcrumbs: ReactNode;
  getSuccessUrl: (segment: Segment) => string;
};

const NewSegmentContext = createContext<NewSegmentContextValue | null>(null);

export function useNewSegmentContext(): NewSegmentContextValue {
  const context = useContext(NewSegmentContext);
  if (!context) {
    throw new Error(
      "useNewSegmentContext must be used within NewSegmentLayout",
    );
  }
  return context;
}

// Config types for the wrapper layouts
export type ExistingSegmentLayoutConfig = {
  segmentId: SegmentId;
  backUrl: string;
  tabUrls: SegmentTabUrls;
  renderBreadcrumbs: (table: Table, segment: Segment) => ReactNode;
};

export type NewSegmentLayoutConfig = {
  tableId: TableId;
  getSuccessUrl: (segment: Segment) => string;
  renderBreadcrumbs: (table: Table) => ReactNode;
};

// Layout for existing segment pages
type ExistingSegmentLayoutProps = {
  config: ExistingSegmentLayoutConfig;
  children?: ReactNode;
};

export function ExistingSegmentLayout({
  config,
  children,
}: ExistingSegmentLayoutProps) {
  const { segmentId, backUrl, tabUrls, renderBreadcrumbs } = config;

  const {
    data: segment,
    isLoading: isLoadingSegment,
    error: segmentError,
  } = useGetSegmentQuery(segmentId);

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
    <ExistingSegmentLayoutContent
      segment={segment}
      table={table}
      backUrl={backUrl}
      tabUrls={tabUrls}
      renderBreadcrumbs={renderBreadcrumbs}
    >
      {children}
    </ExistingSegmentLayoutContent>
  );
}

type ExistingSegmentLayoutContentProps = {
  segment: Segment;
  table: Table;
  backUrl: string;
  tabUrls: SegmentTabUrls;
  renderBreadcrumbs: (table: Table, segment: Segment) => ReactNode;
  children?: ReactNode;
};

function ExistingSegmentLayoutContent({
  segment,
  table,
  backUrl,
  tabUrls,
  renderBreadcrumbs,
  children,
}: ExistingSegmentLayoutContentProps) {
  const dispatch = useDispatch();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const [deleteSegment] = useDeleteSegmentMutation();

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
    () => renderBreadcrumbs(table, segment),
    [renderBreadcrumbs, table, segment],
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
    <ExistingSegmentContext.Provider value={contextValue}>
      {children}
    </ExistingSegmentContext.Provider>
  );
}

// Layout for new segment page
type NewSegmentLayoutProps = {
  config: NewSegmentLayoutConfig;
  children?: ReactNode;
};

export function NewSegmentLayout({ config, children }: NewSegmentLayoutProps) {
  const { tableId, getSuccessUrl, renderBreadcrumbs } = config;

  const { table, isLoading, error } = useLoadTableWithMetadata(tableId, {
    includeForeignTables: true,
  });

  if (isLoading || error != null || table == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  const breadcrumbs = renderBreadcrumbs(table);

  const contextValue: NewSegmentContextValue = {
    table,
    breadcrumbs,
    getSuccessUrl,
  };

  return (
    <NewSegmentContext.Provider value={contextValue}>
      {children}
    </NewSegmentContext.Provider>
  );
}

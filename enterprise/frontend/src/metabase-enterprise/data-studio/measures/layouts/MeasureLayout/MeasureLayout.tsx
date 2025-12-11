import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDeleteMeasureMutation, useGetMeasureQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Center } from "metabase/ui";
import { useLoadTableWithMetadata } from "metabase-enterprise/data-studio/common/hooks/use-load-table-with-metadata";
import type { Measure, MeasureId, Table, TableId } from "metabase-types/api";

export type MeasureTabUrls = {
  definition: string;
  revisions: string;
  dependencies: string;
};

type ExistingMeasureContextValue = {
  measure: Measure;
  table: Table;
  breadcrumbs: ReactNode;
  tabUrls: MeasureTabUrls;
  onRemove: () => Promise<void>;
};

const ExistingMeasureContext =
  createContext<ExistingMeasureContextValue | null>(null);

export function useExistingMeasureContext(): ExistingMeasureContextValue {
  const context = useContext(ExistingMeasureContext);
  if (!context) {
    throw new Error(
      "useExistingMeasureContext must be used within ExistingMeasureLayout",
    );
  }
  return context;
}

type NewMeasureContextValue = {
  table: Table;
  breadcrumbs: ReactNode;
  getSuccessUrl: (measure: Measure) => string;
};

const NewMeasureContext = createContext<NewMeasureContextValue | null>(null);

export function useNewMeasureContext(): NewMeasureContextValue {
  const context = useContext(NewMeasureContext);
  if (!context) {
    throw new Error(
      "useNewMeasureContext must be used within NewMeasureLayout",
    );
  }
  return context;
}

export type ExistingMeasureLayoutConfig = {
  measureId: MeasureId;
  backUrl: string;
  tabUrls: MeasureTabUrls;
  renderBreadcrumbs: (table: Table, measure: Measure) => ReactNode;
};

export type NewMeasureLayoutConfig = {
  tableId: TableId;
  getSuccessUrl: (measure: Measure) => string;
  renderBreadcrumbs: (table: Table) => ReactNode;
};

type ExistingMeasureLayoutProps = {
  config: ExistingMeasureLayoutConfig;
  children?: ReactNode;
};

export function ExistingMeasureLayout({
  config,
  children,
}: ExistingMeasureLayoutProps) {
  const { measureId, backUrl, tabUrls, renderBreadcrumbs } = config;

  const {
    data: measure,
    isLoading: isLoadingMeasure,
    error: measureError,
  } = useGetMeasureQuery(measureId);

  const {
    table,
    isLoading: isLoadingTable,
    error: tableError,
  } = useLoadTableWithMetadata(measure?.table_id, {
    includeForeignTables: true,
  });

  const isLoading = isLoadingMeasure || isLoadingTable;
  const error = measureError || tableError;

  if (isLoading || error != null || measure == null || table == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <ExistingMeasureLayoutContent
      measure={measure}
      table={table}
      backUrl={backUrl}
      tabUrls={tabUrls}
      renderBreadcrumbs={renderBreadcrumbs}
    >
      {children}
    </ExistingMeasureLayoutContent>
  );
}

type ExistingMeasureLayoutContentProps = {
  measure: Measure;
  table: Table;
  backUrl: string;
  tabUrls: MeasureTabUrls;
  renderBreadcrumbs: (table: Table, measure: Measure) => ReactNode;
  children?: ReactNode;
};

function ExistingMeasureLayoutContent({
  measure,
  table,
  backUrl,
  tabUrls,
  renderBreadcrumbs,
  children,
}: ExistingMeasureLayoutContentProps) {
  const dispatch = useDispatch();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const [deleteMeasure] = useDeleteMeasureMutation();

  const handleRemove = useCallback(async () => {
    const { error } = await deleteMeasure({
      id: measure.id,
      revision_message: t`Removed from Data Studio`,
    });

    if (error) {
      sendErrorToast(t`Failed to remove measure`);
    } else {
      sendSuccessToast(t`Measure removed`);
      dispatch(push(backUrl));
    }
  }, [
    measure.id,
    deleteMeasure,
    dispatch,
    backUrl,
    sendSuccessToast,
    sendErrorToast,
  ]);

  const breadcrumbs = useMemo(
    () => renderBreadcrumbs(table, measure),
    [renderBreadcrumbs, table, measure],
  );

  const contextValue = useMemo(
    () => ({
      measure,
      table,
      breadcrumbs,
      tabUrls,
      onRemove: handleRemove,
    }),
    [measure, table, breadcrumbs, tabUrls, handleRemove],
  );

  return (
    <ExistingMeasureContext.Provider value={contextValue}>
      {children}
    </ExistingMeasureContext.Provider>
  );
}

type NewMeasureLayoutProps = {
  config: NewMeasureLayoutConfig;
  children?: ReactNode;
};

export function NewMeasureLayout({ config, children }: NewMeasureLayoutProps) {
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

  const contextValue: NewMeasureContextValue = {
    table,
    breadcrumbs,
    getSuccessUrl,
  };

  return (
    <NewMeasureContext.Provider value={contextValue}>
      {children}
    </NewMeasureContext.Provider>
  );
}

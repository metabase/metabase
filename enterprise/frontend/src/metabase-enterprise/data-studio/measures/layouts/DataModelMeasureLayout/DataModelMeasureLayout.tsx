import type { ReactNode } from "react";
import { useMemo } from "react";

import * as Urls from "metabase/lib/urls";
import { getSchemaName } from "metabase-lib/v1/metadata/utils/schema";

import { DataModelMeasureBreadcrumbs } from "../../components/MeasureBreadcrumbs";
import type {
  ExistingMeasureLayoutConfig,
  NewMeasureLayoutConfig,
} from "../MeasureLayout";
import { ExistingMeasureLayout, NewMeasureLayout } from "../MeasureLayout";

type DataModelMeasureLayoutParams = {
  databaseId: string;
  schemaId: string;
  tableId: string;
  measureId?: string;
};

type DataModelMeasureLayoutProps = {
  params: DataModelMeasureLayoutParams;
  children?: ReactNode;
};

export function DataModelMeasureLayout({
  params,
  children,
}: DataModelMeasureLayoutProps) {
  const databaseId = Number(params.databaseId);
  const schemaName = getSchemaName(params.schemaId);
  const tableId = Urls.extractEntityId(params.tableId);
  const measureId = params.measureId
    ? Urls.extractEntityId(params.measureId)
    : undefined;

  const existingConfig = useMemo<ExistingMeasureLayoutConfig | null>(() => {
    if (tableId == null || schemaName == null || measureId == null) {
      return null;
    }
    const urlParams = { databaseId, schemaName, tableId, measureId };
    return {
      measureId,
      backUrl: Urls.dataStudioData({
        databaseId,
        schemaName,
        tableId,
        tab: "measures",
      }),
      tabUrls: {
        definition: Urls.dataStudioDataModelMeasure(urlParams),
        revisions: Urls.dataStudioDataModelMeasureRevisions(urlParams),
        dependencies: Urls.dataStudioDataModelMeasureDependencies(urlParams),
      },
      renderBreadcrumbs: (table, measure) => (
        <DataModelMeasureBreadcrumbs table={table} measure={measure} />
      ),
    };
  }, [databaseId, schemaName, tableId, measureId]);

  const newConfig = useMemo<NewMeasureLayoutConfig | null>(() => {
    if (tableId == null || schemaName == null || measureId != null) {
      return null;
    }
    return {
      tableId,
      getSuccessUrl: (measure) =>
        Urls.dataStudioDataModelMeasure({
          databaseId,
          schemaName,
          tableId,
          measureId: measure.id,
        }),
      renderBreadcrumbs: (table) => (
        <DataModelMeasureBreadcrumbs table={table} />
      ),
    };
  }, [databaseId, schemaName, tableId, measureId]);

  if (existingConfig) {
    return (
      <ExistingMeasureLayout config={existingConfig}>
        {children}
      </ExistingMeasureLayout>
    );
  }

  if (newConfig) {
    return <NewMeasureLayout config={newConfig}>{children}</NewMeasureLayout>;
  }

  return null;
}

import type { ReactNode } from "react";
import { useMemo } from "react";

import * as Urls from "metabase/lib/urls";

import { PublishedTableMeasureBreadcrumbs } from "../../components/MeasureBreadcrumbs";
import type {
  ExistingMeasureLayoutConfig,
  NewMeasureLayoutConfig,
} from "../MeasureLayout";
import { ExistingMeasureLayout, NewMeasureLayout } from "../MeasureLayout";

type PublishedTableMeasureLayoutParams = {
  tableId: string;
  measureId?: string;
};

type PublishedTableMeasureLayoutProps = {
  params: PublishedTableMeasureLayoutParams;
  children?: ReactNode;
};

export function PublishedTableMeasureLayout({
  params,
  children,
}: PublishedTableMeasureLayoutProps) {
  const tableId = Urls.extractEntityId(params.tableId);
  const measureId = params.measureId
    ? Urls.extractEntityId(params.measureId)
    : undefined;

  const existingConfig = useMemo<ExistingMeasureLayoutConfig | null>(() => {
    if (tableId == null || measureId == null) {
      return null;
    }
    return {
      measureId,
      backUrl: Urls.dataStudioTableMeasures(tableId),
      tabUrls: {
        definition: Urls.dataStudioPublishedTableMeasure(tableId, measureId),
        dependencies: Urls.dataStudioPublishedTableMeasureDependencies(
          tableId,
          measureId,
        ),
      },
      renderBreadcrumbs: (table, measure) => (
        <PublishedTableMeasureBreadcrumbs table={table} measure={measure} />
      ),
    };
  }, [tableId, measureId]);

  const newConfig = useMemo<NewMeasureLayoutConfig | null>(() => {
    if (tableId == null || measureId != null) {
      return null;
    }
    return {
      tableId,
      getSuccessUrl: (measure) =>
        Urls.dataStudioPublishedTableMeasure(tableId, measure.id),
      renderBreadcrumbs: (table) => (
        <PublishedTableMeasureBreadcrumbs table={table} />
      ),
    };
  }, [tableId, measureId]);

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

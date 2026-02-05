import type { ReactNode } from "react";

import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { getDatasetQueryPreviewUrl } from "metabase/data-studio/common/utils/get-dataset-query-preview-url";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Card } from "metabase/ui";
import type { Measure } from "metabase-types/api";

import { MeasureHeader } from "../../components/MeasureHeader";
import type { MeasureTabUrls } from "../../types";

type MeasureDependenciesPageProps = {
  measure: Measure;
  tabUrls: MeasureTabUrls;
  breadcrumbs: ReactNode;
  onRemove: () => Promise<void>;
  children?: ReactNode;
};

export function MeasureDependenciesPage({
  measure,
  tabUrls,
  breadcrumbs,
  onRemove,
  children,
}: MeasureDependenciesPageProps) {
  return (
    <PageContainer data-testid="measure-dependencies-page">
      <MeasureHeader
        measure={measure}
        tabUrls={tabUrls}
        previewUrl={getDatasetQueryPreviewUrl(measure.definition)}
        onRemove={onRemove}
        breadcrumbs={breadcrumbs}
      />
      <PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider
        value={{
          baseUrl: tabUrls.dependencies,
          defaultEntry: { id: measure.id, type: "measure" },
        }}
      >
        <Card withBorder p={0} flex={1}>
          {children}
        </Card>
      </PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider>
    </PageContainer>
  );
}

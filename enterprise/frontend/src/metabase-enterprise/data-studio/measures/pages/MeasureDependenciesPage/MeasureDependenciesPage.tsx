import type { ReactNode } from "react";

import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Flex } from "metabase/ui";

import { MeasureHeader } from "../../components/MeasureHeader";
import { useExistingMeasureContext } from "../../layouts/MeasureLayout";
import { getMeasurePreviewUrl } from "../../utils/get-measure-preview-url";

type MeasureDependenciesPageProps = {
  children?: ReactNode;
};

export function MeasureDependenciesPage({
  children,
}: MeasureDependenciesPageProps) {
  const { measure, tabUrls, breadcrumbs, onRemove } =
    useExistingMeasureContext();

  return (
    <Flex direction="column" h="100%" data-testid="measure-dependencies-page">
      <MeasureHeader
        measure={measure}
        tabUrls={tabUrls}
        previewUrl={getMeasurePreviewUrl(measure)}
        onRemove={onRemove}
        breadcrumbs={breadcrumbs}
      />
      <PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider
        value={{
          baseUrl: tabUrls.dependencies,
          defaultEntry: { id: measure.id, type: "measure" },
        }}
      >
        {children}
      </PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider>
    </Flex>
  );
}

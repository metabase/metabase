import type { ReactNode } from "react";

import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Flex } from "metabase/ui";
import { getDatasetQueryPreviewUrl } from "metabase-enterprise/data-studio/common/utils/get-dataset-query-preview-url";

import { SegmentHeader } from "../../components/SegmentHeader";
import { useExistingSegmentContext } from "../../layouts/SegmentLayout";

type SegmentDependenciesPageProps = {
  children?: ReactNode;
};

export function SegmentDependenciesPage({
  children,
}: SegmentDependenciesPageProps) {
  const { segment, tabUrls, breadcrumbs, onRemove } =
    useExistingSegmentContext();

  return (
    <Flex direction="column" h="100%" data-testid="segment-dependencies-page">
      <SegmentHeader
        segment={segment}
        tabUrls={tabUrls}
        previewUrl={getDatasetQueryPreviewUrl(segment.definition)}
        onRemove={onRemove}
        breadcrumbs={breadcrumbs}
      />
      <PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider
        value={{
          baseUrl: tabUrls.dependencies,
          defaultEntry: { id: segment.id, type: "segment" },
        }}
      >
        {children}
      </PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider>
    </Flex>
  );
}

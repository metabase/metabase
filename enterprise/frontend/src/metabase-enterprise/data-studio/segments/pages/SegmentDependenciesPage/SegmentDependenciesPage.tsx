import type { ReactNode } from "react";

import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Flex } from "metabase/ui";
import { getDatasetQueryPreviewUrl } from "metabase-enterprise/data-studio/common/utils/get-dataset-query-preview-url";
import type { Segment } from "metabase-types/api";

import { SegmentHeader } from "../../components/SegmentHeader";
import type { SegmentTabUrls } from "../../types";

type SegmentDependenciesPageProps = {
  segment: Segment;
  tabUrls: SegmentTabUrls;
  breadcrumbs: ReactNode;
  onRemove: () => Promise<void>;
  children?: ReactNode;
};

export function SegmentDependenciesPage({
  segment,
  tabUrls,
  breadcrumbs,
  onRemove,
  children,
}: SegmentDependenciesPageProps) {
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

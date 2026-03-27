import type { ReactNode } from "react";

import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { getDatasetQueryPreviewUrl } from "metabase/data-studio/common/utils/get-dataset-query-preview-url";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Card } from "metabase/ui";
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
    <PageContainer data-testid="segment-dependencies-page">
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
        <Card withBorder p={0} flex={1}>
          {children}
        </Card>
      </PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider>
    </PageContainer>
  );
}

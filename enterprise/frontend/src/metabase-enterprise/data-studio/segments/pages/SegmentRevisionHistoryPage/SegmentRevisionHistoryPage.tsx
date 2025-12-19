import type { ReactNode } from "react";

import { Stack } from "metabase/ui";
import { PageContainer } from "metabase-enterprise/data-studio/common/components/PageContainer";
import { getDatasetQueryPreviewUrl } from "metabase-enterprise/data-studio/common/utils/get-dataset-query-preview-url";
import type { Segment } from "metabase-types/api";

import { SegmentHeader } from "../../components/SegmentHeader";
import { SegmentRevisionHistory } from "../../components/SegmentRevisionHistory";
import type { SegmentTabUrls } from "../../types";

import S from "./SegmentRevisionHistoryPage.module.css";

type SegmentRevisionHistoryPageProps = {
  segment: Segment;
  tabUrls: SegmentTabUrls;
  breadcrumbs: ReactNode;
  onRemove: () => Promise<void>;
};

export function SegmentRevisionHistoryPage({
  segment,
  tabUrls,
  breadcrumbs,
  onRemove,
}: SegmentRevisionHistoryPageProps) {
  return (
    <PageContainer data-testid="segment-revision-history-page">
      <SegmentHeader
        segment={segment}
        tabUrls={tabUrls}
        previewUrl={getDatasetQueryPreviewUrl(segment.definition)}
        onRemove={onRemove}
        breadcrumbs={breadcrumbs}
      />
      <Stack flex={1} className={S.scrollable}>
        <SegmentRevisionHistory segment={segment} />
      </Stack>
    </PageContainer>
  );
}

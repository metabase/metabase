import { Flex, Stack } from "metabase/ui";
import { getDatasetQueryPreviewUrl } from "metabase-enterprise/data-studio/common/utils/get-dataset-query-preview-url";

import { SegmentHeader } from "../../components/SegmentHeader";
import { SegmentRevisionHistory } from "../../components/SegmentRevisionHistory";
import { useExistingSegmentContext } from "../../layouts/SegmentLayout";

import S from "./SegmentRevisionHistoryPage.module.css";

export function SegmentRevisionHistoryPage() {
  const { segment, tabUrls, breadcrumbs, onRemove } =
    useExistingSegmentContext();

  return (
    <Flex
      direction="column"
      h="100%"
      data-testid="segment-revision-history-page"
    >
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
    </Flex>
  );
}

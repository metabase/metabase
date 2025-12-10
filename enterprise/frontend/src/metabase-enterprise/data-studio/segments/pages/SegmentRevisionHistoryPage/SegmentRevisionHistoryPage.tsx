import { Flex, Stack } from "metabase/ui";

import { SegmentHeader } from "../../components/SegmentHeader";
import { SegmentRevisionHistory } from "../../components/SegmentRevisionHistory";
import { useExistingSegmentContext } from "../../layouts/SegmentLayout";
import { getSegmentPreviewUrl } from "../../utils/get-segment-preview-url";

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
        previewUrl={getSegmentPreviewUrl(segment)}
        onRemove={onRemove}
        breadcrumbs={breadcrumbs}
      />
      <Stack flex={1} style={{ overflow: "auto" }}>
        <SegmentRevisionHistory segment={segment} />
      </Stack>
    </Flex>
  );
}

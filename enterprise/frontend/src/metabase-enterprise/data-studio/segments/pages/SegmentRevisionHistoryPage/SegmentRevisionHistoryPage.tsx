import type { ReactNode } from "react";

import { Flex, Stack } from "metabase/ui";
import type { Segment } from "metabase-types/api";

import { SegmentHeader } from "../../components/SegmentHeader";
import { SegmentRevisionHistory } from "../../components/SegmentRevisionHistory";
import type { SegmentTabUrls } from "../../types";
import { getSegmentPreviewUrl } from "../../utils/get-segment-preview-url";

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
      <Stack flex={1} className={S.scrollable}>
        <SegmentRevisionHistory segment={segment} />
      </Stack>
    </Flex>
  );
}

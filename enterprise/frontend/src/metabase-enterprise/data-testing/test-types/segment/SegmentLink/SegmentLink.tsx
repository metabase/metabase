import { useGetSegmentQuery } from "metabase/api";
import { ForwardRefLink } from "metabase/common/components/Link";
import { modelIconMap } from "metabase/common/utils/icon";
import { Anchor, FixedSizeIcon, Group } from "metabase/ui";
import type { SegmentTest } from "metabase-types/api";

import { useSegmentTestUrls } from "../../../hooks/use-segment-test-urls";

type SegmentLinkProps = {
  test: SegmentTest;
};

export function SegmentLink({ test }: SegmentLinkProps) {
  const { data: segment } = useGetSegmentQuery(test.segment_id);
  const urls = useSegmentTestUrls();

  if (segment == null || urls == null) {
    return null;
  }

  return (
    <Group gap="sm" wrap="nowrap">
      <FixedSizeIcon name={modelIconMap.segment} c="core-brand" />
      <Anchor component={ForwardRefLink} to={urls.getSegmentUrl(segment.id)}>
        {segment.name}
      </Anchor>
    </Group>
  );
}

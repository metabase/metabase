import { BenchFlatListItem } from "metabase/bench/components/shared/BenchFlatListItem";
import { TableBreadcrumbs } from "metabase/metadata/components";
import type Segment from "metabase-lib/v1/metadata/Segment";

import { SegmentActionSelect } from "./SegmentActionSelect";

interface Props {
  segment: Segment;
  onRetire: () => void;
  isActive?: boolean;
}

export const SegmentItem = ({ segment, onRetire, isActive }: Props) => {
  return (
    <BenchFlatListItem
      label={segment.name}
      icon="segment"
      subtitle={
        <TableBreadcrumbs tableId={segment.table_id} displayIcons={false} />
      }
      href={`/bench/segment/${segment.id}`}
      isActive={isActive}
      rightGroup={
        <div
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <SegmentActionSelect segment={segment} onRetire={onRetire} />
        </div>
      }
    />
  );
};

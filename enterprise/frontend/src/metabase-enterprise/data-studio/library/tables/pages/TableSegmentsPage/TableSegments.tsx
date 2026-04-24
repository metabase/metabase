import { t } from "ttag";

import { trackSegmentCreateStarted } from "metabase/data-studio/analytics";
import {
  EntityList,
  EntityListItem,
} from "metabase/data-studio/common/components/EntityList";
import { getUserCanWriteSegments } from "metabase/data-studio/selectors";
import { useSelector } from "metabase/redux";
import { Flex } from "metabase/ui";
import * as Urls from "metabase/utils/urls";
import type { ConcreteTableId, Table } from "metabase-types/api";

type TableSegmentsProps = {
  table: Table;
};

export function TableSegments({ table }: TableSegmentsProps) {
  const canWriteSegments = useSelector((state) =>
    getUserCanWriteSegments(state, table.is_published),
  );
  const segments = table.segments ?? [];

  return (
    <Flex direction="column" flex={1}>
      <EntityList
        items={segments}
        title={t`Segments`}
        emptyState={{
          icon: "segment",
          title: t`No segments yet`,
          message: t`Create a segment to filter rows in this table.`,
        }}
        newButtonProps={
          canWriteSegments
            ? {
                label: t`New segment`,
                url: Urls.dataStudioPublishedTableSegmentNew(table.id),
                trackClickEvent: () =>
                  trackSegmentCreateStarted(
                    "data_studio_segments",
                    table.id as ConcreteTableId,
                  ),
              }
            : undefined
        }
        renderItem={(segment) => (
          <EntityListItem
            key={segment.id}
            name={segment.name}
            description={segment.definition_description}
            icon="segment"
            href={Urls.dataStudioPublishedTableSegment(table.id, segment.id)}
          />
        )}
      />
    </Flex>
  );
}

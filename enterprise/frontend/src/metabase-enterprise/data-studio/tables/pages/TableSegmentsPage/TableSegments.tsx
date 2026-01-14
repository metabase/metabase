import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getUserCanWriteSegments } from "metabase/selectors/user";
import { Flex } from "metabase/ui";
import type { Table } from "metabase-types/api";

import {
  EntityList,
  EntityListItem,
} from "../../../common/components/EntityList";

type TableSegmentsProps = {
  table: Table;
};

export function TableSegments({ table }: TableSegmentsProps) {
  const canWriteSegments = useSelector(getUserCanWriteSegments);
  const segments = table.segments ?? [];

  return (
    <Flex direction="column" flex={1}>
      <EntityList
        items={segments}
        title={t`Segments`}
        emptyState={{
          icon: "segment2",
          title: t`No segments yet`,
          message: t`Create a segment to filter rows in this table.`,
        }}
        newButtonLabel={canWriteSegments ? t`New segment` : undefined}
        newButtonUrl={
          canWriteSegments
            ? Urls.dataStudioPublishedTableSegmentNew(table.id)
            : undefined
        }
        renderItem={(segment) => (
          <EntityListItem
            key={segment.id}
            name={segment.name}
            description={segment.definition_description}
            icon="segment2"
            href={Urls.dataStudioPublishedTableSegment(table.id, segment.id)}
          />
        )}
      />
    </Flex>
  );
}

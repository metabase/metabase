import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Flex } from "metabase/ui";
import { getUserCanWriteSegments } from "metabase-enterprise/data-studio/selectors";
import type { Table } from "metabase-types/api";

import {
  EntityList,
  EntityListItem,
} from "../../../common/components/EntityList";

type TableSegmentsProps = {
  table: Table;
};

export function TableSegments({ table }: TableSegmentsProps) {
  const canWriteSegments = useSelector((state) =>
    getUserCanWriteSegments(state, table.is_published),
  );
  const segments = table.segments ?? [];
  let newButtonLabel: string | undefined;
  let newButtonUrl: string | undefined;

  if (canWriteSegments) {
    newButtonLabel = t`New segment`;
    newButtonUrl = Urls.dataStudioPublishedTableSegmentNew(table.id);
  }

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
        newButtonLabel={newButtonLabel}
        newButtonUrl={newButtonUrl}
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

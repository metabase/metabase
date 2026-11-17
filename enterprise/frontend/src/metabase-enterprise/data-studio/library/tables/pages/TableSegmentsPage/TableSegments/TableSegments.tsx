import { t } from "ttag";

import { trackSegmentCreateStarted } from "metabase/common/data-studio/analytics";
import { getUserCanWriteSegments } from "metabase/common/data-studio/selectors";
import {
  EntityList,
  EntityListItem,
} from "metabase/data-studio/common/components/EntityList";
import { SystemSegmentItem } from "metabase/data-studio/data-model/pages/DataModel/TableSection/SegmentList";
import {
  isDefaultSegment,
  useTableSegmentsModel,
} from "metabase/data-studio/data-model/pages/DataModel/TableSection/table-segments";
import { useSelector } from "metabase/redux";
import { Flex, Stack, Title } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Table, TableId } from "metabase-types/api";

type TableSegmentsProps = {
  table: Table;
};

export function TableSegments({ table }: TableSegmentsProps) {
  const canWriteSegments = useSelector((state) =>
    getUserCanWriteSegments(state, table.is_published),
  );
  const segments = table.segments ?? [];
  const { systemSegments, defaultSegment } = useTableSegmentsModel(table);

  return (
    <Flex direction="column" flex={1} gap="xl">
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
                    // Unjustified type cast. FIXME
                    table.id as TableId,
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
      {systemSegments.length > 0 && (
        <Stack gap="lg">
          <Title order={4}>{t`Default segments`}</Title>
          <Stack gap="sm" role="list">
            {systemSegments.map((segment) => (
              <SystemSegmentItem
                key={segment.role}
                segment={segment}
                href={Urls.dataStudioPublishedTableSystemSegment(
                  table.id,
                  segment.role,
                )}
                isDefault={isDefaultSegment(defaultSegment, {
                  type: "system",
                  role: segment.role,
                })}
              />
            ))}
          </Stack>
        </Stack>
      )}
    </Flex>
  );
}

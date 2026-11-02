import { Fragment } from "react";
import { t } from "ttag";

import { LoadingSkeleton } from "metabase/common/components/Skeletons";
import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/monitor/components/DetailSidebar";
import { Divider, Flex, Skeleton, Stack } from "metabase/ui";

const RUN_ROWS_COUNT = 3;
const AVATAR_SIZE = 36;
const DETAIL_VALUE_WIDTHS = [160, 100, 120, 140, 140];

/** Rows of a run history table: a date and a status badge. */
export const RunHistoryRowsSkeleton = () => (
  <>
    {Array.from({ length: RUN_ROWS_COUNT }, (_, index) => (
      <Fragment key={index}>
        {index > 0 && <Divider />}
        <Flex align="center" justify="space-between" px="lg" py="sm" gap="sm">
          <Skeleton h={12} w={96} radius="xs" />
          <Skeleton h={20} w={80} radius="xl" />
        </Flex>
      </Fragment>
    ))}
  </>
);

/**
 * The alert's title and details, for a sidebar opened before the alert is
 * known, e.g. from a direct link.
 */
export const NotificationDetailBodySkeleton = () => {
  const detailLabels = [
    t`Question`,
    t`Owner`,
    t`Channel`,
    t`Last checked`,
    t`Last send attempt`,
  ];

  return (
    <LoadingSkeleton gap="xl">
      <Flex align="center" gap="sm">
        <Skeleton h={AVATAR_SIZE} w={AVATAR_SIZE} circle />
        <Stack gap="xs">
          <Skeleton h={12} w={60} radius="xs" />
          <Skeleton h={20} w={200} radius="xs" />
        </Stack>
      </Flex>
      <Stack gap="xxl">
        <SidebarSection title={t`Details`}>
          <DetailsTable>
            {detailLabels.map((label, index) => (
              <DetailsRow
                key={label}
                label={label}
                value={
                  <Flex align="center" h="1.375rem">
                    <Skeleton
                      h={12}
                      w={DETAIL_VALUE_WIDTHS[index]}
                      maw="100%"
                      radius="xs"
                    />
                  </Flex>
                }
              />
            ))}
          </DetailsTable>
        </SidebarSection>
        <SidebarSection title={t`Check history`}>
          <DetailsTable>
            <RunHistoryRowsSkeleton />
          </DetailsTable>
        </SidebarSection>
        <SidebarSection title={t`Send history`}>
          <DetailsTable>
            <RunHistoryRowsSkeleton />
          </DetailsTable>
        </SidebarSection>
      </Stack>
    </LoadingSkeleton>
  );
};

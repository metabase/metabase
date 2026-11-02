import { t } from "ttag";

import { getSkeletonLineWidth } from "metabase/common/components/Skeletons";
import {
  DetailsRow,
  DetailsTable,
} from "metabase/monitor/components/DetailSidebar";
import { Skeleton, Stack, Text } from "metabase/ui";

/** Placeholder for `SessionTitle` and `SessionDetails` while the session loads. */
export const SessionDetailSkeleton = () => {
  const labels = [
    t`User`,
    t`Email`,
    t`Auth method`,
    t`Session type`,
    t`Device`,
    t`User agent`,
    t`IP address`,
    t`Device ID`,
    t`Signed in`,
    t`Last active`,
  ];

  return (
    <Stack gap="xl">
      <Stack gap={0}>
        <Text size="sm" c="text-secondary">
          {t`Session`}
        </Text>
        <Skeleton h={20} w={180} my={4} radius="xs" />
      </Stack>
      <DetailsTable>
        {labels.map((label, index) => (
          <DetailsRow
            key={label}
            label={label}
            value={
              <Skeleton
                h={12}
                w={getSkeletonLineWidth(index)}
                my={5}
                radius="xs"
              />
            }
          />
        ))}
      </DetailsTable>
    </Stack>
  );
};

import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { Text, Tooltip } from "metabase/ui";
import { getRelativeTime } from "metabase/utils/time-dayjs";

interface AboutHeaderProps {
  updatedAt: string;
}

export function AboutHeader({ updatedAt }: AboutHeaderProps) {
  return (
    <>
      <Text fz="lg" fw={700}>{t`About`}</Text>
      <Tooltip label={<DateTime value={updatedAt} />} offset={8}>
        <Text
          size="sm"
          c="text-secondary"
          w="fit-content"
          mt="sm"
          data-testid="about-last-updated"
        >
          {t`Last updated ${getRelativeTime(updatedAt)}`}
        </Text>
      </Tooltip>
    </>
  );
}

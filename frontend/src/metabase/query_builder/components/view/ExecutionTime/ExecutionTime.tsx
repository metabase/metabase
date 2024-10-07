import { t } from "ttag";

import { Flex, Icon, Tooltip } from "metabase/ui";

import { formatDuration } from "./utils";

/**
 * `time` can most likely never be `null`
 * but we don't have type safety in the parent of this component
 * so we're guarding against it here preemptively!
 */
interface Props {
  time?: number | null;
}

export const ExecutionTime = ({ time }: Props) => {
  if (time == null) {
    return null;
  }
  const label = t`How long this query took`;
  return (
    <Tooltip label={label}>
      <Flex
        align="center"
        gap="xs"
        fw="bold"
        data-testid="execution-time"
        aria-label={label}
      >
        <Icon name="bolt" />
        {formatDuration(time)}
      </Flex>
    </Tooltip>
  );
};

ExecutionTime.shouldRender = ({ result }: { result: any }) =>
  result && !result.cached && result.running_time !== undefined;

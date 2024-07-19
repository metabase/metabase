import { t } from "ttag";

import { Tooltip } from "metabase/ui";

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

  return (
    <Tooltip label={t`Query execution time`}>
      <span data-testid="execution-time">{formatDuration(time)}</span>
    </Tooltip>
  );
};

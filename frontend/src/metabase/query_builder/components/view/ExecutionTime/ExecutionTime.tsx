import type { FunctionComponent } from "react";
import { t } from "ttag";

import { Tooltip } from "metabase/ui";

import { formatDuration } from "./utils";

interface Props {
  time: number;
}

export const ExecutionTime: FunctionComponent<Props> = ({ time }) => (
  <Tooltip label={t`Query execution time`}>
    <span data-testid="execution-time">{formatDuration(time)}</span>
  </Tooltip>
);

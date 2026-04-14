import { t } from "ttag";

import type { DateFilterValue } from "metabase/querying/common/types";

import { BreakoutChart } from "./BreakoutChart";

type Props = {
  dateFilter: DateFilterValue;
};

export function ConversationsBySourceChart({ dateFilter }: Props) {
  return (
    <BreakoutChart
      dateFilter={dateFilter}
      breakoutColumn="source"
      title={t`Conversations by source`}
      display="bar"
    />
  );
}

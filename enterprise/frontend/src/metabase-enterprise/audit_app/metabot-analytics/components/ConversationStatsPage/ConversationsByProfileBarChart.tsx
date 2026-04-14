import { t } from "ttag";

import type { DateFilterValue } from "metabase/querying/common/types";

import { BreakoutChart } from "./BreakoutChart";

type Props = {
  dateFilter: DateFilterValue;
};

export function ConversationsByProfileBarChart({ dateFilter }: Props) {
  return (
    <BreakoutChart
      dateFilter={dateFilter}
      breakoutColumn="model"
      title={t`Conversations by profile`}
      display="bar"
    />
  );
}

import { t } from "ttag";

import type { DateFilterValue } from "metabase/querying/common/types";

import { BreakoutChart } from "./BreakoutChart";

type Props = {
  dateFilter: DateFilterValue;
};

export function ConversationsByUserChart({ dateFilter }: Props) {
  return (
    <BreakoutChart
      dateFilter={dateFilter}
      breakoutColumn="user_display_name"
      title={t`Conversations by user`}
    />
  );
}

import { t } from "ttag";

import type { DateFilterValue } from "metabase/querying/common/types";

import { BreakoutChart } from "./BreakoutChart";

type Props = {
  dateFilter: DateFilterValue;
};

export function ConversationsByIPAddressChart({ dateFilter }: Props) {
  return (
    <BreakoutChart
      dateFilter={dateFilter}
      breakoutColumn="ip_address"
      title={t`IP addresses with most conversations`}
    />
  );
}

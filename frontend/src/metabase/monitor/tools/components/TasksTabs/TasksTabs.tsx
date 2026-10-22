import { t } from "ttag";

import { useGetTaskCountsQuery } from "metabase/api";
import {
  type PillTab,
  PillTabNavigation,
  getTabCount,
} from "metabase/common/components/PillTabNavigation";
import * as Urls from "metabase/urls";

export const TasksTabs = () => {
  const { currentData: counts, isError } = useGetTaskCountsQuery();
  const tabs: PillTab[] = [
    {
      label: t`Tasks`,
      to: Urls.monitorTasksList(),
      count: getTabCount({ value: counts?.tasks, isError }),
    },
    {
      label: t`Runs`,
      to: Urls.monitorTasksRuns(),
      count: getTabCount({ value: counts?.runs, isError }),
    },
  ];

  return <PillTabNavigation tabs={tabs} />;
};

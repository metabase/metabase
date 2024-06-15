import { t } from "ttag";

import { Tab } from "metabase/admin/performance/components/PerformanceApp.styled";
import { PerformanceTabId } from "metabase/admin/performance/types";

export const DashboardAndQuestionCachingTab = () => {
  return (
    <Tab
      key="DashboardAndQuestionCaching"
      value={PerformanceTabId.DashboardsAndQuestions}
    >
      {t`Dashboard and question caching`}
    </Tab>
  );
};

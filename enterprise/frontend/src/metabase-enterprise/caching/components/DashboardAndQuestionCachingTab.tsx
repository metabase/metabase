import P from "metabase/admin/performance/components/PerformanceApp.module.css";
import { getPerformanceTabName } from "metabase/admin/performance/utils";
import { PerformanceTabId } from "metabase/plugins";
import { Tabs } from "metabase/ui";

export const DashboardAndQuestionCachingTab = () => {
  return (
    <Tabs.Tab
      className={P.Tab}
      key="DashboardAndQuestionCaching"
      value={PerformanceTabId.DashboardsAndQuestions}
    >
      {getPerformanceTabName(PerformanceTabId.DashboardsAndQuestions)}
    </Tabs.Tab>
  );
};

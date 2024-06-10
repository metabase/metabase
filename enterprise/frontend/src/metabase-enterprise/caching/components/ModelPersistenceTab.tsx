import { t } from "ttag";

import { Tab } from "metabase/admin/performance/components/PerformanceApp.styled";
import { PerformanceTabId } from "metabase/admin/performance/types";

export const ModelPersistenceTab = () => {
  return (
    <Tab key="ModelPersistence" value={PerformanceTabId.ModelPersistence}>
      {t`Model persistence`}
    </Tab>
  );
};

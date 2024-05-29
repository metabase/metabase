import { t } from "ttag";

import { TabId } from "metabase/admin/performance/components/PerformanceApp";
import { Tab } from "metabase/admin/performance/components/PerformanceApp.styled";

export const ModelPersistenceTab = () => {
  return (
    <Tab key="ModelPersistence" value={TabId.ModelPersistence}>
      {t`Model persistence`}
    </Tab>
  );
};

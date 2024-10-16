import { t } from "ttag";

import { UpsellWrapper } from "metabase/admin/upsells/components/UpsellWrapper";
import { Tabs } from "metabase/ui";

/** This tab just shows the Insights upsell */
const _InsightsTab = () => {
  return <Tabs.Tab value="insights">{t`Insights`}</Tabs.Tab>;
};

export const InsightsTab = UpsellWrapper(_InsightsTab);

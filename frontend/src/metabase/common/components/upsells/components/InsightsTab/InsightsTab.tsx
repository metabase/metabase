import { t } from "ttag";

import { UpsellGem } from "metabase/common/components/upsells/components/UpsellGem";
import { UpsellWrapper } from "metabase/common/components/upsells/components/UpsellWrapper";
import { useHasTokenFeature } from "metabase/common/hooks";
import { Flex, Tabs } from "metabase/ui";

/** This tab just shows the Insights upsell */
const InsightsTabComponent = () => {
  const shouldShowGem = !useHasTokenFeature("audit_app");

  return (
    <Tabs.Tab value="insights">
      <Flex align="center" gap="xs">
        {t`Insights`}
        {shouldShowGem && <UpsellGem size={14} />}
      </Flex>
    </Tabs.Tab>
  );
};

export const InsightsTab = UpsellWrapper(InsightsTabComponent);

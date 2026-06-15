import { t } from "ttag";

import { UpsellGem } from "metabase/common/components/upsells/components";
import { useHasTokenFeature } from "metabase/common/hooks";
import { Flex } from "metabase/ui";

import { SettingsNavItem } from "./SettingsNavItem";

export const DataAppsNav = () => {
  const hasDataApps = useHasTokenFeature("data-apps");

  return (
    <SettingsNavItem
      path="data-apps"
      icon="dashboard"
      label={
        <Flex gap="sm" align="center">
          <span>{t`Data apps`}</span>
          {!hasDataApps && <UpsellGem />}
        </Flex>
      }
    />
  );
};

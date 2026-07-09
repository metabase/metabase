import { t } from "ttag";

import { UpsellGem } from "metabase/common/components/upsells/components";
import { useHasTokenFeature } from "metabase/common/hooks";
import { Flex } from "metabase/ui";
import * as Urls from "metabase/urls";

import { SettingsNavItem } from "./SettingsNavItem";

export const DataAppsNav = () => {
  const hasDataApps = useHasTokenFeature("data-apps");

  return (
    <SettingsNavItem
      path={Urls.DATA_APP_URL_SEGMENT}
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

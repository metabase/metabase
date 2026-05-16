import { t } from "ttag";

import { UpsellGem } from "metabase/common/components/upsells/components";
import { useHasTokenFeature, useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/redux";
import { getLocation } from "metabase/selectors/routing";
import { Flex } from "metabase/ui";
import * as Urls from "metabase/urls";

import { SettingsNavItem } from "./SettingsNavItem";

export const CustomVisualizationsNav = () => {
  const hasCustomVizAvailable = useHasTokenFeature("custom-viz-available");
  const customVizDevModeEnabled = useSetting(
    "custom-viz-plugin-dev-mode-enabled",
  );

  const pathname = useSelector(getLocation).pathname;
  const hasSubNav = hasCustomVizAvailable && customVizDevModeEnabled;
  const isManageVisualizationsActive =
    pathname.startsWith(Urls.customVizAdd()) ||
    pathname.startsWith(Urls.customVizEdit(undefined));

  return (
    <SettingsNavItem
      active={isManageVisualizationsActive && !hasSubNav ? true : undefined}
      path={hasSubNav ? undefined : "custom-visualizations"}
      folderPattern="custom-visualizations"
      label={
        <Flex gap="sm" align="center">
          <span>{t`Custom visualizations`}</span>
          {!hasCustomVizAvailable && <UpsellGem />}
        </Flex>
      }
      icon="bar"
    >
      {hasSubNav && (
        <>
          <SettingsNavItem
            key="manage"
            path="custom-visualizations"
            active={isManageVisualizationsActive ? true : undefined}
            label={t`Manage visualizations`}
          />
          <SettingsNavItem
            key="dev"
            path="custom-visualizations/development"
            label={t`Development`}
          />
        </>
      )}
    </SettingsNavItem>
  );
};

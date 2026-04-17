import { t } from "ttag";

import { UpsellGem } from "metabase/common/components/upsells/components";
import { useHasTokenFeature, useSetting } from "metabase/common/hooks";
import { Flex } from "metabase/ui";

import { SettingsNavItem } from "./SettingsNavItem";

export const CustomVisualizationsNav = () => {
  const hasCustomViz = useHasTokenFeature("custom-viz");
  const customVizDevModeEnabled = useSetting(
    "custom-viz-plugin-dev-mode-enabled",
  );

  const isFull = hasCustomViz && customVizDevModeEnabled;

  return (
    <SettingsNavItem
      path={isFull ? undefined : "custom-visualizations"}
      folderPattern="custom-visualizations"
      label={
        <Flex gap="sm" align="center">
          <span>{t`Custom visualizations`}</span>
          {!hasCustomViz && <UpsellGem />}
        </Flex>
      }
      icon="bar"
    >
      {isFull && (
        <>
          <SettingsNavItem
            key="manage"
            path="custom-visualizations"
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

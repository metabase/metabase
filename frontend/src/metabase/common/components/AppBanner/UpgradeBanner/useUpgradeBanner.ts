import { t } from "ttag";

import { getUserIsAdmin } from "metabase/current-user";
import { PLUGIN_SECURITY_CENTER } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { useGetVersionInfoQuery, useSetting } from "metabase/settings";
import { isWithinIframe } from "metabase/utils/iframe";

import type { UpgradeBannerProps } from "./UpgradeBanner";
import { getAlertUpgradeVersion } from "./utils";

export function useUpgradeBanner(): UpgradeBannerProps | null {
  const isAdmin = useSelector(getUserIsAdmin);
  const isHosted = useSetting("is-hosted?");
  const version = useSetting("version");

  const { data } = useGetVersionInfoQuery(undefined, {
    skip: !isAdmin,
  });

  const { hasActiveAdvisory, isLoading: isLoadingHasActiveAdvisory } =
    PLUGIN_SECURITY_CENTER.useHasActiveAdvisory(isAdmin);

  // TODO delete me
  const versionInfo = data && {
    ...data,
    alert_upgrade_versions: [
      {
        min: "1.63.0",
        fixed: "1.63.10",
        // eslint-disable-next-line metabase/no-literal-metabase-strings, metabase/no-unconditional-metabase-links-render -- This string only shows for admins.
        message: t`**This version of Metabase has a critical security vulnerability. Upgrade to 1.63.10 or later to receive important security updates. [View upgrade instructions](https://www.metabase.com/docs/latest/installation-and-operation/upgrading-metabase)**`,
      },
    ],
  };

  if (
    !isAdmin ||
    isWithinIframe() ||
    isHosted ||
    !version.tag ||
    !versionInfo ||
    // Security Center does a more robust check to see if the instance is affected
    // so if hasActiveAdvisory is false, don't show the banner
    isLoadingHasActiveAdvisory ||
    hasActiveAdvisory === false
  ) {
    return null;
  }

  const alertUpgradeVersion = getAlertUpgradeVersion(version.tag, versionInfo);

  if (!alertUpgradeVersion) {
    return null;
  }

  return {
    message: alertUpgradeVersion.message,
  };
}

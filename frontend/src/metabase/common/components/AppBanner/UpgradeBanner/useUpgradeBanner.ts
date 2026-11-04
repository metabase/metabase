import { useGetVersionInfoQuery } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { isWithinIframe } from "metabase/utils/iframe";

import type { UpgradeBannerProps } from "./UpgradeBanner";
import { getAlertUpgradeVersion } from "./utils";

export function useUpgradeBanner(): UpgradeBannerProps | null {
  const isAdmin = useSelector(getUserIsAdmin);
  const isHosted = useSetting("is-hosted?");
  const version = useSetting("version");

  const { data: versionInfo } = useGetVersionInfoQuery(undefined, {
    skip: !isAdmin,
  });

  if (
    !isAdmin ||
    isWithinIframe() ||
    isHosted ||
    !version.tag ||
    !versionInfo
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

import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { NavbarPromoCard } from "metabase/nav/components/NavbarPromoCard";
import { useSelector } from "metabase/redux";
import { getIsWhiteLabeling } from "metabase/selectors/whitelabel";
import {
  useGetVersionInfoQuery,
  useSetting,
  useUpdateSettingMutation,
} from "metabase/settings";
import { isWithinIframe } from "metabase/utils/iframe";

import Sparkles from "./sparkles.svg?component";
import { getLatestEligibleReleaseNotes } from "./utils";

export function WhatsNewNotification() {
  const [updateSetting] = useUpdateSettingMutation();
  const isEmbeddingIframe = isWithinIframe();
  const { data: versionInfo } = useGetVersionInfoQuery();
  const currentVersion = useSetting("version");
  const lastAcknowledgedVersion = useSetting("last-acknowledged-version");
  const isWhiteLabeling = useSelector(getIsWhiteLabeling);

  const url: string | undefined = useMemo(() => {
    const lastEligibleVersion = getLatestEligibleReleaseNotes({
      versionInfo,
      currentVersion: currentVersion.tag,
      lastAcknowledgedVersion: lastAcknowledgedVersion,
      isEmbeddingIframe,
      isWhiteLabeling,
    });

    return lastEligibleVersion?.announcement_url;
  }, [
    versionInfo,
    currentVersion.tag,
    lastAcknowledgedVersion,
    isEmbeddingIframe,
    isWhiteLabeling,
  ]);

  const dismiss = useCallback(() => {
    updateSetting({
      key: "last-acknowledged-version",
      value: currentVersion.tag,
    });
  }, [currentVersion.tag, updateSetting]);

  if (!url) {
    return null;
  }

  return (
    <NavbarPromoCard
      icon={<Sparkles />}
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- This only shows for admins
      title={t`Metabase has been updated`}
      linkText={t`See what's new`}
      linkHref={url}
      external
      onDismiss={dismiss}
    />
  );
}

import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useGetVersionInfoQuery } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { NavbarPromoCard } from "metabase/nav/components/NavbarPromoCard";
import { useDispatch, useSelector } from "metabase/redux";
import { updateSetting } from "metabase/redux/settings";
import { getIsEmbeddingIframe } from "metabase/selectors/embed";
import { getIsWhiteLabeling } from "metabase/selectors/whitelabel";

import Sparkles from "./sparkles.svg?component";
import { getLatestEligibleReleaseNotes } from "./utils";

export function WhatsNewNotification() {
  const dispatch = useDispatch();
  const isEmbeddingIframe = useSelector(getIsEmbeddingIframe);
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
    dispatch(
      updateSetting({
        key: "last-acknowledged-version",
        value: currentVersion.tag,
      }),
    );
  }, [currentVersion.tag, dispatch]);

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

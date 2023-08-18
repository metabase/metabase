import { t } from "ttag";
import { useMemo } from "react";
import { useSelector } from "metabase/lib/redux";
import {
  getLastAcknowledgedVersion,
  getSetting,
} from "metabase/selectors/settings";
import { getIsEmbedded } from "metabase/selectors/embed";
import { isMajorUpdate } from "./utils";

export function WhatsNewNotification() {
  const isEmbedded = useSelector(getIsEmbedded);
  const versionInfo = useSelector(state => getSetting(state, "version-info"));
  const currentVersion = useSelector(state => getSetting(state, "version"));
  const lastAcknowledgedVersion = useSelector(getLastAcknowledgedVersion);

  const currentVersionInfo = useMemo(() => {
    const versions = [versionInfo?.latest].concat(versionInfo?.older);

    return versions.find(v => v?.version === currentVersion.tag);
  }, [currentVersion.tag, versionInfo?.latest, versionInfo?.older]);

  const shouldShowNotification = useMemo(() => {
    if (isEmbedded) {
      return false;
    }

    if (!currentVersionInfo) {
      return false;
    }

    if (lastAcknowledgedVersion == null) {
      return true;
    }

    return (
      currentVersion.tag &&
      isMajorUpdate(currentVersion.tag, lastAcknowledgedVersion)
    );
  }, [
    currentVersion.tag,
    currentVersionInfo,
    isEmbedded,
    lastAcknowledgedVersion,
  ]);

  const url =
    // TODO: use real field: https://github.com/metabase/metabase/issues/33324
    //currentVersionInfo?.releaseNotesUrl ||
    "https://www.metabase.com/releases";

  if (!shouldShowNotification) {
    return null;
  }

  return (
    // TODO: real UI, this is just a mock
    <div
      style={{
        margin: 8,
        padding: 12,
        borderRadius: 12,
        border: "1px solid red",
      }}
    >
      <a href={url} target="_blank" rel="noreferrer">
        {t`See what's new`}
      </a>
    </div>
  );
}

import { t } from "ttag";
import { useCallback, useMemo } from "react";
import { isNotFalsy } from "metabase/core/utils/types";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getIsEmbedded } from "metabase/selectors/embed";
import {
  getLastAcknowledgedVersion,
  getSetting,
} from "metabase/selectors/settings";
import { updateSetting } from "metabase/admin/settings/settings";
import { getLatestEligibleReleaseNotes } from "./utils";

export function WhatsNewNotification() {
  const dispatch = useDispatch();
  const isEmbedded = useSelector(getIsEmbedded);
  const versionInfo = useSelector(state => getSetting(state, "version-info"));
  const currentVersion = useSelector(state => getSetting(state, "version"));
  const lastAcknowledgedVersion = useSelector(getLastAcknowledgedVersion);

  const url: string | undefined = useMemo(() => {
    if (isEmbedded || currentVersion.tag === undefined) {
      return undefined;
    }

    const versionsList = [versionInfo?.latest]
      .concat(versionInfo?.older)
      .filter(isNotFalsy);

    const lastEligibleVersion = getLatestEligibleReleaseNotes({
      versions: versionsList,
      currentVersion: currentVersion.tag,
      lastAcknowledgedVersion: lastAcknowledgedVersion,
    });

    return lastEligibleVersion?.releaseNotesUrl;
  }, [
    currentVersion,
    isEmbedded,
    lastAcknowledgedVersion,
    versionInfo?.latest,
    versionInfo?.older,
  ]);

  const dimiss = useCallback(() => {
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

      <br />

      <button type="button" onClick={dimiss}>
        dismiss
      </button>
    </div>
  );
}

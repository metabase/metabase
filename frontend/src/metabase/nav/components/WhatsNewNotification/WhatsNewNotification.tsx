import { useCallback, useMemo } from "react";
import { t } from "ttag";
import { updateSetting } from "metabase/admin/settings/settings";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import { Icon } from "metabase/core/components/Icon";
import { isNotFalsy } from "metabase/core/utils/types";
import { color } from "metabase/lib/colors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getIsEmbedded } from "metabase/selectors/embed";
import { getSetting } from "metabase/selectors/settings";
import { Anchor, Flex, Stack, Text } from "metabase/ui";
import Sparkles from "./sparkles.svg?component";
import { getLatestEligibleReleaseNotes } from "./utils";
import { NotificationContainer } from "./WhatsNewNotification.styled";

export function WhatsNewNotification() {
  const dispatch = useDispatch();
  const isEmbedded = useSelector(getIsEmbedded);
  const versionInfo = useSelector(state => getSetting(state, "version-info"));
  const currentVersion = useSelector(state => getSetting(state, "version"));
  const lastAcknowledgedVersion = useSelector(state =>
    getSetting(state, "last-acknowledged-version"),
  );

  const url: string | undefined = useMemo(() => {
    const versionsList = [versionInfo?.latest]
      .concat(versionInfo?.older)
      .filter(isNotFalsy);

    const lastEligibleVersion = getLatestEligibleReleaseNotes({
      versions: versionsList,
      currentVersion: currentVersion.tag,
      lastAcknowledgedVersion: lastAcknowledgedVersion,
      isEmbedded,
    });

    return lastEligibleVersion?.announcement_url;
  }, [
    currentVersion,
    lastAcknowledgedVersion,
    versionInfo?.latest,
    versionInfo?.older,
    isEmbedded,
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
    <NotificationContainer>
      <Stack spacing="sm">
        <Flex justify="space-between">
          <Sparkles color={color("brand")} />
          <IconButtonWrapper onClick={dimiss}>
            <Icon name="close" color={color("bg-dark")} />
          </IconButtonWrapper>
        </Flex>

        <Text weight="bold">{t`Metabase has been updated`}</Text>

        <Anchor
          weight="bold"
          component="a"
          href={url}
          target="_blank"
          rel="noreferrer"
        >
          {t`See what's new`}
        </Anchor>
      </Stack>
    </NotificationContainer>
  );
}

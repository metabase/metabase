import { useCallback, useMemo } from "react";
import { t } from "ttag";
import { updateSetting } from "metabase/admin/settings/settings";
import { Icon, Anchor, Flex, Paper, Stack, Text } from "metabase/ui";
import { color } from "metabase/lib/colors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getIsEmbedded } from "metabase/selectors/embed";
import { getSetting } from "metabase/selectors/settings";

import { getIsWhiteLabeling } from "metabase/selectors/whitelabel";
import Sparkles from "./sparkles.svg?component";
import { getLatestEligibleReleaseNotes } from "./utils";
import { DismissIconButtonWrapper } from "./WhatsNewNotification.styled";

export function WhatsNewNotification() {
  const dispatch = useDispatch();
  const isEmbedded = useSelector(getIsEmbedded);
  const versionInfo = useSelector(state => getSetting(state, "version-info"));
  const currentVersion = useSelector(state => getSetting(state, "version"));
  const lastAcknowledgedVersion = useSelector(state =>
    getSetting(state, "last-acknowledged-version"),
  );
  const isWhiteLabeling = useSelector(getIsWhiteLabeling);

  const url: string | undefined = useMemo(() => {
    const lastEligibleVersion = getLatestEligibleReleaseNotes({
      versionInfo,
      currentVersion: currentVersion.tag,
      lastAcknowledgedVersion: lastAcknowledgedVersion,
      isEmbedded,
      isWhiteLabeling,
    });

    return lastEligibleVersion?.announcement_url;
  }, [
    versionInfo,
    currentVersion.tag,
    lastAcknowledgedVersion,
    isEmbedded,
    isWhiteLabeling,
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
    <Paper my="lg" mx="auto" p="md" shadow="md" withBorder w={244}>
      <Stack spacing="sm">
        <Flex justify="space-between">
          <Sparkles color={color("brand")} />
          <DismissIconButtonWrapper onClick={dimiss}>
            <Icon name="close" />
          </DismissIconButtonWrapper>
        </Flex>

        {/* eslint-disable-next-line no-literal-metabase-strings -- This only shows for admins */}
        <Text weight="bold" size="sm">{t`Metabase has been updated`}</Text>

        <Anchor
          size="sm"
          weight="bold"
          component="a"
          href={url}
          target="_blank"
          rel="noreferrer"
        >
          {t`See what's new`}
        </Anchor>
      </Stack>
    </Paper>
  );
}

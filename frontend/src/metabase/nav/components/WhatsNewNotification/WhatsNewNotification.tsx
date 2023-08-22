import { Paper } from "@mantine/core";
import { t } from "ttag";
import { useCallback, useMemo } from "react";
import { updateSetting } from "metabase/admin/settings/settings";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import { Icon } from "metabase/core/components/Icon";
import { isNotFalsy } from "metabase/core/utils/types";
import { color } from "metabase/lib/colors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getIsEmbedded } from "metabase/selectors/embed";
import {
  getLastAcknowledgedVersion,
  getSetting,
} from "metabase/selectors/settings";
import { Flex, Stack, Text } from "metabase/ui";
import { getLatestEligibleReleaseNotes } from "./utils";
import Sparkles from "./sparkles.svg?component";

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
    <Paper
      shadow="md"
      p="md"
      m="lg"
      withBorder
      style={{ borderColor: "#F0F0F0" }}
    >
      <Stack spacing="sm">
        <Flex justify="space-between">
          <Sparkles color={color("brand")} />
          <IconButtonWrapper onClick={dimiss}>
            <Icon name="close" color={color("bg-dark")} />
          </IconButtonWrapper>
        </Flex>

        <Text weight="bold" color="text.2">{t`Metabase has been updated`}</Text>

        <Text
          weight="bold"
          component="a"
          color="brand"
          href={url}
          target="_blank"
          rel="noreferrer"
        >{t`See what's new`}</Text>
      </Stack>
    </Paper>
  );
}

import { t } from "ttag";
import { useCallback, useMemo } from "react";
import styled from "@emotion/styled";
import { updateSetting } from "metabase/admin/settings/settings";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import { Icon } from "metabase/core/components/Icon";
import { isNotFalsy } from "metabase/core/utils/types";
import { color } from "metabase/lib/colors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getIsEmbedded } from "metabase/selectors/embed";
import { getSetting } from "metabase/selectors/settings";
import { Flex, Stack, Text, Anchor, Box } from "metabase/ui";
import { getLatestEligibleReleaseNotes } from "./utils";
import Sparkles from "./sparkles.svg?component";

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

    return lastEligibleVersion?.releaseNotesUrl;
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

const NotificationContainer = styled(Box)(({ theme }) => ({
  margin: theme.spacing.lg,
  padding: theme.spacing.md,
  boxShadow: theme.shadows.md,
  borderWidth: 1,
  borderColor: theme.colors.border[0],
  borderStyle: "solid",
  borderRadius: theme.radius.md,
}));

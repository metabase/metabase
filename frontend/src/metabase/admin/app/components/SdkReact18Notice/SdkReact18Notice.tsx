import { skipToken } from "@reduxjs/toolkit/query";
import cx from "classnames";
import { t } from "ttag";

import { useListSdkReact18HostsQuery } from "metabase/api/embedding-sdk";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import CS from "metabase/css/core/index.css";
import { getUserIsAdmin, useUserAcknowledgement } from "metabase/current-user";
import {
  SdkReact18WarningBody,
  useSdkReact18DocsUrl,
} from "metabase/embedding/settings/SdkReact18Warning";
import { useSelector } from "metabase/redux";
import { Button, Group, Paper, Stack, Text } from "metabase/ui";

import S from "./SdkReact18Notice.module.css";

const ACKNOWLEDGEMENT_KEY = "sdk-react-18-notice";

export function SdkReact18Notice() {
  const isAdmin = useSelector(getUserIsAdmin);
  const [isDismissed, { ack: dismiss, isLoading: isLoadingDismissed }] =
    useUserAcknowledgement(ACKNOWLEDGEMENT_KEY);
  const canShow = isAdmin && !isLoadingDismissed && !isDismissed;
  const { data: hosts = [] } = useListSdkReact18HostsQuery(
    canShow ? undefined : skipToken,
  );
  const { url: docsUrl, showMetabaseLinks } = useSdkReact18DocsUrl();

  if (!canShow || hosts.length === 0) {
    return null;
  }

  return (
    <Paper
      className={cx(S.notice, CS.z2)}
      pos="fixed"
      left="1.5rem"
      bottom="1.5rem"
      w="22.5rem"
      p="xl"
      radius="xxs"
      shadow="sm"
      role="status"
    >
      <Stack gap="md">
        <Text fw="bold" fz="lg">
          {t`Update host apps to React 19`}
        </Text>
        <SdkReact18WarningBody hosts={hosts} />
        <Group justify="flex-end" gap="md" pt="xxs">
          {showMetabaseLinks && (
            <Button variant="subtle" component={ExternalLink} href={docsUrl}>
              {t`Learn more`}
            </Button>
          )}
          <Button onClick={dismiss}>{t`Dismiss warning`}</Button>
        </Group>
      </Stack>
    </Paper>
  );
}

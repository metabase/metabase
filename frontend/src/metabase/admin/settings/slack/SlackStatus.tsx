import { useDisclosure } from "@mantine/hooks";
import { jt, t } from "ttag";

import { AdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import {
  useGetSettingsQuery,
  useUpdateSlackSettingsMutation,
} from "metabase/api";
import { useDocsUrl } from "metabase/common/hooks";
import { ConfirmModal } from "metabase/components/ConfirmModal";
import ExternalLink, {
  ButtonLink,
} from "metabase/core/components/ExternalLink";
import { Box, Button, Flex, Icon, Stack, Text } from "metabase/ui";

import { SlackBadge } from "./SlackBadge";

export const SlackStatus = () => {
  const [isOpened, { open: handleOpen, close: handleClose }] =
    useDisclosure(false);

  const { url: docsUrl } = useDocsUrl("configuring-metabase/slack");

  const { data: settings } = useGetSettingsQuery();
  const isValid = settings?.["slack-token-valid?"] ?? false;
  const bugReportChannel = settings?.["slack-bug-report-channel"] ?? "";
  const bugReportingEnabled = settings?.["bug-reporting-enabled"] ?? false;

  const [updateSlackSettings] = useUpdateSlackSettingsMutation();
  const handleDelete = () => {
    updateSlackSettings({});
  };

  return (
    <Box>
      <Flex justify="space-between" align="center">
        <Flex gap="sm" align="center" h="100%">
          <SlackBadge isValid={isValid} />
          {!isValid && (
            <Text ml="sm" inline>
              {jt`Need help? ${(
                <ExternalLink
                  key="link"
                  href={docsUrl}
                >{t`See our docs`}</ExternalLink>
              )}.`}
            </Text>
          )}
        </Flex>
        <Box>
          <ButtonLink href={docsUrl}>
            {t`Create Slack App`}
            <Icon name="external" opacity={0.5} ml="sm" />
          </ButtonLink>
        </Box>
      </Flex>
      <Stack my="xl" gap="lg">
        <AdminSettingInput
          name="slack-app-token"
          title={t`Slack Token`}
          description={""}
          inputType="text"
          disabled
        />
        <AdminSettingInput
          name="slack-bug-report-channel"
          title={t`Slack Bug report channel`}
          inputType="text"
          hidden={!bugReportingEnabled || !bugReportChannel}
          disabled
        />
      </Stack>
      <Box mt="xl">
        <Button onClick={handleOpen}>{t`Delete Slack App`}</Button>
        <ConfirmModal
          opened={isOpened}
          onClose={handleClose}
          title={t`Are you sure you want to delete your Slack App?`}
          message={t`Doing this may stop your dashboard subscriptions from appearing in Slack until a new connection is set up. Are you sure you want to delete your Slack App integration?`}
          confirmButtonText={t`Delete`}
          onConfirm={handleDelete}
        />
      </Box>
    </Box>
  );
};

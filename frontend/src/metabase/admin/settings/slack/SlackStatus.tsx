import { useDisclosure } from "@mantine/hooks";
import { jt, t } from "ttag";

import { AdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import {
  useGetSettingsQuery,
  useUpdateSlackSettingsMutation,
} from "metabase/api";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useDocsUrl } from "metabase/common/hooks";
import { Box, Button, Flex, Stack, Text } from "metabase/ui";

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
      <Stack my="xl" gap="lg">
        <AdminSettingInput
          name="slack-app-token"
          title={t`Slack token`}
          description={""}
          inputType="text"
          disabled
        />
        <AdminSettingInput
          name="slack-bug-report-channel"
          title={t`Slack bug report channel`}
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

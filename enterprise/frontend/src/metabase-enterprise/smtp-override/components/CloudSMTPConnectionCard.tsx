import { useDisclosure } from "@mantine/hooks";
import { useEffect, useState } from "react";
import { t } from "ttag";

import { trackSMTPSetupClick } from "metabase/admin/settings/components/Email/analytics";
import { useAdminSetting } from "metabase/api/utils";
import { useSetting } from "metabase/common/hooks";
import {
  Box,
  Button,
  Divider,
  Flex,
  Group,
  Icon,
  Paper,
  Radio,
  Stack,
  Text,
} from "metabase/ui";

import S from "./CloudSMTPConnectionCard.module.css";
import { SMTPOverrideConnectionForm } from "./SMTPOverrideConnectionForm";

export const CloudSMTPConnectionCard = () => {
  const [showModal, { open: openModal, close: closeModal }] =
    useDisclosure(false);
  const isSMTPOverrideConfigured = Boolean(
    useSetting("email-smtp-host-override"),
  );
  const { value: iscloudSMTPEnabled, updateSetting } = useAdminSetting(
    "smtp-override-enabled",
  );
  const [localValue, setLocalValue] = useState(iscloudSMTPEnabled);

  useEffect(() => {
    setLocalValue(iscloudSMTPEnabled);
  }, [iscloudSMTPEnabled]);

  const handleChange = (newValue: string) => {
    const newIsCloudSMTPEnabled = newValue === "custom";
    if (newIsCloudSMTPEnabled === iscloudSMTPEnabled) {
      return;
    }
    setLocalValue(newIsCloudSMTPEnabled);
    updateSetting({
      key: "smtp-override-enabled",
      value: newIsCloudSMTPEnabled,
    });
  };

  const handleOpenModal = () => {
    openModal();
    trackSMTPSetupClick({ eventDetail: "cloud" });
  };

  return (
    <div className={S.root} data-testid="cloud-smtp-connection-card">
      <Paper radius="md" className={S.card}>
        <Radio.Group
          value={localValue ? "custom" : "metabase"}
          onChange={handleChange}
        >
          <Box p={"lg"}>
            {isSMTPOverrideConfigured ? (
              <Radio
                key={"metabase"}
                value={"metabase"}
                // eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase settings
                label={t`Managed by Metabase`}
                // eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase settings
                description={t`Emails come from Metabase Cloud email server`}
                classNames={{
                  label: S.label,
                  description: S.description,
                }}
              />
            ) : (
              <Flex gap={"md"}>
                <Icon name="check" c="success" size={20} />
                <Stack gap={0}>
                  <Text
                    className={S.cardTitle}
                    // eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase settings
                  >{t`Managed by Metabase`}</Text>
                  {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase settings */}
                  <Text>{t`Emails come from Metabase Cloud email server`}</Text>
                </Stack>
              </Flex>
            )}
          </Box>
          <Divider />
          {isSMTPOverrideConfigured && (
            <Group p="lg" justify="space-between" style={{ cursor: "pointer" }}>
              <Radio
                key={"custom"}
                value={"custom"}
                label={t`Custom SMTP Server`}
                classNames={{
                  label: S.label,
                  description: S.description,
                }}
                description={t`Emails come from your email server`}
              />
              <Button
                variant="subtle"
                onClick={handleOpenModal}
              >{t`Edit settings`}</Button>
            </Group>
          )}
          {!isSMTPOverrideConfigured && (
            <Box p="sm">
              <Button
                variant="subtle"
                onClick={handleOpenModal}
              >{t`Set up a custom SMTP server`}</Button>
            </Box>
          )}
        </Radio.Group>
      </Paper>
      {showModal && <SMTPOverrideConnectionForm onClose={closeModal} />}
    </div>
  );
};

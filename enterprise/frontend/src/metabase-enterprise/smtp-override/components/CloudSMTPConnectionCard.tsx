import { useDisclosure } from "@mantine/hooks";
import { useEffect, useState } from "react";
import { t } from "ttag";

import { trackSMTPSetupClick } from "metabase/admin/settings/components/Email/analytics";
import { useAdminSetting } from "metabase/api/utils";
import { useSetting } from "metabase/common/hooks";
import { Box, Button, Divider, Group, Icon, Radio, Text } from "metabase/ui";

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
      <Radio.Group
        value={localValue ? "custom" : "metabase"}
        onChange={handleChange}
      >
        <Radio.Card radius="md" value="metabase" className={S.RadioCardRoot}>
          <Box p="lg">
            <Group justify="space-between">
              <Group wrap="nowrap" align="flex-start">
                {isSMTPOverrideConfigured ? (
                  <Radio.Indicator />
                ) : (
                  <Icon name="check" c="success" size={20} />
                )}

                <div>
                  {/* eslint-disable-next-line no-literal-metabase-strings -- Metabase settings */}
                  <Text className={S.label}>{t`Managed by Metabase`}</Text>
                  {/* eslint-disable-next-line no-literal-metabase-strings -- Metabase settings */}
                  <Text>{t`Emails come from Metabase Cloud email server`}</Text>
                </div>
              </Group>
            </Group>
          </Box>
        </Radio.Card>
        <Divider />
        {isSMTPOverrideConfigured && (
          <Radio.Card radius="md" value="custom" className={S.RadioCardRoot}>
            <Box p="lg">
              <Group justify="space-between">
                <Group wrap="nowrap" align="flex-start">
                  <Radio.Indicator />
                  <div>
                    <Text className={S.label}>{t`Custom SMTP Server`}</Text>
                    <Text>{t`Emails come from your email server`}</Text>
                  </div>
                </Group>
                <Button
                  variant="subtle"
                  onClick={(e) => {
                    handleOpenModal();
                    e.stopPropagation();
                  }}
                >{t`Edit settings`}</Button>
              </Group>
            </Box>
          </Radio.Card>
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
      {showModal && <SMTPOverrideConnectionForm onClose={closeModal} />}
    </div>
  );
};

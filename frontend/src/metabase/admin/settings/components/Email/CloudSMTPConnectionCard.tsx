import { useEffect, useState } from "react";
import { t } from "ttag";

import { useAdminSetting } from "metabase/api/utils";
import { useSetting } from "metabase/common/hooks";
import { Box, Button, Divider, Group, Icon, Radio, Text } from "metabase/ui";

import S from "./CloudSMTPConnectionCard.module.css";

export const CloudSMTPConnectionCard = ({
  onOpenCloudSMTPModal,
}: {
  onOpenCloudSMTPModal: () => void;
}) => {
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
                  <Text className={S.label}>{t`Managed by Metabase`}</Text>
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
                    onOpenCloudSMTPModal();
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
              onClick={onOpenCloudSMTPModal}
            >{t`Set up a custom SMTP server`}</Button>
          </Box>
        )}
      </Radio.Group>
    </div>
  );
};

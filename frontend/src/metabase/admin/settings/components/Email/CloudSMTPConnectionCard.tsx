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
  const isCloudSMTPConfigured = Boolean(useSetting("cloud-email-smtp-host"));
  const { value: iscloudSMTPEnabled, updateSetting } =
    useAdminSetting("cloud-smtp-enabled");

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
    updateSetting({ key: "cloud-smtp-enabled", value: newIsCloudSMTPEnabled });
  };

  return (
    <div className={S.root} data-testid="cloud-smtp-connection-card">
      <Radio.Group
        value={localValue ? "custom" : "metabase"}
        onChange={handleChange}
        // label="SMTP Configuration"
        // description="Choose a package that you will need in your application"
      >
        <Radio.Card radius="md" value="metabase" className={S.RadioCardRoot}>
          <Box p="lg">
            <Group justify="space-between">
              <Group wrap="nowrap" align="flex-start">
                {isCloudSMTPConfigured ? (
                  <Radio.Indicator className={S.indicator} />
                ) : (
                  <Icon name="check" c="success" size={20} />
                )}

                <div>
                  <Text className={S.label}>{t`Managed by Metabase`}</Text>
                  <Text>
                    {t`Emails come from Metabase (e.g. noreply@metabase.com)`}
                  </Text>
                </div>
              </Group>
            </Group>
          </Box>
        </Radio.Card>
        <Divider />
        {isCloudSMTPConfigured && (
          <Radio.Card radius="md" value="custom" className={S.RadioCardRoot}>
            <Box p="lg">
              <Group justify="space-between">
                <Group wrap="nowrap" align="flex-start">
                  <Radio.Indicator className={S.indicator} />
                  <div>
                    <Text className={S.label}>{t`Custom SMTP Server`}</Text>
                    <Text>{t`Emails come from your organisation`}</Text>
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
        {!isCloudSMTPConfigured && (
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

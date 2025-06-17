import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { Box, Button, Divider, Group, Radio, Text } from "metabase/ui";

import S from "./CloudSMTPConnectionCard.module.css";

export const CloudSMTPConnectionCard = ({
  onOpenCloudSMTPModal,
}: {
  onOpenCloudSMTPModal: () => void;
}) => {
  const isCloudSMTPConfigured = Boolean(useSetting("cloud-email-smtp-host"));

  return (
    <>
      <div className={S.root} data-testid="cloud-smtp-connection-card">
        <Radio.Group
          value={"metabase"}
          // onChange={setValue}
          // label="SMTP Configuration"
          // description="Choose a package that you will need in your application"
        >
          <Radio.Card
            radius="md"
            // onClick={() => setChecked((c) => !c)}
            value="metabase"
            className={S.RadioCardRoot}
          >
            <Box p="lg">
              <Group justify="space-between">
                <Group wrap="nowrap" align="flex-start">
                  <Radio.Indicator className={S.indicator} />
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
            <Radio.Card
              radius="md"
              // onClick={() => setChecked((c) => !c)}
              value="custom"
              className={S.RadioCardRoot}
            >
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
                    onClick={onOpenCloudSMTPModal}
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
    </>
  );
};

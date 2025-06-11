import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { color } from "metabase/lib/colors";
import { Button, Flex, Paper, Title } from "metabase/ui";

import { SettingsSection } from "../SettingsSection";

export const SMTPConnectionCard = ({
  onOpenSMTPModal,
}: {
  onOpenSMTPModal: () => void;
}) => {
  const isEmailConfigured = useSetting("email-configured?");

  return (
    <>
      <SettingsSection data-testid="smtp-connection-card">
        <Flex justify="space-between" align="center">
          <Flex align="center" gap="sm">
            <Title order={2}>{t`SMTP`}</Title>
            {isEmailConfigured && (
              <Paper
                fw="bold"
                c={"brand"}
                bg={color("brand-light")}
                p={"0.25rem 0.375rem"}
                radius="xs"
              >{t`Active`}</Paper>
            )}
          </Flex>
          <Button onClick={onOpenSMTPModal} variant="filled">
            {isEmailConfigured ? t`Edit configuration` : t`Configure`}
          </Button>
        </Flex>
      </SettingsSection>
    </>
  );
};

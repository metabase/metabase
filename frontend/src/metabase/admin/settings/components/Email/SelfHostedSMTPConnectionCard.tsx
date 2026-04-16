import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { useSetting } from "metabase/common/hooks";
import { Button, Flex, Paper, Title } from "metabase/ui";

import { SelfHostedSMTPConnectionForm } from "./SelfHostedSMTPConnectionForm";
import { trackSMTPSetupClick } from "./analytics";

export const SelfHostedSMTPConnectionCard = () => {
  const [showModal, { open: openModal, close: closeModal }] =
    useDisclosure(false);
  const isEmailConfigured = useSetting("email-configured?");

  return (
    <>
      <SettingsSection data-testid="self-hosted-smtp-connection-card">
        <Flex justify="space-between" align="center">
          <Flex align="center" gap="sm">
            <Title order={2}>{t`Self-Hosted SMTP`}</Title>
            {isEmailConfigured && (
              <Paper
                fw="bold"
                c={"brand"}
                bg="background-brand"
                p={"0.25rem 0.375rem"}
                radius="xs"
              >{t`Active`}</Paper>
            )}
          </Flex>
          <Button
            onClick={() => {
              openModal();
              trackSMTPSetupClick({ eventDetail: "self-hosted" });
            }}
            variant="filled"
          >
            {isEmailConfigured ? t`Edit configuration` : t`Configure`}
          </Button>
        </Flex>
      </SettingsSection>
      {showModal && <SelfHostedSMTPConnectionForm onClose={closeModal} />}
    </>
  );
};

import { useDisclosure } from "@mantine/hooks";
import { c, t } from "ttag";

import { EmbeddingLegaleseModal } from "metabase/embedding/settings/EmbeddingLegaleseModal";
import { useUpdateSettingsMutation } from "metabase/settings";
import { Anchor, Button, Center, Stack, Text } from "metabase/ui";

interface EnableEmbeddingPromptProps {
  isEnabled: boolean;
  isTermsAccepted: boolean;
}

export function EnableEmbeddingPrompt({
  isEnabled,
  isTermsAccepted,
}: EnableEmbeddingPromptProps) {
  const [updateSettings] = useUpdateSettingsMutation();
  const [
    isLegaleseModalOpen,
    { open: openLegaleseModal, close: closeLegaleseModal },
  ] = useDisclosure(false);

  const handleClick = async () => {
    if (!isTermsAccepted) {
      openLegaleseModal();
      return;
    }

    await updateSettings({ "enable-embedding-modular": true });
  };

  const usageConditionsLink = (
    <Anchor
      key="usage-conditions"
      href="https://metabase.com/license/embedding"
      target="_blank"
    >
      {t`usage conditions`}
    </Anchor>
  );

  const message = getMessage({
    isEnabled,
    isTermsAccepted,
    usageConditionsLink,
  });

  const buttonLabel = !isEnabled
    ? t`Enable modular embedding`
    : t`Accept and continue`;

  return (
    <Center h="100%">
      <Stack align="center" gap="lg" maw={400}>
        <Text ta="center" c="text-secondary">
          {message}
        </Text>
        <Button variant="filled" onClick={handleClick}>
          {buttonLabel}
        </Button>
      </Stack>
      {!isTermsAccepted && (
        <EmbeddingLegaleseModal
          opened={isLegaleseModalOpen}
          onClose={closeLegaleseModal}
          settingKey="enable-embedding-modular"
        />
      )}
    </Center>
  );
}

function getMessage({
  isEnabled,
  isTermsAccepted,
  usageConditionsLink,
}: EnableEmbeddingPromptProps & { usageConditionsLink: JSX.Element }) {
  if (isEnabled) {
    return c(
      "{0} is a link to the embedding conditions, for users to accept them and see a live preview of their theme.",
    )
      .jt`Accept the ${usageConditionsLink} to see a live preview of your theme.`;
  }

  if (!isTermsAccepted) {
    return c(
      "{0} is a link to the embedding conditions, for users to accept them and enable modular embedding to see a live preview of their theme.",
    )
      .jt`To see a live preview of your theme, enable modular embedding and agree to the ${usageConditionsLink}.`;
  }

  return c(
    "Prompt to enable modular embedding to see a live preview of an embedding theme.",
  ).t`Enable modular embedding to see a live preview of your theme.`;
}

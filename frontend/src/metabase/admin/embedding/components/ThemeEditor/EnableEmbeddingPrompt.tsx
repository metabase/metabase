import { t } from "ttag";

import { useUpdateSettingsMutation } from "metabase/api";
import { Button, Center, Stack, Text } from "metabase/ui";

interface EnableEmbeddingPromptProps {
  isEnabled: boolean;
  isTermsAccepted: boolean;
}

export function EnableEmbeddingPrompt({
  isEnabled,
  isTermsAccepted,
}: EnableEmbeddingPromptProps) {
  const [updateSettings] = useUpdateSettingsMutation();

  const handleEnable = async () => {
    await updateSettings({
      "enable-embedding-simple": true,
      ...(!isTermsAccepted && { "show-simple-embed-terms": false }),
    });
  };

  const message = !isEnabled
    ? t`Enable modular embedding to see a live preview of your theme.`
    : t`Accept the usage conditions to see a live preview of your theme.`;

  const buttonLabel = !isEnabled
    ? t`Enable modular embedding`
    : t`Accept and continue`;

  return (
    <Center h="100%">
      <Stack align="center" gap="md" maw={400}>
        <Text ta="center" c="text-secondary">
          {message}
        </Text>
        <Button variant="filled" onClick={handleEnable}>
          {buttonLabel}
        </Button>
      </Stack>
    </Center>
  );
}

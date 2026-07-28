import { c, t } from "ttag";

import { useUpdateSettingsMutation } from "metabase/api";
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

  const handleEnable = async () => {
    await updateSettings({
      "enable-embedding-simple": true,
      ...(!isTermsAccepted && { "show-simple-embed-terms": false }),
    });
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

  const message = !isEnabled
    ? c(
        "Prompt to enable modular embedding to see a live preview of an embedding theme.",
      ).t`Enable modular embedding to see a live preview of your theme.`
    : c(
        "{0} is a link to the embedding conditions, for users to accept them and see a live preview of their theme.",
      )
        .jt`Accept the ${usageConditionsLink} to see a live preview of your theme.`;

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

import { t } from "ttag";

import { Flex, Icon, Stack, Text, HoverCard } from "metabase/ui";

interface LoginPageIllustrationDescriptionProps {
  errorMessageContainerId: string;
}
export function LoginPageIllustrationDescription({
  errorMessageContainerId,
}: LoginPageIllustrationDescriptionProps) {
  return (
    <Text fw="bold" transform="none">
      <Flex align="center">
        {t`Login page`}
        <HoverCard position="top-start">
          <HoverCard.Target>
            <Icon aria-hidden name="info" />
          </HoverCard.Target>
          <HoverCard.Dropdown>
            <Stack p="md" spacing="sm" maw={420}>
              <Text size="sm">
                {t`For best results, choose an image that is horizontally oriented and upload it as an SVG file. Other accepted formats are JPG and PNG.`}
              </Text>
              <Text size="sm">{t`Your file should not be larger than 2MB.`}</Text>
            </Stack>
          </HoverCard.Dropdown>
        </HoverCard>
        <Text color="error" aria-hidden id={errorMessageContainerId}></Text>
      </Flex>
    </Text>
  );
}

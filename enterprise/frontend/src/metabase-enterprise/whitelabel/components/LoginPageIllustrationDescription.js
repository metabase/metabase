import { t } from "ttag";

import { useToggle } from "metabase/hooks/use-toggle";
import { Flex, Icon, Popover, Stack, Text } from "metabase/ui";

export function LoginPageIllustrationDescription() {
  const [opened, { turnOn, turnOff }] = useToggle(false);
  return (
    <Text fw="bold">
      <Flex align="center">
        {t`Login page`}
        <Popover key="popover" position="top-start" opened={opened}>
          <Popover.Target>
            <Icon name="info" onMouseEnter={turnOn} onMouseLeave={turnOff} />
          </Popover.Target>
          <Popover.Dropdown>
            <Stack p="md" spacing="sm" maw={420}>
              <Text size="sm">
                {t`For best results, choose an image that is horizontally oriented and upload it as an SVG file. Other accepted formats are JPG and PNG.`}
              </Text>
              <Text size="sm">{t`Your file should not be larger than 2MB.`}</Text>
            </Stack>
          </Popover.Dropdown>
        </Popover>
      </Flex>
    </Text>
  );
}

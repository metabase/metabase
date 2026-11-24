import { t } from "ttag";

import { Flex, Icon, Text } from "metabase/ui";

export function ReadOnlyToast() {
  return (
    <Flex pos="fixed" bottom="1rem" left={0} right={0} justify="center">
      <Flex
        role="status"
        align="center"
        gap="sm"
        px="md"
        py="sm"
        bdrs="sm"
        style={{
          background: "var(--mb-color-tooltip-background)",
          color: "var(--mb-color-tooltip-text)",
        }}
      >
        <Icon name="lock" />
        <Text fw="bold" c="inherit">
          {t`This preview is read-only, so your change wasn't saved.`}
        </Text>
      </Flex>
    </Flex>
  );
}

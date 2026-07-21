import { Flex, Icon } from "metabase/ui";

const ICON_SIZE = 20;

export function DataAppIcon() {
  return (
    <Flex
      align="center"
      justify="center"
      w="2.75rem"
      h="2.75rem"
      bd="1px solid var(--mb-color-border)"
      bg="background-secondary"
      visibleFrom="sm"
      style={{ borderRadius: "50%", flexShrink: 0 }}
    >
      <Icon name="app" size={ICON_SIZE} c="text-secondary" />
    </Flex>
  );
}

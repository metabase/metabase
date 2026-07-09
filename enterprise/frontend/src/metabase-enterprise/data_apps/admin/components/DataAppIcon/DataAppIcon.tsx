import { Flex, Icon } from "frontend/src/metabase/ui";

const ICON_SIZE = 20;

export function DataAppIcon() {
  return (
    <Flex
      align="center"
      justify="center"
      w="3rem"
      h="3rem"
      bd="1px solid var(--mb-color-border)"
      bg="background-secondary"
      style={{ borderRadius: "50%", flexShrink: 0 }}
    >
      <Icon name="app" size={ICON_SIZE} c="text-secondary" />
    </Flex>
  );
}

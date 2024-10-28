import { ActionIcon, Button, Flex, Icon, Tooltip } from "metabase/ui";
export function Header() {
  return (
    <Flex p="md" pb="sm">
      <Flex align="center">
        <Tooltip label="Back">
          <ActionIcon>
            <Icon name="chevronleft" />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Forward">
          <ActionIcon>
            <Icon name="chevronright" />
          </ActionIcon>
        </Tooltip>
      </Flex>

      <Flex ml="auto" align="center">
        <Tooltip label="Share">
          <ActionIcon>
            <Icon name="share" />
          </ActionIcon>
        </Tooltip>
        <Button compact mx="md" disabled>
          Persist me
        </Button>
        <Tooltip label="Fullscreen">
          <ActionIcon>
            <Icon name="expand" tooltip="" />
          </ActionIcon>
        </Tooltip>
      </Flex>
    </Flex>
  );
}

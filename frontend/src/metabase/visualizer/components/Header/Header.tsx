import { t } from "ttag";

import { ActionIcon, Button, Flex, Icon, Tooltip } from "metabase/ui";

export function Header() {
  return (
    <Flex p="md" pb="sm">
      <Flex align="center">
        <Tooltip label={t`Back`}>
          <ActionIcon>
            <Icon name="chevronleft" />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t`Forward`}>
          <ActionIcon>
            <Icon name="chevronright" />
          </ActionIcon>
        </Tooltip>
      </Flex>

      <Flex ml="auto" align="center">
        <Tooltip label={t`Share`}>
          <ActionIcon>
            <Icon name="share" />
          </ActionIcon>
        </Tooltip>
        <Button compact mx="md" disabled>
          Persist me
        </Button>
        <Tooltip label={t`Fullscreen`}>
          <ActionIcon>
            <Icon name="expand" />
          </ActionIcon>
        </Tooltip>
      </Flex>
    </Flex>
  );
}

import { t } from "ttag";

import { ActionIcon, Button, Flex, Icon, Tooltip } from "metabase/ui";
import { useVisualizerHistory } from "metabase/visualizer/hooks/use-visualizer-history";

export function Header() {
  const { canUndo, canRedo, undo, redo } = useVisualizerHistory();

  return (
    <Flex p="md" pb="sm">
      <Flex align="center">
        <Tooltip label={t`Back`}>
          <ActionIcon disabled={!canUndo} onClick={undo}>
            <Icon name="chevronleft" />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t`Forward`}>
          <ActionIcon disabled={!canRedo} onClick={redo}>
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

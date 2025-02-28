import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { ActionIcon, Button, Flex, Icon, Tooltip } from "metabase/ui";
import { useVisualizerHistory } from "metabase/visualizer/hooks/use-visualizer-history";
import {
  getCurrentVisualizerState,
  getIsDirty,
} from "metabase/visualizer/selectors";
import {
  toggleFullscreenMode,
  toggleVizSettingsSidebar,
} from "metabase/visualizer/visualizer.slice";
import type { VisualizerHistoryItem } from "metabase-types/store/visualizer";

interface HeaderProps {
  onSave?: (visualization: VisualizerHistoryItem) => void;
  saveLabel?: string;
}

export function Header({ onSave, saveLabel }: HeaderProps) {
  const { canUndo, canRedo, undo, redo } = useVisualizerHistory();

  const visualization = useSelector(getCurrentVisualizerState);
  const isDirty = useSelector(getIsDirty);

  const dispatch = useDispatch();

  const handleSave = () => {
    onSave?.(visualization);
  };

  return (
    <Flex p="md" pb="sm" justify="space-between">
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

      <Flex align="center" gap="sm">
        <Tooltip label={t`Settings`}>
          <ActionIcon
            disabled={!isDirty}
            onClick={() => dispatch(toggleVizSettingsSidebar())}
          >
            <Icon name="gear" />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t`Fullscreen`}>
          <ActionIcon
            disabled={!isDirty}
            onClick={() => dispatch(toggleFullscreenMode())}
          >
            <Icon name="expand" />
          </ActionIcon>
        </Tooltip>
        <Button variant="filled" disabled={!isDirty} onClick={handleSave}>
          {saveLabel ?? t`Add to dashboard`}
        </Button>
      </Flex>
    </Flex>
  );
}

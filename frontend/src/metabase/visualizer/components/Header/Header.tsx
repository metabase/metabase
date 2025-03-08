import { useCallback } from "react";
import { t } from "ttag";

import EditableText from "metabase/core/components/EditableText";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { ActionIcon, Button, Flex, Icon, Tooltip } from "metabase/ui";
import { useVisualizerHistory } from "metabase/visualizer/hooks/use-visualizer-history";
import {
  getCurrentVisualizerState,
  getIsDirty,
  getVisualizationTitle,
} from "metabase/visualizer/selectors";
import {
  setTitle,
  toggleFullscreenMode,
} from "metabase/visualizer/visualizer.slice";
import type { VisualizerHistoryItem } from "metabase-types/store/visualizer";

import S from "./Header.module.css";

interface HeaderProps {
  onSave?: (visualization: VisualizerHistoryItem) => void;
  saveLabel?: string;
  allowSaveWhenPristine?: boolean;
}

export function Header({
  onSave,
  saveLabel,
  allowSaveWhenPristine = false,
}: HeaderProps) {
  const { canUndo, canRedo, undo, redo } = useVisualizerHistory();

  const visualization = useSelector(getCurrentVisualizerState);
  const isDirty = useSelector(getIsDirty);
  const title = useSelector(getVisualizationTitle);

  const dispatch = useDispatch();

  const handleSave = () => {
    onSave?.(visualization);
  };

  const handleChangeTitle = useCallback(
    (nextTitle: string) => {
      dispatch(setTitle(nextTitle));
    },
    [dispatch],
  );

  return (
    <Flex p="md" pb="sm" align="center">
      <ActionIcon onClick={() => dispatch(toggleFullscreenMode())}>
        <Icon name="sidebar_open" />
      </ActionIcon>
      <EditableText
        initialValue={title}
        onChange={handleChangeTitle}
        className={S.title}
      />

      <Flex align="center" gap="sm" ml="auto">
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
        <Button
          variant="filled"
          disabled={!isDirty && !allowSaveWhenPristine}
          onClick={handleSave}
        >
          {saveLabel ?? t`Add to dashboard`}
        </Button>
      </Flex>
    </Flex>
  );
}

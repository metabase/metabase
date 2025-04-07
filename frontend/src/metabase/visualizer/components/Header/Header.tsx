import { useCallback } from "react";
import { t } from "ttag";

import EditableText from "metabase/core/components/EditableText";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { ActionIcon, Button, Flex, Icon, Tooltip } from "metabase/ui";
import { useVisualizerHistory } from "metabase/visualizer/hooks/use-visualizer-history";
import {
  getCurrentVisualizerState,
  getIsDirty,
  getIsRenderable,
  getVisualizationTitle,
} from "metabase/visualizer/selectors";
import {
  setTitle,
  toggleDataSideBar,
} from "metabase/visualizer/visualizer.slice";
import type { VisualizerHistoryItem } from "metabase-types/store/visualizer";

import S from "./Header.module.css";

interface HeaderProps {
  onSave?: (visualization: VisualizerHistoryItem) => void;
  saveLabel?: string;
  allowSaveWhenPristine?: boolean;
  className?: string;
}

export function Header({
  onSave,
  saveLabel,
  allowSaveWhenPristine = false,
  className,
}: HeaderProps) {
  const { canUndo, canRedo, undo, redo } = useVisualizerHistory();

  const visualizerState = useSelector(getCurrentVisualizerState);

  const isDirty = useSelector(getIsDirty);
  const isRenderable = useSelector(getIsRenderable);
  const title = useSelector(getVisualizationTitle);

  const dispatch = useDispatch();

  const handleSave = () => {
    onSave?.(visualizerState);
  };

  const handleChangeTitle = useCallback(
    (nextTitle: string) => {
      dispatch(setTitle(nextTitle));
    },
    [dispatch],
  );

  const saveButtonEnabled = isRenderable && (isDirty || allowSaveWhenPristine);

  return (
    <Flex p="md" pb="sm" align="center" className={className}>
      <ActionIcon onClick={() => dispatch(toggleDataSideBar())}>
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
          disabled={!saveButtonEnabled}
          onClick={handleSave}
        >
          {saveLabel ?? t`Add to dashboard`}
        </Button>
      </Flex>
    </Flex>
  );
}

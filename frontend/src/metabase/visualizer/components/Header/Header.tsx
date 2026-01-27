import { useCallback } from "react";
import { t } from "ttag";
import _ from "underscore";

import { EditableText } from "metabase/common/components/EditableText";
import { trackSimpleEvent } from "metabase/lib/analytics";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { ActionIcon, Button, Flex, Icon, Tooltip } from "metabase/ui";
import { useVisualizerHistory } from "metabase/visualizer/hooks/use-visualizer-history";
import {
  getCurrentVisualizerState,
  getIsDirty,
  getIsRenderable,
  getVisualizationTitle,
} from "metabase/visualizer/selectors";
import { setTitle } from "metabase/visualizer/visualizer.slice";
import type { VisualizerVizDefinition } from "metabase-types/api";

import { useVisualizerUi } from "../VisualizerUiContext";

import S from "./Header.module.css";

interface HeaderProps {
  onSave: (visualization: VisualizerVizDefinition) => void;
  onClose: () => void;
  saveLabel?: string;
  allowSaveWhenPristine?: boolean;
  className?: string;
}

export function Header({
  onSave,
  onClose,
  saveLabel,
  allowSaveWhenPristine = false,
  className,
}: HeaderProps) {
  const { canUndo, canRedo, undo, redo } = useVisualizerHistory();
  const { setDataSidebarOpen } = useVisualizerUi();

  const visualizerState = useSelector(getCurrentVisualizerState);

  const isDirty = useSelector(getIsDirty);
  const isRenderable = useSelector(getIsRenderable);
  const title = useSelector(getVisualizationTitle);

  const dispatch = useDispatch();

  const handleSave = () => {
    trackSimpleEvent({
      event: "visualizer_save_clicked",
      triggered_from: "visualizer-modal",
    });

    onSave(
      _.pick(visualizerState, ["display", "columnValuesMapping", "settings"]),
    );
  };

  const handleChangeTitle = useCallback(
    (nextTitle: string) => {
      dispatch(setTitle(nextTitle));
    },
    [dispatch],
  );

  const saveButtonEnabled = isRenderable && (isDirty || allowSaveWhenPristine);

  return (
    <Flex
      p="md"
      gap="md"
      align="center"
      className={className}
      data-testid="visualizer-header"
    >
      <ActionIcon onClick={() => setDataSidebarOpen((isOpen) => !isOpen)}>
        <Icon name="sidebar_open" />
      </ActionIcon>
      <EditableText
        initialValue={title}
        isOptional
        onChange={handleChangeTitle}
        className={S.title}
        data-testid="visualizer-title"
        placeholder={t`Add a title`}
      />

      {/* Spacer */}
      <div style={{ flexGrow: 1 }} />

      <Button.Group>
        <Tooltip withinPortal={false} label={t`Undo`}>
          <Button
            size="sm"
            aria-label={t`Undo`}
            disabled={!canUndo}
            onClick={undo}
            leftSection={
              <Icon name="undo" c={canUndo ? "none" : "text-tertiary"} />
            }
          />
        </Tooltip>
        <Tooltip withinPortal={false} label={t`Redo`}>
          <Button
            size="sm"
            aria-label={t`Redo`}
            disabled={!canRedo}
            onClick={redo}
            leftSection={
              <Icon name="redo" c={canRedo ? "unset" : "text-tertiary"} />
            }
          />
        </Tooltip>
      </Button.Group>
      <Button
        variant="filled"
        size="sm"
        disabled={!saveButtonEnabled}
        onClick={handleSave}
      >
        {saveLabel ?? t`Add to dashboard`}
      </Button>
      <ActionIcon
        data-testid="visualizer-close-button"
        onClick={() => {
          trackSimpleEvent({
            event: "visualizer_close_clicked",
            triggered_from: "visualizer-modal",
          });
          onClose();
        }}
      >
        <Icon name="close" />
      </ActionIcon>
    </Flex>
  );
}

import { useCallback, useEffect } from "react";
import { useUnmount } from "react-use";
import { t } from "ttag";

import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useDispatch, useSelector } from "metabase/redux";
import { Box, Modal } from "metabase/ui";
import {
  getDataSources,
  getIsDirty,
  getVisualizationTitle,
} from "metabase/visualizer/selectors";
import {
  initializeVisualizer,
  resetVisualizer,
} from "metabase/visualizer/visualizer.slice";
import type { DashboardId, VisualizerVizDefinition } from "metabase-types/api";

import { Header } from "../Header";
import { VisualizerUiProvider } from "../VisualizerUiContext";

import { AppearanceEditor } from "./AppearanceEditor";
import { SeriesManager } from "./SeriesManager";
import S from "./VisualizationEditor.module.css";

export type VisualizationEditorMode = "series" | "appearance";

interface VisualizationEditorModalProps {
  mode: VisualizationEditorMode;
  initialState: VisualizerVizDefinition;
  dashboardId: DashboardId | undefined;
  onSave: (visualization: VisualizerVizDefinition) => void;
  onClose: () => void;
}

/**
 * Edits a visualization of a dashboard card in one of two separate modes: the
 * questions that give its series, or the appearance of its chart.
 */
export function VisualizationEditorModal({
  mode,
  initialState,
  dashboardId,
  onSave,
  onClose,
}: VisualizationEditorModalProps) {
  const dispatch = useDispatch();
  const isDirty = useSelector(getIsDirty);
  const title = useSelector(getVisualizationTitle);
  const mainSourceName = useSelector(getDataSources)[0]?.name;
  const { modalContent, show: askConfirmation } = useConfirmation();

  useEffect(() => {
    dispatch(initializeVisualizer({ state: initialState }));
    // Initialize once, when the modal opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useUnmount(() => {
    dispatch(resetVisualizer());
  });

  // The title of a chart defaults to the name of its main question. Store it,
  // so that the dashboard card keeps that title after the save. With several
  // questions the computed title is empty, so use the main question name.
  const handleSave = useCallback(
    (visualization: VisualizerVizDefinition) => {
      onSave({
        ...visualization,
        settings: {
          ...visualization.settings,
          "card.title":
            visualization.settings["card.title"] ?? title ?? mainSourceName,
        },
      });
    },
    [onSave, title, mainSourceName],
  );

  const handleClose = useCallback(() => {
    if (!isDirty) {
      onClose();
      return;
    }
    askConfirmation({
      title: t`Are you sure you want to leave?`,
      message: t`Any unsaved changes will be lost.`,
      confirmButtonText: t`Close`,
      onConfirm: onClose,
    });
  }, [askConfirmation, isDirty, onClose]);

  return (
    <>
      <Modal
        opened
        size="100%"
        withCloseButton={false}
        padding={0}
        onClose={handleClose}
        styles={{ content: { overflow: "hidden" } }}
      >
        <VisualizerUiProvider>
          <Box className={S.Root}>
            <Header
              className={S.Header}
              onSave={handleSave}
              onClose={handleClose}
              saveLabel={t`Save`}
              showDataSidebarToggle={false}
              subtitle={mode === "series" ? t`Series` : t`Appearance`}
            />
            {mode === "series" ? (
              <SeriesManager dashboardId={dashboardId} />
            ) : (
              <AppearanceEditor />
            )}
          </Box>
        </VisualizerUiProvider>
      </Modal>
      {modalContent}
    </>
  );
}

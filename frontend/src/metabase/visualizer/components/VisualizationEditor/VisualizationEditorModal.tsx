import { useCallback, useEffect, useState } from "react";
import { useUnmount } from "react-use";
import { t } from "ttag";

import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useDispatch, useSelector } from "metabase/redux";
import { Box, Center, Flex, Loader, Modal, Tabs } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import {
  getDataSources,
  getIsDirty,
  getUsedDataSources,
  getVisualizationTitle,
  getVisualizationType,
  getVisualizerRawSeries,
} from "metabase/visualizer/selectors";
import {
  initializeVisualizer,
  resetVisualizer,
  setDisplay,
} from "metabase/visualizer/visualizer.slice";
import { isCartesianChart } from "metabase/viz-core";
import type {
  DashboardId,
  VisualizationDisplay,
  VisualizerVizDefinition,
} from "metabase-types/api";

import { Header } from "../Header";
import { VisualizationPicker } from "../VisualizationPicker";
import { VisualizerUiProvider } from "../VisualizerUiContext";

import { SeriesManager } from "./SeriesManager";
import S from "./VisualizationEditor.module.css";
import { SettingsSection, useSettingsSections } from "./settings";

const SERIES_TAB = "series";

export type VisualizationEditorMode = "series" | "appearance";

interface VisualizationEditorModalProps {
  mode: VisualizationEditorMode;
  initialState: VisualizerVizDefinition;
  dashboardId: DashboardId | undefined;
  onSave: (visualization: VisualizerVizDefinition) => void;
  onClose: () => void;
}

/**
 * Edits a visualization of a dashboard card: the questions that give its
 * series, the settings of each series, and the general chart settings.
 * `mode` selects the tab that opens first.
 */
export function VisualizationEditorModal({
  mode: initialMode,
  initialState,
  dashboardId,
  onSave,
  onClose,
}: VisualizationEditorModalProps) {
  const dispatch = useDispatch();
  const display = useSelector(getVisualizationType);
  const rawSeries = useSelector(getVisualizerRawSeries);
  const dataSourceCount = useSelector(getUsedDataSources).length;
  const hasSeriesTab = display != null && isCartesianChart(display);
  const { getSectionWidgets, sectionNames } = useSettingsSections(hasSeriesTab);
  const [selectedTab, setSelectedTab] = useState<string | null>(
    initialMode === "series" ? SERIES_TAB : null,
  );
  const tab =
    (hasSeriesTab && selectedTab === SERIES_TAB) ||
    (selectedTab != null && sectionNames.includes(selectedTab))
      ? selectedTab
      : hasSeriesTab && initialMode === "series"
        ? SERIES_TAB
        : (sectionNames[0] ?? null);

  const handleChangeDisplay = useCallback(
    (nextDisplay: string) => {
      // The picker offers only keys of the visualization registry, and those
      // are displays, but the segmented control gives a plain string.
      dispatch(setDisplay(nextDisplay as VisualizationDisplay));
    },
    [dispatch],
  );
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
            />
            <Box className={S.EditorLayout}>
              <Box className={S.Chart}>
                {rawSeries.length > 0 ? (
                  <Visualization
                    rawSeries={rawSeries}
                    isDashboard
                    isVisualizer
                  />
                ) : (
                  <Center h="100%">
                    <Loader />
                  </Center>
                )}
              </Box>
              <Flex className={S.Footer} px="xl" py="md">
                {display && (
                  <VisualizationPicker
                    value={display}
                    onChange={handleChangeDisplay}
                    // A chart with several questions shares one x-axis, so it
                    // can only switch between the chart types with an x-axis.
                    filter={dataSourceCount > 1 ? isCartesianChart : undefined}
                  />
                )}
              </Flex>
              <Box className={S.Panel}>
                <Tabs value={tab} onChange={setSelectedTab} px="lg" pt="md">
                  <Tabs.List>
                    {hasSeriesTab && (
                      <Tabs.Tab value={SERIES_TAB}>{t`Series`}</Tabs.Tab>
                    )}
                    {sectionNames.map((name) => (
                      <Tabs.Tab key={name} value={name}>
                        {name}
                      </Tabs.Tab>
                    ))}
                  </Tabs.List>
                </Tabs>
                <Box className={S.PanelContent}>
                  {tab === SERIES_TAB ? (
                    <SeriesManager dashboardId={dashboardId} />
                  ) : tab != null ? (
                    <SettingsSection
                      widgets={getSectionWidgets(tab)}
                      section={tab}
                    />
                  ) : null}
                </Box>
              </Box>
            </Box>
          </Box>
        </VisualizerUiProvider>
      </Modal>
      {modalContent}
    </>
  );
}

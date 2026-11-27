import { useCallback, useEffect, useState } from "react";
import { useUnmount } from "react-use";
import { t } from "ttag";

import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import {
  VISUALIZATION_EDITOR_LAYOUT,
  usePrototypeSetting,
} from "metabase/prototype";
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
  DashCardId,
  DashboardId,
  VisualizationDisplay,
  VisualizerVizDefinition,
} from "metabase-types/api";

import { Header } from "../Header";
import { VisualizationPicker } from "../VisualizationPicker";
import { VisualizerUiProvider } from "../VisualizerUiContext";

import { FloatingEditor } from "./FloatingEditor";
import { SeriesManager } from "./SeriesManager";
import S from "./VisualizationEditor.module.css";
import { SettingsSection, useSettingsSections } from "./settings";

const SERIES_TAB = "series";

export type VisualizationEditorMode = "series" | "appearance";

interface VisualizationEditorModalProps {
  mode: VisualizationEditorMode;
  initialState: VisualizerVizDefinition;
  dashboardId: DashboardId | undefined;
  dashcardId: DashCardId;
  onSave: (visualization: VisualizerVizDefinition) => void;
  onClose: () => void;
}

/**
 * Edits a visualization of a dashboard card: the questions that give its
 * series, the settings of each series, and the general chart settings.
 * `mode` selects the tab that opens first.
 */
export function VisualizationEditorModal({
  mode,
  initialState,
  dashboardId,
  dashcardId,
  onSave,
  onClose,
}: VisualizationEditorModalProps) {
  const dispatch = useDispatch();
  const [layout] = usePrototypeSetting(VISUALIZATION_EDITOR_LAYOUT);
  const isDirty = useSelector(getIsDirty);
  const title = useSelector(getVisualizationTitle);
  const mainSourceName = useSelector(getDataSources)[0]?.name;
  const { modalContent, show: askConfirmation } = useConfirmation();

  useEffect(() => {
    dispatch(initializeVisualizer({ state: initialState }));
    // Initialize once, when the editor opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useUnmount(() => {
    dispatch(resetVisualizer());
  });

  // The title of a chart defaults to the name of its main question. Store it,
  // so that the dashboard card keeps that title after the save. With several
  // questions the computed title is empty, so use the main question name.
  const getVisualizationToSave = useCallback(
    (visualization: VisualizerVizDefinition) => ({
      ...visualization,
      settings: {
        ...visualization.settings,
        "card.title":
          visualization.settings["card.title"] ?? title ?? mainSourceName,
      },
    }),
    [title, mainSourceName],
  );

  const confirmClose = useCallback(
    (close: () => void) => {
      if (!isDirty) {
        close();
        return;
      }
      askConfirmation({
        title: t`Are you sure you want to leave?`,
        message: t`Any unsaved changes will be lost.`,
        confirmButtonText: t`Close`,
        onConfirm: close,
      });
    },
    [askConfirmation, isDirty],
  );

  const panel = (
    <EditorPanel
      mode={mode}
      dashboardId={dashboardId}
      withChartTypePicker={layout === "floating"}
    />
  );

  return (
    <VisualizerUiProvider>
      {layout === "floating" ? (
        <FloatingEditor
          dashcardId={dashcardId}
          title={title ?? mainSourceName}
          chart={<EditorChart />}
          renderHeader={(animateOut) => (
            <Header
              className={S.Header}
              onSave={(visualization) =>
                animateOut(() => onSave(getVisualizationToSave(visualization)))
              }
              onClose={() => confirmClose(() => animateOut(onClose))}
              saveLabel={t`Save`}
              showDataSidebarToggle={false}
            />
          )}
          panel={panel}
        />
      ) : (
        <Modal
          opened
          size="100%"
          withCloseButton={false}
          padding={0}
          onClose={() => confirmClose(onClose)}
          styles={{ content: { overflow: "hidden" } }}
        >
          <Box className={S.Root}>
            <Header
              className={S.Header}
              onSave={(visualization) =>
                onSave(getVisualizationToSave(visualization))
              }
              onClose={() => confirmClose(onClose)}
              saveLabel={t`Save`}
              showDataSidebarToggle={false}
            />
            <Box className={S.EditorLayout}>
              <Box className={S.Chart}>
                <EditorChart />
              </Box>
              <Flex className={S.Footer} px="xl" py="md">
                <ChartTypePicker />
              </Flex>
              <Box className={S.Panel}>{panel}</Box>
            </Box>
          </Box>
        </Modal>
      )}
      {modalContent}
    </VisualizerUiProvider>
  );
}

function EditorChart() {
  const rawSeries = useSelector(getVisualizerRawSeries);
  return rawSeries.length > 0 ? (
    <Visualization rawSeries={rawSeries} isDashboard isVisualizer />
  ) : (
    <Center h="100%">
      <Loader />
    </Center>
  );
}

function ChartTypePicker() {
  const dispatch = useDispatch();
  const display = useSelector(getVisualizationType);
  const dataSourceCount = useSelector(getUsedDataSources).length;

  const handleChangeDisplay = useCallback(
    (nextDisplay: string) => {
      // The picker offers only keys of the visualization registry, and those
      // are displays, but the segmented control gives a plain string.
      dispatch(setDisplay(nextDisplay as VisualizationDisplay));
    },
    [dispatch],
  );

  return display ? (
    <VisualizationPicker
      value={display}
      onChange={handleChangeDisplay}
      // A chart with several questions shares one x-axis, so it can only
      // switch between the chart types with an x-axis.
      filter={dataSourceCount > 1 ? isCartesianChart : undefined}
    />
  ) : null;
}

function EditorPanel({
  mode,
  dashboardId,
  withChartTypePicker,
}: {
  mode: VisualizationEditorMode;
  dashboardId: DashboardId | undefined;
  withChartTypePicker: boolean;
}) {
  const display = useSelector(getVisualizationType);
  const hasSeriesTab = display != null && isCartesianChart(display);
  const { getSectionWidgets, sectionNames } = useSettingsSections(hasSeriesTab);
  const [selectedTab, setSelectedTab] = useState<string | null>(
    mode === "series" ? SERIES_TAB : null,
  );
  const tab =
    (hasSeriesTab && selectedTab === SERIES_TAB) ||
    (selectedTab != null && sectionNames.includes(selectedTab))
      ? selectedTab
      : hasSeriesTab && mode === "series"
        ? SERIES_TAB
        : (sectionNames[0] ?? null);

  return (
    <>
      {withChartTypePicker && (
        <Box px="lg" pt="md">
          <ChartTypePicker />
        </Box>
      )}
      <Tabs value={tab} onChange={setSelectedTab} px="lg" pt="md">
        <Tabs.List>
          {hasSeriesTab && <Tabs.Tab value={SERIES_TAB}>{t`Series`}</Tabs.Tab>}
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
          <SettingsSection widgets={getSectionWidgets(tab)} section={tab} />
        ) : null}
      </Box>
    </>
  );
}

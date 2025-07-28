import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { isNotNull } from "metabase/lib/types";
import { getSensibleVisualizations } from "metabase/query_builder/components/chart-type-selector/use-question-visualization-state";
import { getMetadata } from "metabase/selectors/metadata";
import {
  Box,
  Button,
  Group,
  Icon,
  Loader,
  Menu,
  Stack,
  Text,
} from "metabase/ui";
import visualizations from "metabase/visualizations";
import { QuestionChartSettings } from "metabase/visualizations/components/ChartSettings";
import Question from "metabase-lib/v1/Question";
import type {
  CardDisplayType,
  VisualizationSettings,
} from "metabase-types/api";

import { useReportActions } from "../hooks";
import {
  clearDraftState,
  updateVisualizationType,
  updateVizSettings,
} from "../reports.slice";
import {
  getHasDraftChanges,
  getIsLoadingCard,
  getIsLoadingDataset,
  getReportCard,
  getReportCardWithDraftSettings,
  getReportRawSeries,
  getReportRawSeriesWithDraftSettings,
  getSelectedEmbedIndex,
} from "../selectors";

interface EmbedQuestionSettingsSidebarProps {
  cardId: number;
  snapshotId: number;
  onClose: () => void;
  editorInstance?: any;
}

export const EmbedQuestionSettingsSidebar = ({
  cardId,
  snapshotId,
  editorInstance,
}: EmbedQuestionSettingsSidebarProps) => {
  const dispatch = useDispatch();
  const metadata = useSelector(getMetadata);
  const selectedEmbedIndex = useSelector(getSelectedEmbedIndex);
  const hasDraftChanges = useSelector(getHasDraftChanges);
  const { commitVisualizationChanges } = useReportActions();

  // Use card with draft settings merged for the sidebar
  const card = useSelector((state) =>
    selectedEmbedIndex !== null
      ? getReportCardWithDraftSettings(state, cardId)
      : getReportCard(state, cardId),
  );
  const series = useSelector((state) =>
    selectedEmbedIndex !== null
      ? getReportRawSeriesWithDraftSettings(state, cardId, snapshotId)
      : null,
  );
  const isCardLoading = useSelector((state) => getIsLoadingCard(state, cardId));
  const isResultsLoading = useSelector((state) =>
    getIsLoadingDataset(state, snapshotId),
  );

  const question = useMemo(
    () => (card ? new Question(card, metadata) : null),
    [card, metadata],
  );

  const dataset =
    useSelector((state) => getReportRawSeries(state, cardId, snapshotId))?.[0]
      ?.data || null;

  const { sensibleVisualizations, nonSensibleVisualizations } = useMemo(() => {
    return getSensibleVisualizations({ result: dataset });
  }, [dataset]);

  const getVisualizationItems = (visualizationType: CardDisplayType) => {
    const visualization = visualizations.get(visualizationType);
    if (!visualization) {
      return null;
    }

    return {
      value: visualizationType,
      label: visualization.getUiName(),
      iconName: visualization.iconName,
    };
  };

  const sensibleItems = useMemo(
    () => sensibleVisualizations.map(getVisualizationItems).filter(isNotNull),
    [sensibleVisualizations],
  );

  const nonsensibleItems = useMemo(
    () =>
      nonSensibleVisualizations.map(getVisualizationItems).filter(isNotNull),
    [nonSensibleVisualizations],
  );

  const selectedElem = useMemo(
    () =>
      getVisualizationItems((card?.display as CardDisplayType) ?? "table") ??
      sensibleItems[0] ??
      nonsensibleItems[0],
    [card?.display, sensibleItems, nonsensibleItems],
  );

  const handleSettingsChange = (settings: VisualizationSettings) => {
    if (selectedEmbedIndex !== null) {
      dispatch(updateVizSettings({ settings }));
    }
  };

  const handleVisualizationTypeChange = (display: CardDisplayType) => {
    if (selectedEmbedIndex !== null) {
      dispatch(updateVisualizationType({ display }));
    }
  };

  const handleDone = useCallback(async () => {
    if (selectedEmbedIndex !== null) {
      if (hasDraftChanges) {
        await commitVisualizationChanges(selectedEmbedIndex, editorInstance);
      } else {
        // No changes, just clear the draft state to show UsedContent
        dispatch(clearDraftState());
      }
    }
  }, [
    selectedEmbedIndex,
    hasDraftChanges,
    commitVisualizationChanges,
    editorInstance,
    dispatch,
  ]);

  if (isCardLoading || isResultsLoading || !series) {
    return (
      <Stack gap="lg" p="lg" style={{ height: "100%" }}>
        <Box
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: 1,
            flexDirection: "column",
            gap: "1rem",
          }}
        >
          <Loader size="lg" />
          <Text>{t`Loading question settings...`}</Text>
        </Box>
      </Stack>
    );
  }

  if (!card || !series) {
    return (
      <Stack gap="lg" p="lg" style={{ height: "100%" }}>
        <Box
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: 1,
          }}
        >
          <Text color="error">{t`Failed to load question`}</Text>
        </Box>
      </Stack>
    );
  }

  return (
    <Box
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--mb-color-bg-white)",
      }}
    >
      <Box
        style={{
          borderBottom: "1px solid var(--mb-color-border)",
          backgroundColor: "var(--mb-color-bg-white)",
        }}
      >
        <Group align="center" p="md">
          <Text size="md" fw="bold">
            {t`Visualize as`}
          </Text>
          <Menu position="bottom-start">
            <Menu.Target>
              <Button
                variant="default"
                disabled={!selectedElem}
                rightSection={<Icon ml="xs" size={10} name="chevrondown" />}
                leftSection={
                  selectedElem?.iconName ? (
                    <Icon name={selectedElem.iconName} />
                  ) : null
                }
                justify="space-between"
              >
                {selectedElem?.label}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              {sensibleItems.map(({ iconName, label, value }, index) => (
                <Menu.Item
                  key={`${value}/${index}`}
                  onClick={() => handleVisualizationTypeChange(value)}
                  leftSection={iconName ? <Icon name={iconName} /> : null}
                >
                  {label}
                </Menu.Item>
              ))}

              {nonsensibleItems.length > 0 && (
                <>
                  <Menu.Label>{t`Other charts`}</Menu.Label>
                  {nonsensibleItems.map(({ iconName, label, value }, index) => (
                    <Menu.Item
                      key={`${value}/${index}`}
                      onClick={() => handleVisualizationTypeChange(value)}
                      leftSection={iconName ? <Icon name={iconName} /> : null}
                    >
                      {label}
                    </Menu.Item>
                  ))}
                </>
              )}
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Box>
      <Box style={{ flex: 1, overflow: "auto" }}>
        <QuestionChartSettings
          question={question as any}
          series={series}
          onChange={handleSettingsChange}
          computedSettings={card.visualization_settings || {}}
        />
      </Box>
      <Box
        style={{
          borderTop: "1px solid var(--mb-color-border)",
          padding: "1rem",
          backgroundColor: "var(--mb-color-bg-white)",
        }}
      >
        <Button fullWidth variant="filled" onClick={handleDone}>
          {t`Done`}
        </Button>
      </Box>
    </Box>
  );
};

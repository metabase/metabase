import { useMemo } from "react";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { isNotNull } from "metabase/lib/types";
import { getSensibleVisualizations } from "metabase/query_builder/components/chart-type-selector/use-question-visualization-state";
import { getMetadata } from "metabase/selectors/metadata";
import {
  Box,
  Button,
  Icon,
  Loader,
  Menu,
  Space,
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

import { updateVisualizationType, updateVizSettings } from "../reports.slice";
import {
  getIsLoadingCard,
  getIsLoadingDataset,
  getReportCard,
  getReportRawSeries,
} from "../selectors";

interface EmbedQuestionSettingsSidebarProps {
  questionId: number;
  onClose: () => void;
}

export const EmbedQuestionSettingsSidebar = ({
  questionId,
}: EmbedQuestionSettingsSidebarProps) => {
  const dispatch = useDispatch();
  const metadata = useSelector(getMetadata);
  const card = useSelector((state) => getReportCard(state, questionId));
  const series = useSelector((state) => getReportRawSeries(state, questionId));
  const isCardLoading = useSelector((state) =>
    getIsLoadingCard(state, questionId),
  );
  const isResultsLoading = useSelector((state) =>
    getIsLoadingDataset(state, questionId),
  );

  const question = useMemo(
    () => (card ? new Question(card, metadata) : null),
    [card, metadata],
  );

  const dataset =
    useSelector((state) => getReportRawSeries(state, questionId))?.[0]?.data ||
    null;

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
      getVisualizationItems(card?.display ?? "table") ??
      sensibleItems[0] ??
      nonsensibleItems[0],
    [card?.display, sensibleItems, nonsensibleItems],
  );

  const handleSettingsChange = (settings: VisualizationSettings) => {
    if (card) {
      dispatch(updateVizSettings({ cardId: card.id, settings }));
    }
  };

  const handleVisualizationTypeChange = (display: CardDisplayType) => {
    if (card) {
      dispatch(
        updateVisualizationType({
          cardId: card.id,
          display,
        }),
      );
    }
  };

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
        overflow: "auto",
        backgroundColor: "var(--mb-color-bg-white)",
      }}
    >
      <Stack gap="md" p="md">
        <Box>
          <Text size="sm" fw="bold" mb="xs">
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
                fullWidth
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
        </Box>
      </Stack>
      <Space h="md" />
      <QuestionChartSettings
        question={question as any}
        series={series}
        onChange={handleSettingsChange}
        computedSettings={card.visualization_settings || {}}
      />
    </Box>
  );
};

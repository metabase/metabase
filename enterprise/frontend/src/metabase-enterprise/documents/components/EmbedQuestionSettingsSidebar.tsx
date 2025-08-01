import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { cardApi } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import { isNotNull } from "metabase/lib/types";
import { getSensibleVisualizations } from "metabase/query_builder/components/chart-type-selector/use-question-visualization-state";
import { getMetadata } from "metabase/selectors/metadata";
import {
  ActionIcon,
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

import {
  clearDraftState,
  updateVisualizationType,
  updateVizSettings,
} from "../documents.slice";
import { useDocumentActions } from "../hooks";
import { useDocumentsSelector } from "../redux-utils";
import {
  getDocumentCardWithDraftSettings,
  getHasDraftChanges,
  getSelectedEmbedIndex,
} from "../selectors";

interface EmbedQuestionSettingsSidebarProps {
  cardId: number;
  onClose: () => void;
  editorInstance?: any;
}

export const EmbedQuestionSettingsSidebar = ({
  cardId,
  editorInstance,
}: EmbedQuestionSettingsSidebarProps) => {
  const dispatch = useDispatch();
  const metadata = useDocumentsSelector(getMetadata);
  const selectedEmbedIndex = useDocumentsSelector(getSelectedEmbedIndex);
  const { commitVisualizationChanges } = useDocumentActions();

  const { data: card, isLoading: isCardLoading } = cardApi.useGetCardQuery(
    { id: cardId },
    { skip: !cardId },
  );
  const { data: dataset, isLoading: isResultsLoading } =
    cardApi.useGetCardQueryQuery({ cardId }, { skip: !cardId || !card });

  // Use card with draft settings merged for the sidebar
  const cardWithDraft = useDocumentsSelector((state) =>
    selectedEmbedIndex !== null && card
      ? getDocumentCardWithDraftSettings(state, cardId, card)
      : card,
  );

  const hasDraftChanges = useDocumentsSelector((state) =>
    getHasDraftChanges(state, card),
  );

  const series = useMemo(() => {
    return cardWithDraft && dataset?.data
      ? [
          {
            card: cardWithDraft,
            started_at: dataset.started_at,
            data: dataset.data,
          },
        ]
      : null;
  }, [cardWithDraft, dataset]);

  const question = useMemo(
    () => (cardWithDraft ? new Question(cardWithDraft, metadata) : null),
    [cardWithDraft, metadata],
  );

  const { sensibleVisualizations, nonSensibleVisualizations } = useMemo(() => {
    return getSensibleVisualizations({ result: dataset ?? null });
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
      getVisualizationItems(
        (cardWithDraft?.display as CardDisplayType) ?? "table",
      ) ??
      sensibleItems[0] ??
      nonsensibleItems[0],
    [cardWithDraft?.display, sensibleItems, nonsensibleItems],
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
      if (hasDraftChanges && card) {
        await commitVisualizationChanges(
          selectedEmbedIndex,
          editorInstance,
          card,
        );
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
    card,
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

  if (!cardWithDraft || !series) {
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
        alignItems: "stretch",
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
        <Group w="100%" justify="space-between" align="flex-start">
          <Group align="center" p="md">
            <Text size="md" fw="bold">{t`Visualize as`}</Text>
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
                    {nonsensibleItems.map(
                      ({ iconName, label, value }, index) => (
                        <Menu.Item
                          key={`${value}/${index}`}
                          onClick={() => handleVisualizationTypeChange(value)}
                          leftSection={
                            iconName ? <Icon name={iconName} /> : null
                          }
                        >
                          {label}
                        </Menu.Item>
                      ),
                    )}
                  </>
                )}
              </Menu.Dropdown>
            </Menu>
          </Group>

          <ActionIcon
            mt="1rem"
            mr="1rem"
            color="text-dark"
            onClick={handleDone}
          >
            <Icon name="close" />
          </ActionIcon>
        </Group>
      </Box>
      <Box style={{ flex: 1, overflow: "auto" }}>
        <QuestionChartSettings
          question={question as any}
          series={series}
          onChange={handleSettingsChange}
          computedSettings={cardWithDraft.visualization_settings || {}}
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

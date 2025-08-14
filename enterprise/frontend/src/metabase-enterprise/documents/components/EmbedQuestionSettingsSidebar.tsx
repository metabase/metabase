import type { Editor } from "@tiptap/react";
import { useCallback } from "react";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
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
import { QuestionChartSettings } from "metabase/visualizations/components/ChartSettings";
import type {
  CardDisplayType,
  VisualizationSettings,
} from "metabase-types/api";

import {
  closeSidebar,
  updateVisualizationType,
  updateVizSettings,
} from "../documents.slice";
import { useCardWithDataset } from "../hooks/useCardWithDataset";
import { useDraftCardOperations } from "../hooks/useDraftCardOperations";
import { getSelectedEmbedIndex } from "../selectors";
import { useVisualizationOptions } from "../utils/visualizationUtils";

import S from "./EmbedQuestionSettingsSidebar.module.css";

interface EmbedQuestionSettingsSidebarProps {
  cardId: number;
  onClose: () => void;
  editorInstance?: Editor;
}

export const EmbedQuestionSettingsSidebar = ({
  cardId,
  editorInstance,
}: EmbedQuestionSettingsSidebarProps) => {
  const dispatch = useDispatch();
  const selectedEmbedIndex = useSelector(getSelectedEmbedIndex);

  // Use extracted hook for card and dataset fetching
  const {
    cardWithDraft,
    dataset,
    isResultsLoading,
    series,
    question,
    isCardLoading,
    draftCard,
    card,
    regularDataset,
  } = useCardWithDataset(cardId);

  // Use extracted hook for visualization options
  const { sensibleItems, nonsensibleItems, selectedElem } =
    useVisualizationOptions(dataset, cardWithDraft?.display as CardDisplayType);

  // Use extracted hook for draft card operations
  const { ensureDraftCard } = useDraftCardOperations(
    draftCard,
    card,
    cardId,
    editorInstance,
    selectedEmbedIndex,
    regularDataset,
  );

  const handleSettingsChange = (settings: VisualizationSettings) => {
    if (selectedEmbedIndex !== null) {
      // If no draft exists, create one with the current settings change
      if (!draftCard) {
        const baseCard = card;
        const newSettings = {
          ...baseCard?.visualization_settings,
          ...settings,
        };
        const actualCardId = ensureDraftCard(
          { visualization_settings: newSettings },
          true,
        );
        // Use the returned ID (might be different if this was a duplicate)
        dispatch(updateVizSettings({ cardId: actualCardId, settings }));
      } else {
        // Draft already exists, just update it
        dispatch(updateVizSettings({ cardId, settings }));
      }
    }
  };

  const handleVisualizationTypeChange = (display: CardDisplayType) => {
    if (selectedEmbedIndex !== null) {
      // If no draft exists, create one with the current display change
      if (!draftCard) {
        const actualCardId = ensureDraftCard({ display }, true);
        // Use the returned ID (might be different if this was a duplicate)
        dispatch(updateVisualizationType({ cardId: actualCardId, display }));
      } else {
        // Draft already exists, just update it
        dispatch(updateVisualizationType({ cardId, display }));
      }
    }
  };

  const handleDone = useCallback(() => {
    // Simply close the sidebar - draft changes are kept in Redux
    dispatch(closeSidebar());
  }, [dispatch]);

  if (isCardLoading || isResultsLoading || !series) {
    return (
      <Stack gap="lg" p="lg" className={S.loadingContainer}>
        <Box className={S.loadingContent}>
          <Loader size="lg" />
          <Text>{t`Loading question settings...`}</Text>
        </Box>
      </Stack>
    );
  }

  if (!cardWithDraft || !series) {
    return (
      <Stack gap="lg" p="lg" className={S.errorContainer}>
        <Box className={S.errorContent}>
          <Text color="error">{t`Failed to load question`}</Text>
        </Box>
      </Stack>
    );
  }

  return (
    <Box className={S.container}>
      <Box className={S.header}>
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
      <Box className={S.settingsContent}>
        <QuestionChartSettings
          question={question}
          series={series}
          onChange={handleSettingsChange}
          computedSettings={cardWithDraft.visualization_settings || {}}
        />
      </Box>
      <Box className={S.footer}>
        <Button fullWidth variant="filled" onClick={handleDone}>
          {t`Done`}
        </Button>
      </Box>
    </Box>
  );
};

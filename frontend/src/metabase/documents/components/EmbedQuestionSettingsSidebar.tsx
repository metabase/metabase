import type { Editor } from "@tiptap/react";
import { useCallback } from "react";
import { t } from "ttag";

import { useUpdateCardMutation } from "metabase/api/card";
import { useCreateDocumentCardMutation } from "metabase/api/document";
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
import { useDispatch, useSelector } from "metabase/utils/redux";
import { QuestionChartSettings } from "metabase/visualizations/components/ChartSettings";
import type {
  CardDisplayType,
  VisualizationSettings,
} from "metabase-types/api";

import { closeSidebar } from "../documents.slice";
import { useCardData } from "../hooks/use-card-data";
import { getCurrentDocument, getSelectedEmbedIndex } from "../selectors";
import {
  stampCardEmbedUpdated,
  updateCardEmbedNodeId,
} from "../utils/editorNodeUtils";
import { useVisualizationOptions } from "../utils/visualizationUtils";

import S from "./EmbedQuestionSettingsSidebar.module.css";

interface EmbedQuestionSettingsSidebarProps {
  cardId: number;
  editorInstance?: Editor;
}

export const EmbedQuestionSettingsSidebar = ({
  cardId,
  editorInstance,
}: EmbedQuestionSettingsSidebarProps) => {
  const dispatch = useDispatch();
  const document = useSelector(getCurrentDocument);
  const selectedEmbedIndex = useSelector(getSelectedEmbedIndex);

  const { card, dataset, isLoading, series, question } = useCardData({
    id: cardId,
  });

  const { sensibleItems, nonsensibleItems, selectedElem } =
    useVisualizationOptions(dataset, card?.display as CardDisplayType);

  const [updateCard] = useUpdateCardMutation();
  const [createDocumentCard] = useCreateDocumentCardMutation();

  const persistCardChange = useCallback(
    async (patch: {
      display?: CardDisplayType;
      visualization_settings?: VisualizationSettings;
    }) => {
      if (!card || !document || selectedEmbedIndex === null) {
        return;
      }
      const isDocOwned = card.document_id === document.id && card.id != null;
      try {
        if (isDocOwned) {
          await updateCard({ id: card.id, ...patch }).unwrap();
          stampCardEmbedUpdated(editorInstance, selectedEmbedIndex);
        } else {
          const created = await createDocumentCard({
            document_id: document.id,
            name: card.name,
            dataset_query: card.dataset_query,
            display: patch.display ?? (card.display as CardDisplayType),
            visualization_settings:
              patch.visualization_settings ?? card.visualization_settings ?? {},
          }).unwrap();
          updateCardEmbedNodeId(editorInstance, selectedEmbedIndex, created.id);
        }
      } catch (error) {
        console.error("Failed to persist card change:", error);
      }
    },
    [
      card,
      document,
      selectedEmbedIndex,
      editorInstance,
      updateCard,
      createDocumentCard,
    ],
  );

  const handleSettingsChange = (settings: VisualizationSettings) => {
    persistCardChange({
      visualization_settings: {
        ...card?.visualization_settings,
        ...settings,
      },
    });
  };

  const handleVisualizationTypeChange = (display: CardDisplayType) => {
    persistCardChange({ display });
  };

  const handleDone = useCallback(() => {
    dispatch(closeSidebar());
  }, [dispatch]);

  if (isLoading || !series) {
    return (
      <Stack gap="lg" p="lg" className={S.loadingContainer}>
        <Box className={S.loadingContent}>
          <Loader size="lg" />
          <Text>{t`Loading question settings...`}</Text>
        </Box>
      </Stack>
    );
  }

  if (!card || !series) {
    return (
      <Stack gap="lg" p="lg" className={S.errorContainer}>
        <Box className={S.errorContent}>
          <Text c="error">{t`Failed to load question`}</Text>
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
                    <Menu.Label>{t`More charts`}</Menu.Label>
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
            color="text-primary"
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
          computedSettings={card.visualization_settings ?? {}}
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

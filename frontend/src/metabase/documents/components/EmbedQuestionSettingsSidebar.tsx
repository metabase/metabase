import type { Editor } from "@tiptap/react";
import { useCallback } from "react";
import { t } from "ttag";

import { EntityIcon } from "metabase/common/components/EntityIcon";
import { useDispatch, useSelector } from "metabase/redux";
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
  Tooltip,
} from "metabase/ui";
import { QuestionChartSettings } from "metabase/visualizations/components/ChartSettings";
import type {
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";

import {
  closeSidebar,
  updateVisualizationType,
  updateVizSettings,
} from "../documents.slice";
import { useCardData } from "../hooks/use-card-data";
import { useDraftCardOperations } from "../hooks/use-draft-card-operations";
import { getCurrentDocument, getSelectedEmbedIndex } from "../selectors";
import type { VisualizationItem } from "../utils/visualizationUtils";
import {
  isVizOptionBlockedForPublicDocument,
  useVisualizationOptions,
} from "../utils/visualizationUtils";

import S from "./EmbedQuestionSettingsSidebar.module.css";

interface EmbedQuestionSettingsSidebarProps {
  cardId: number;
  editorInstance?: Editor;
}

interface VisualizationMenuItemProps {
  item: VisualizationItem;
  isBlocked: boolean;
  onClick: () => void;
}

const VisualizationMenuItem = ({
  item,
  isBlocked,
  onClick,
}: VisualizationMenuItemProps) => {
  const { iconName, iconUrl, label } = item;
  const leftSection =
    iconName || iconUrl ? (
      <EntityIcon name={iconName ?? undefined} iconUrl={iconUrl} />
    ) : null;

  if (isBlocked) {
    return (
      <Tooltip
        label={t`Not available while this document is shared publicly.`}
        maw="20rem"
        multiline
      >
        <Menu.Item
          component="div"
          disabled
          aria-disabled="true"
          leftSection={leftSection}
        >
          {label}
        </Menu.Item>
      </Tooltip>
    );
  }

  return (
    <Menu.Item onClick={onClick} leftSection={leftSection}>
      {label}
    </Menu.Item>
  );
};

export const EmbedQuestionSettingsSidebar = ({
  cardId,
  editorInstance,
}: EmbedQuestionSettingsSidebarProps) => {
  const dispatch = useDispatch();
  const selectedEmbedIndex = useSelector(getSelectedEmbedIndex);
  const document = useSelector(getCurrentDocument);

  const {
    card,
    dataset,
    isLoading,
    series,
    question,
    draftCard,
    regularDataset,
  } = useCardData({ id: cardId });

  const { sensibleItems, nonsensibleItems, selectedElem } =
    useVisualizationOptions(dataset, card?.display);

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
        dispatch(updateVizSettings({ cardId: actualCardId, settings }));
      } else {
        dispatch(updateVizSettings({ cardId, settings }));
      }
    }
  };

  const handleVisualizationTypeChange = (display: VisualizationDisplay) => {
    if (selectedEmbedIndex !== null) {
      if (!draftCard) {
        const actualCardId = ensureDraftCard({ display }, true);
        dispatch(updateVisualizationType({ cardId: actualCardId, display }));
      } else {
        dispatch(updateVisualizationType({ cardId, display }));
      }
    }
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
          <Text c="feedback-negative">{t`Failed to load question`}</Text>
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
                    selectedElem?.iconName || selectedElem?.iconUrl ? (
                      <EntityIcon
                        name={selectedElem.iconName ?? undefined}
                        iconUrl={selectedElem.iconUrl}
                      />
                    ) : null
                  }
                  justify="space-between"
                >
                  {selectedElem?.label}
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                {sensibleItems.map((item, index) => (
                  <VisualizationMenuItem
                    key={`${item.value}/${index}`}
                    item={item}
                    isBlocked={isVizOptionBlockedForPublicDocument(
                      document,
                      item.value,
                    )}
                    onClick={() => handleVisualizationTypeChange(item.value)}
                  />
                ))}

                {nonsensibleItems.length > 0 && (
                  <>
                    <Menu.Label>{t`More charts`}</Menu.Label>
                    {nonsensibleItems.map((item, index) => (
                      <VisualizationMenuItem
                        key={`${item.value}/${index}`}
                        item={item}
                        isBlocked={isVizOptionBlockedForPublicDocument(
                          document,
                          item.value,
                        )}
                        onClick={() =>
                          handleVisualizationTypeChange(item.value)
                        }
                      />
                    ))}
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

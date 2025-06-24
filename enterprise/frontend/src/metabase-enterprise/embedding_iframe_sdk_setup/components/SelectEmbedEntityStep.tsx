import { useDisclosure } from "@mantine/hooks";
import { match } from "ts-pattern";
import { t } from "ttag";

import { DashboardPickerModal } from "metabase/common/components/DashboardPicker";
import { QuestionPickerModal } from "metabase/common/components/QuestionPicker";
import { ActionIcon, Card, Group, Icon, Stack, Text } from "metabase/ui";

import { useSdkIframeEmbedSetupContext } from "../context";
import type {
  SdkIframeEmbedSetupExperience,
  SdkIframeEmbedSetupRecentItem,
} from "../types";

import S from "./SelectEmbedEntityStep.module.css";

export const SelectEmbedEntityStep = () => {
  const {
    experience,
    settings,
    updateSettings,
    recentDashboards,
    recentQuestions,
    addRecentItem,
  } = useSdkIframeEmbedSetupContext();

  const [isPickerOpen, { open: openPicker, close: closePicker }] =
    useDisclosure(false);

  const isDashboard = experience === "dashboard";
  const recentItems = isDashboard ? recentDashboards : recentQuestions;
  const embedIcon = isDashboard ? "dashboard" : "bar";

  const selectedItemId = isDashboard
    ? settings.dashboardId
    : settings.questionId;

  const updateEmbedSettings = (
    experience: SdkIframeEmbedSetupExperience,
    id: string | number,
  ) => {
    if (experience === "dashboard") {
      updateSettings({
        dashboardId: id,

        // Clear parameters
        initialParameters: {},
        hiddenParameters: [],
      });
    } else if (experience === "chart") {
      updateSettings({
        questionId: id,

        // Clear parameters
        initialSqlParameters: {},
      });
    }
  };

  const handlePickerModalEntitySelect = (
    item: SdkIframeEmbedSetupRecentItem,
  ) => {
    // Resource picker modal returns numeric ids.
    const resourceId =
      typeof item.id === "string" ? parseInt(item.id, 10) : item.id;

    closePicker();
    updateEmbedSettings(experience, resourceId);

    // Add the current entity to the top of the recent items list
    const resourceType = experience === "dashboard" ? "dashboard" : "question";
    addRecentItem(resourceType, {
      id: resourceId,
      name: item.name,
      description: item.description,
    });
  };

  const renderPickerModal = () => {
    if (!isPickerOpen) {
      return null;
    }

    if (experience === "dashboard") {
      return (
        <DashboardPickerModal
          title={t`Select a dashboard`}
          value={
            settings.dashboardId
              ? { id: settings.dashboardId, model: "dashboard" }
              : undefined
          }
          onChange={handlePickerModalEntitySelect}
          onClose={closePicker}
          options={{
            showPersonalCollections: true,
            showRootCollection: true,
            hasConfirmButtons: false,
          }}
        />
      );
    }

    if (experience === "chart") {
      return (
        <QuestionPickerModal
          title={t`Select a question`}
          value={
            settings.questionId
              ? { id: settings.questionId, model: "card" }
              : undefined
          }
          onChange={handlePickerModalEntitySelect}
          onClose={closePicker}
          options={{
            showPersonalCollections: true,
            showRootCollection: true,
            hasConfirmButtons: false,
          }}
        />
      );
    }

    return null;
  };

  return (
    <>
      <Card p="md" mb="md">
        <Group justify="space-between" mb="md">
          <Text size="lg" fw="bold">
            {getEmbedTitle(experience)}
          </Text>

          {experience !== "exploration" && (
            <ActionIcon
              variant="outline"
              size="lg"
              title={
                experience === "dashboard"
                  ? t`Browse dashboards`
                  : t`Browse questions`
              }
              onClick={openPicker}
            >
              <Icon name="search" size={16} />
            </ActionIcon>
          )}
        </Group>

        <Text c="text-medium" mb="md">
          {getEmbedDescription(experience)}
        </Text>

        {experience !== "exploration" && (
          <Stack gap="md">
            {recentItems.map((recentItem) => (
              <Card
                p="md"
                key={recentItem.id}
                onClick={() => updateEmbedSettings(experience, recentItem.id)}
                className={S.EntityCard}
                data-selected={selectedItemId === recentItem.id}
              >
                <Group align="start" gap="sm">
                  <Icon name={embedIcon} size={20} c="brand" />

                  <Stack gap="xs" flex={1}>
                    <Text fw="bold">{recentItem.name}</Text>

                    {recentItem.description && (
                      <Text size="sm" c="text-medium">
                        {recentItem.description}
                      </Text>
                    )}
                  </Stack>
                </Group>
              </Card>
            ))}
          </Stack>
        )}
      </Card>

      {renderPickerModal()}
    </>
  );
};

const getEmbedTitle = (experience: string) =>
  match(experience)
    .with("dashboard", () => t`Select a dashboard to embed`)
    .with("chart", () => t`Select a chart to embed`)
    .with("exploration", () => t`Exploration embed setup`)
    .otherwise(() => t`Select content to embed`);

const getEmbedDescription = (experience: string) =>
  match(experience)
    .with("dashboard", () => t`Choose from your recently visited dashboards`)
    .with("chart", () => t`Choose from your recently visited questions`)
    .with("exploration", () => null)
    .otherwise(() => t`Choose your content to embed`);

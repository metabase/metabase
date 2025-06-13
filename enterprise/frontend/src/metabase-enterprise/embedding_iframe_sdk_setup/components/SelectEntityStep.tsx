import { useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { DashboardPickerModal } from "metabase/common/components/DashboardPicker";
import { QuestionPickerModal } from "metabase/common/components/QuestionPicker";
import { ActionIcon, Card, Group, Icon, Text } from "metabase/ui";

import { useSdkIframeEmbedSetupContext } from "./SdkIframeEmbedSetupContext";

export const SelectEntityStep = () => {
  const { options, updateSettings } = useSdkIframeEmbedSetupContext();
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const handleEntitySelect = (item: { id: number | string; model: string }) => {
    const entityId =
      typeof item.id === "string" ? parseInt(item.id, 10) : item.id;

    if (options.selectedType === "dashboard") {
      updateSettings({
        ...options.settings,
        dashboardId: entityId,

        // Clear other entity types
        questionId: undefined,
        template: undefined,
      });
    } else if (options.selectedType === "chart") {
      updateSettings({
        ...options.settings,
        questionId: entityId,

        // Clear other entity types
        dashboardId: undefined,
        template: undefined,
      });
    }

    setIsPickerOpen(false);
  };

  const renderPickerModal = () => {
    if (!isPickerOpen) {
      return null;
    }

    if (options.selectedType === "dashboard") {
      return (
        <DashboardPickerModal
          title={t`Select a dashboard`}
          value={
            options.settings.dashboardId
              ? { id: options.settings.dashboardId, model: "dashboard" }
              : undefined
          }
          onChange={handleEntitySelect}
          onClose={() => setIsPickerOpen(false)}
          options={{
            showPersonalCollections: true,
            showRootCollection: true,
            hasConfirmButtons: false,
          }}
        />
      );
    }

    if (options.selectedType === "chart") {
      return (
        <QuestionPickerModal
          title={t`Select a question`}
          value={
            options.settings.questionId
              ? { id: options.settings.questionId, model: "card" }
              : undefined
          }
          onChange={handleEntitySelect}
          onClose={() => setIsPickerOpen(false)}
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
            {getEmbedTitle(options.selectedType)}
          </Text>
          {options.selectedType !== "exploration" && (
            <ActionIcon
              variant="outline"
              size="lg"
              title={
                options.selectedType === "dashboard"
                  ? t`Browse dashboards`
                  : t`Browse questions`
              }
              onClick={() => setIsPickerOpen(true)}
            >
              <Icon name="search" size={16} />
            </ActionIcon>
          )}
        </Group>

        <Text c="text-medium" mb="md">
          {getEmbedDescription(options.selectedType)}
        </Text>
      </Card>

      {renderPickerModal()}
    </>
  );
};

const getEmbedTitle = (selectedType: string) =>
  match(selectedType)
    .with("dashboard", () => t`Select a dashboard to embed`)
    .with("chart", () => t`Select a chart to embed`)
    .with("exploration", () => t`Exploration embed setup`)
    .otherwise(() => t`Select content to embed`);

const getEmbedDescription = (selectedType: string) =>
  match(selectedType)
    .with("dashboard", () => t`Choose from your recently visited dashboards`)
    .with("chart", () => t`Choose from your recently visited questions`)
    .with("exploration", () => null)
    .otherwise(() => t`Choose your content to embed`);

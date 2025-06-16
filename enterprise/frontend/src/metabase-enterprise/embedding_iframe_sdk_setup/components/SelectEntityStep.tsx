import cx from "classnames";
import { useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { DashboardPickerModal } from "metabase/common/components/DashboardPicker";
import { QuestionPickerModal } from "metabase/common/components/QuestionPicker";
import { colors } from "metabase/lib/colors";
import { ActionIcon, Card, Group, Icon, Stack, Text } from "metabase/ui";

import { useSdkIframeEmbedSetupContext } from "./SdkIframeEmbedSetupContext";
import S from "./SelectEntityStep.module.css";

export const SelectEntityStep = () => {
  const {
    embedType: selectedType,
    settings,
    updateSettings,
    recentDashboards,
    recentQuestions,
    addRecentDashboard,
    addRecentQuestion,
  } = useSdkIframeEmbedSetupContext();
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const updateEntitySettings = (
    type: "dashboard" | "chart",
    entityId: number,
  ) => {
    if (type === "dashboard") {
      updateSettings({
        ...settings,
        dashboardId: entityId,

        // Clear the parameters
        initialParameters: {},
        hiddenParameters: [],

        // Clear other entity types
        questionId: undefined,
        template: undefined,
      });
    } else if (type === "chart") {
      updateSettings({
        ...settings,
        questionId: entityId,

        // Clear the parameters
        initialSqlParameters: {},

        // Clear other entity types
        dashboardId: undefined,
        template: undefined,
      });
    }
  };

  const handleEntitySelect = (item: {
    id: number | string;
    model: string;
    name?: string;
    description?: string | null;
  }) => {
    const entityId =
      typeof item.id === "string" ? parseInt(item.id, 10) : item.id;

    if (selectedType === "dashboard") {
      updateEntitySettings("dashboard", entityId);

      addRecentDashboard({
        id: entityId,
        name: item.name || `Dashboard ${entityId}`,
        description: item.description || null,
      });
    } else if (selectedType === "chart") {
      updateEntitySettings("chart", entityId);

      addRecentQuestion({
        id: entityId,
        name: item.name || `Question ${entityId}`,
        description: item.description,
      });
    }

    setIsPickerOpen(false);
  };

  const renderPickerModal = () => {
    if (!isPickerOpen) {
      return null;
    }

    if (selectedType === "dashboard") {
      return (
        <DashboardPickerModal
          title={t`Select a dashboard`}
          value={
            settings.dashboardId
              ? { id: settings.dashboardId, model: "dashboard" }
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

    if (selectedType === "chart") {
      return (
        <QuestionPickerModal
          title={t`Select a question`}
          value={
            settings.questionId
              ? { id: settings.questionId, model: "card" }
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
            {getEmbedTitle(selectedType)}
          </Text>
          {selectedType !== "exploration" && (
            <ActionIcon
              variant="outline"
              size="lg"
              title={
                selectedType === "dashboard"
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
          {getEmbedDescription(selectedType)}
        </Text>

        {selectedType !== "exploration" && (
          <Stack gap="md">
            {selectedType === "dashboard" &&
              recentDashboards.length > 0 &&
              recentDashboards.map((dashboard) => (
                <Card
                  key={dashboard.id}
                  p="md"
                  className={cx(S.EntityCard, {
                    [S.EntityCardSelected]:
                      settings.dashboardId === dashboard.id,
                  })}
                  onClick={() =>
                    updateEntitySettings("dashboard", dashboard.id)
                  }
                >
                  <Group align="start" gap="sm">
                    <Icon name="dashboard" size={20} color={colors.brand} />
                    <Stack gap="xs" flex={1}>
                      <Text fw="bold">{dashboard.name}</Text>

                      {dashboard.description && (
                        <Text size="sm" c="text-medium">
                          {dashboard.description}
                        </Text>
                      )}
                    </Stack>
                  </Group>
                </Card>
              ))}

            {selectedType === "chart" &&
              recentQuestions.length > 0 &&
              recentQuestions.map((question) => (
                <Card
                  key={question.id}
                  p="md"
                  className={cx(S.EntityCard, {
                    [S.EntityCardSelected]: settings.questionId === question.id,
                  })}
                  onClick={() => updateEntitySettings("chart", question.id)}
                >
                  <Group align="start" gap="sm">
                    <Icon name="bar" size={20} color={colors.brand} />
                    <Stack gap="xs" flex={1}>
                      <Text fw="bold">{question.name}</Text>

                      {question.description && (
                        <Text size="sm" c="text-medium">
                          {question.description}
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

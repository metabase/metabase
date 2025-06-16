import cx from "classnames";
import { useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { DashboardPickerModal } from "metabase/common/components/DashboardPicker";
import { QuestionPickerModal } from "metabase/common/components/QuestionPicker";
import { colors } from "metabase/lib/colors";
import { ActionIcon, Card, Group, Icon, Stack, Text } from "metabase/ui";

import type {
  SdkIframeEmbedSetupRecentItem,
  SdkIframeEmbedSetupType,
} from "../types";

import { useSdkIframeEmbedSetupContext } from "./SdkIframeEmbedSetupContext";
import S from "./SelectEntityStep.module.css";

export const SelectEntityStep = () => {
  const {
    embedType,
    settings,
    updateSettings,
    recentDashboards,
    recentQuestions,
    addRecentItem,
  } = useSdkIframeEmbedSetupContext();

  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const isDashboard = embedType === "dashboard";
  const recentItems = isDashboard ? recentDashboards : recentQuestions;
  const embedIcon = isDashboard ? "dashboard" : "bar";

  const selectedItemId = isDashboard
    ? settings.dashboardId
    : settings.questionId;

  const updateEmbedSettings = (
    type: SdkIframeEmbedSetupType,
    id: string | number,
  ) => {
    if (type === "dashboard") {
      updateSettings({
        ...settings,
        dashboardId: id,

        // Clear parameters
        initialParameters: {},
        hiddenParameters: [],

        // Clear other entity types
        template: undefined,
        questionId: undefined,
      });
    } else if (type === "chart") {
      updateSettings({
        ...settings,
        questionId: id,

        // Clear parameters
        initialSqlParameters: {},

        // Clear other entity types
        template: undefined,
        dashboardId: undefined,
      });
    }
  };

  const handleEntitySelect = (item: SdkIframeEmbedSetupRecentItem) => {
    const entityId =
      typeof item.id === "string" ? parseInt(item.id, 10) : item.id;

    setIsPickerOpen(false);
    updateEmbedSettings(embedType, entityId);

    // add the current entity to the top of the recent items list
    const type = embedType === "dashboard" ? "dashboard" : "question";
    addRecentItem(type, {
      id: entityId,
      name: item.name,
      description: item.description,
    });
  };

  const renderPickerModal = () => {
    if (!isPickerOpen) {
      return null;
    }

    if (embedType === "dashboard") {
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

    if (embedType === "chart") {
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
            {getEmbedTitle(embedType)}
          </Text>

          {embedType !== "exploration" && (
            <ActionIcon
              variant="outline"
              size="lg"
              title={
                embedType === "dashboard"
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
          {getEmbedDescription(embedType)}
        </Text>

        {embedType !== "exploration" && (
          <Stack gap="md">
            {recentItems.map((recentItem) => (
              <Card
                p="md"
                key={recentItem.id}
                onClick={() => updateEmbedSettings(embedType, recentItem.id)}
                className={cx(S.EntityCard, {
                  [S.EntityCardSelected]: selectedItemId === recentItem.id,
                })}
              >
                <Group align="start" gap="sm">
                  <Icon name={embedIcon} size={20} color={colors.brand} />

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

const getEmbedTitle = (embedType: string) =>
  match(embedType)
    .with("dashboard", () => t`Select a dashboard to embed`)
    .with("chart", () => t`Select a chart to embed`)
    .with("exploration", () => t`Exploration embed setup`)
    .otherwise(() => t`Select content to embed`);

const getEmbedDescription = (embedType: string) =>
  match(embedType)
    .with("dashboard", () => t`Choose from your recently visited dashboards`)
    .with("chart", () => t`Choose from your recently visited questions`)
    .with("exploration", () => null)
    .otherwise(() => t`Choose your content to embed`);

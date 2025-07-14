import { useDisclosure } from "@mantine/hooks";
import { match } from "ts-pattern";
import { t } from "ttag";

import { DashboardPickerModal } from "metabase/common/components/Pickers/DashboardPicker";
import { QuestionPickerModal } from "metabase/common/components/Pickers/QuestionPicker";
import { ActionIcon, Card, Group, Icon, Stack, Text } from "metabase/ui";

import { trackEmbedWizardResourceSelected } from "../analytics";
import { useSdkIframeEmbedSetupContext } from "../context";
import type {
  SdkIframeEmbedSetupExperience,
  SdkIframeEmbedSetupRecentItem,
} from "../types";

import { SelectEmbedResourceMissingRecents } from "./SelectEmbedResourceMissingRecents";
import { SelectEmbedResourceRecentItemCard } from "./SelectEmbedResourceRecentItemCard";

export const SelectEmbedResourceStep = () => {
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

  // Only dashboard and charts allow selecting resources.
  if (experience !== "dashboard" && experience !== "chart") {
    return null;
  }

  const isDashboard = experience === "dashboard";
  const recentItems = isDashboard ? recentDashboards : recentQuestions;

  const selectedItemId = isDashboard
    ? settings.dashboardId
    : settings.questionId;

  const updateEmbedSettings = (
    experience: SdkIframeEmbedSetupExperience,
    id: string | number,
  ) => {
    trackEmbedWizardResourceSelected(Number(id), experience);

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

  const handlePickerModalResourceSelect = (
    item: SdkIframeEmbedSetupRecentItem,
  ) => {
    const resourceId = item.id;

    closePicker();
    updateEmbedSettings(experience, resourceId);

    // Add the current resource to the top of the recent items list
    const resourceType = experience === "dashboard" ? "dashboard" : "question";
    addRecentItem(resourceType, {
      id: resourceId,
      name: item.name,
      description: item.description,
    });
  };

  const renderSelectResourceList = () => {
    if (recentItems.length === 0) {
      return (
        <SelectEmbedResourceMissingRecents
          experience={experience}
          openPicker={openPicker}
        />
      );
    }

    return (
      <Stack gap="md">
        <Text c="text-medium" mb="md">
          {getEmbedDescription(experience)}
        </Text>

        {recentItems.map((recentItem) => (
          <SelectEmbedResourceRecentItemCard
            key={recentItem.id}
            recentItem={recentItem}
            experience={experience}
            onSelect={updateEmbedSettings}
            selectedItemId={selectedItemId}
          />
        ))}
      </Stack>
    );
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
            selectedItemId
              ? { id: selectedItemId, model: "dashboard" }
              : undefined
          }
          onChange={handlePickerModalResourceSelect}
          onClose={closePicker}
          options={MODAL_OPTIONS}
        />
      );
    }

    if (experience === "chart") {
      return (
        <QuestionPickerModal
          title={t`Select a chart`}
          value={
            selectedItemId ? { id: selectedItemId, model: "card" } : undefined
          }
          onChange={handlePickerModalResourceSelect}
          onClose={closePicker}
          options={MODAL_OPTIONS}
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

          <ActionIcon
            variant="outline"
            size="lg"
            title={
              experience === "dashboard"
                ? t`Browse dashboards`
                : t`Browse questions`
            }
            onClick={openPicker}
            data-testid="embed-browse-entity-button"
          >
            <Icon name="search" size={16} />
          </ActionIcon>
        </Group>

        {renderSelectResourceList()}
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
    .with("chart", () => t`Choose from your recently visited charts`)
    .with("exploration", () => null)
    .otherwise(() => t`Choose your content to embed`);

const MODAL_OPTIONS = {
  showPersonalCollections: true,
  showRootCollection: true,
  hasConfirmButtons: false,
} as const;

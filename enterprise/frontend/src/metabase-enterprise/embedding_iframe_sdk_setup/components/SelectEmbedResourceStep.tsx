import { useDisclosure } from "@mantine/hooks";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import { CollectionPickerModal } from "metabase/common/components/Pickers/CollectionPicker";
import { DashboardPickerModal } from "metabase/common/components/Pickers/DashboardPicker";
import { QuestionPickerModal } from "metabase/common/components/Pickers/QuestionPicker";
import { ActionIcon, Card, Group, Icon, Stack, Text } from "metabase/ui";
import type { CollectionId } from "metabase-types/api";

import { trackEmbedWizardResourceSelected } from "../analytics";
import { useSdkIframeEmbedSetupContext } from "../context";
import type {
  SdkIframeEmbedSetupExperience,
  SdkIframeEmbedSetupRecentItem,
  SdkIframeEmbedSetupRecentItemType,
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
    recentCollections,
    addRecentItem,
  } = useSdkIframeEmbedSetupContext();

  const [isPickerOpen, { open: openPicker, close: closePicker }] =
    useDisclosure(false);

  // Exploration does not allow selecting resources.
  if (experience === "exploration") {
    return null;
  }

  const recentItems = match(experience)
    .with("dashboard", () => recentDashboards)
    .with("browser", () => recentCollections)
    .with("chart", () => recentQuestions)
    .exhaustive();

  const selectedItemId = match(settings)
    .with({ initialCollection: P.nonNullable }, (s) => s.initialCollection)
    .with({ dashboardId: P.nonNullable }, (s) => s.dashboardId)
    .with({ questionId: P.nonNullable }, (s) => s.questionId)
    .otherwise(() => undefined);

  const updateEmbedSettings = (
    experience: SdkIframeEmbedSetupExperience,
    id: string | number,
  ) => {
    // Do not update if the selected item is already selected.
    if (
      (experience === "dashboard" && settings.dashboardId === id) ||
      (experience === "chart" && settings.questionId === id) ||
      (settings.componentName === "metabase-browser" &&
        settings.initialCollection === id)
    ) {
      return;
    }

    const numericResourceId = typeof id === "string" ? parseInt(id) : id;

    // Only track the resource id if it is a valid numeric id.
    if (!isNaN(numericResourceId)) {
      trackEmbedWizardResourceSelected(numericResourceId, experience);
    }

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
    } else if (experience === "browser") {
      updateSettings({
        initialCollection: id as CollectionId,
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

    const resourceType = match<
      typeof experience,
      SdkIframeEmbedSetupRecentItemType
    >(experience)
      .with("chart", () => "question")
      .with("browser", () => "collection")
      .with("dashboard", () => "dashboard")
      .exhaustive();

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

    if (experience === "browser") {
      return (
        <CollectionPickerModal
          title={t`Select a collection`}
          value={{
            id: selectedItemId ?? "root",
            model: "collection",
            collection_id: null,
          }}
          onChange={handlePickerModalResourceSelect}
          onClose={closePicker}
          options={COLLECTION_MODAL_OPTIONS}
        />
      );
    }

    return null;
  };

  const browseResourceTitle = match(experience)
    .with("dashboard", () => t`Browse dashboards`)
    .with("browser", () => t`Browse collections`)
    .with("chart", () => t`Browse questions`)
    .exhaustive();

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
            title={browseResourceTitle}
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
    .with("browser", () => t`Select a collection to embed`)
    .with("exploration", () => t`Exploration embed setup`)
    .otherwise(() => t`Select content to embed`);

const getEmbedDescription = (experience: string) =>
  match(experience)
    .with("dashboard", () => t`Choose from your recently visited dashboards`)
    .with("chart", () => t`Choose from your recently visited charts`)
    .with("browser", () => t`Choose a collection to start browsing from`)
    .with("exploration", () => null)
    .otherwise(() => t`Choose your content to embed`);

const MODAL_OPTIONS = {
  showPersonalCollections: true,
  showRootCollection: true,
  hasConfirmButtons: false,
} as const;

const COLLECTION_MODAL_OPTIONS = {
  showPersonalCollections: true,
  showRootCollection: true,
  hasConfirmButtons: true,
} as const;

import { useDisclosure } from "@mantine/hooks";
import { match } from "ts-pattern";
import { t } from "ttag";

import { skipToken, useGetCollectionQuery } from "metabase/api";
import {
  CollectionPickerModal,
  DashboardPickerModal,
  QuestionPickerModal,
} from "metabase/common/components/Pickers";
import { Button, Card, Icon, Stack, Text } from "metabase/ui";
import type { CollectionId, IconName } from "metabase-types/api";

import { EXPERIENCES_WITHOUT_RESOURCE_SELECTION } from "../../../constants";
import { useSdkIframeEmbedSetupContext } from "../../../context";
import type {
  SdkIframeEmbedSetupExperience,
  SdkIframeEmbedSetupRecentItem,
  SdkIframeEmbedSetupRecentItemType,
} from "../../../types";
import { getResourceIdFromSettings } from "../../../utils/get-default-sdk-iframe-embed-setting";

// The picker uses the "recents" id to open on the Recent items tab while still
// being able to resolve to a valid initial path.
const PICKER_RECENTS_VALUE = {
  id: "recents" as CollectionId,
  model: "collection" as const,
};

export const ResourceCard = () => {
  const {
    experience,
    settings,
    updateSettings,
    resource,
    recentDashboards,
    recentQuestions,
    recentCollections,
    addRecentItem,
  } = useSdkIframeEmbedSetupContext();

  const [isPickerOpen, { open: openPicker, close: closePicker }] =
    useDisclosure(false);

  const selectedItemId = getResourceIdFromSettings(settings);

  const { data: selectedCollection } = useGetCollectionQuery(
    experience === "browser" && selectedItemId != null
      ? { id: selectedItemId as CollectionId }
      : skipToken,
  );

  if (!hasResourceSelectionStep(experience)) {
    return null;
  }

  const recentItems = match(experience)
    .with("dashboard", () => recentDashboards)
    .with("browser", () => recentCollections)
    .with("chart", () => recentQuestions)
    .exhaustive();

  const selectedResourceName = match(experience)
    .with("dashboard", () => resource?.name)
    .with("chart", () => resource?.name)
    .with("browser", () => selectedCollection?.name)
    .exhaustive();

  const fallbackResourceName = recentItems.find(
    (item) => item.id === selectedItemId,
  )?.name;

  const { title, icon, placeholder, label } = getResourceCopy(experience);

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

    if (experience === "dashboard") {
      updateSettings({
        dashboardId: id,

        // Clear parameters
        initialParameters: {},
        hiddenParameters: [],
        lockedParameters: [],
      });
    } else if (experience === "chart") {
      updateSettings({
        questionId: id,

        // Clear parameters
        initialSqlParameters: {},
        hiddenParameters: [],
        lockedParameters: [],
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

  const renderPickerModal = () => {
    if (!isPickerOpen) {
      return null;
    }

    if (experience === "dashboard") {
      return (
        <DashboardPickerModal
          title={t`Select a dashboard`}
          value={PICKER_RECENTS_VALUE}
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
          value={PICKER_RECENTS_VALUE}
          onChange={handlePickerModalResourceSelect}
          onClose={closePicker}
          options={MODAL_OPTIONS}
        />
      );
    }

    if (experience === "browser") {
      return (
        <CollectionPickerModal
          title={t`Select initial collection`}
          value={PICKER_RECENTS_VALUE}
          onChange={handlePickerModalResourceSelect}
          onClose={closePicker}
          options={COLLECTION_MODAL_OPTIONS}
        />
      );
    }

    return null;
  };

  return (
    <>
      <Card p="md">
        <Stack gap="md">
          <Text size="lg" fw="bold">
            {title}
          </Text>

          <Button
            variant="default"
            leftSection={<Icon name={icon} c="core-brand" size={16} />}
            rightSection={<Icon name="chevrondown" size={12} />}
            onClick={openPicker}
            data-testid="embed-browse-entity-button"
            aria-label={label}
            fullWidth
            styles={{ label: { flex: 1, textAlign: "left" } }}
          >
            <Text fw="bold">
              {selectedResourceName ?? fallbackResourceName ?? placeholder}
            </Text>
          </Button>
        </Stack>
      </Card>

      {renderPickerModal()}
    </>
  );
};

type ResourceExperience = Exclude<
  SdkIframeEmbedSetupExperience,
  (typeof EXPERIENCES_WITHOUT_RESOURCE_SELECTION)[number]
>;

const getResourceCopy = (experience: ResourceExperience) =>
  match<
    ResourceExperience,
    { title: string; icon: IconName; placeholder: string; label: string }
  >(experience)
    .with("dashboard", () => ({
      title: t`Select a dashboard to embed`,
      icon: "dashboard",
      placeholder: t`Select a dashboard`,
      label: t`Change dashboard`,
    }))
    .with("chart", () => ({
      title: t`Select a chart to embed`,
      icon: "bar",
      placeholder: t`Select a chart`,
      label: t`Change chart`,
    }))
    .with("browser", () => ({
      title: t`Select initial collection`,
      icon: "collection",
      placeholder: t`Select initial collection`,
      label: t`Change initial collection`,
    }))
    .exhaustive();

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

const hasResourceSelectionStep = (
  experience: SdkIframeEmbedSetupExperience,
): experience is Exclude<
  SdkIframeEmbedSetupExperience,
  (typeof EXPERIENCES_WITHOUT_RESOURCE_SELECTION)[number]
> =>
  !(
    EXPERIENCES_WITHOUT_RESOURCE_SELECTION as SdkIframeEmbedSetupExperience[]
  ).includes(experience);

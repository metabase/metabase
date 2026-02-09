import { useEffect, useMemo, useState } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";
import _ from "underscore";

import { SdkBreadcrumbs } from "embedding-sdk-bundle/components/private/SdkBreadcrumbs";
import { CollectionBrowser } from "embedding-sdk-bundle/components/public/CollectionBrowser";
import { CreateDashboardModal } from "embedding-sdk-bundle/components/public/CreateDashboardModal";
import { InteractiveQuestion } from "embedding-sdk-bundle/components/public/InteractiveQuestion";
import {
  EditableDashboard,
  InteractiveDashboard,
} from "embedding-sdk-bundle/components/public/dashboard";
import { useCollectionData } from "embedding-sdk-bundle/hooks/private/use-collection-data";
import { useSdkBreadcrumbs } from "embedding-sdk-bundle/hooks/private/use-sdk-breadcrumb";
import type { SdkCollectionId } from "embedding-sdk-bundle/types";
import type { SdkBreadcrumbItemType } from "embedding-sdk-bundle/types/breadcrumb";
import { Box, Button, Group, Stack } from "metabase/ui";

import type { SdkIframeEmbedSettings } from "../types/embed";

interface MetabaseBrowserProps {
  settings: SdkIframeEmbedSettings & {
    componentName: "metabase-browser";
  };
}

type MetabaseBrowserView =
  | { type: "collection"; id: SdkCollectionId }
  | { type: "dashboard"; id: number | string }
  | { type: "question" | "metric" | "model"; id: number | string }
  | { type: "exploration" }
  | { type: "create-dashboard" };

const BREADCRUMB_HEIGHT = "3.5rem";

export function MetabaseBrowser({ settings }: MetabaseBrowserProps) {
  const { initialCollection } = settings;

  const isReadOnly = settings.readOnly ?? true;

  const { breadcrumbs, currentLocation, reportLocation } = useSdkBreadcrumbs();

  const { canWrite: canWriteToInitialCollection } =
    useCollectionData(initialCollection);

  const [currentView, setCurrentView] = useState<MetabaseBrowserView>({
    type: "collection",
    id: initialCollection,
  });

  // Use the last collection in the breadcrumb as the target for saving new questions.
  const targetCollection = useMemo(() => {
    const collectionBreadcrumbs = breadcrumbs.filter(
      (item) => item.type === "collection",
    );

    const lastCollectionItem = _.last(collectionBreadcrumbs);

    return lastCollectionItem?.id ?? initialCollection;
  }, [breadcrumbs, initialCollection]);

  // If a user clicks on a collection breadcrumb, switch the view.
  useEffect(() => {
    if (currentLocation?.type === "collection") {
      setCurrentView({ type: currentLocation.type, id: currentLocation.id });
    }
  }, [currentLocation]);

  const viewContent = match(currentView)
    .with({ type: "exploration" }, () => (
      <Box px="xl" h="100%">
        <InteractiveQuestion
          questionId="new"
          height="100%"
          withDownloads
          isSaveEnabled={!isReadOnly}
          entityTypes={settings.dataPickerEntityTypes}
          targetCollection={targetCollection}
        />
      </Box>
    ))
    .with({ type: "create-dashboard" }, () => (
      <CreateDashboardModal
        onCreate={(dashboard) => {
          // Update the breadcrumbs to reflect the collection where the dashboard was saved
          if (dashboard.collection) {
            reportLocation({
              type: "collection",
              id: dashboard.collection.id,
              name: dashboard.collection.name,
            });
          }

          // On the next tick, update the current view.
          // This is needed for when we create new collections.
          setTimeout(() => {
            setCurrentView({ type: "dashboard", id: dashboard.id });
          }, 0);
        }}
        onClose={() =>
          setCurrentView({ type: "collection", id: targetCollection })
        }
        initialCollectionId={targetCollection}
      />
    ))
    .with({ type: "dashboard", id: P.nonNullable }, ({ id }) => {
      const dashboardView = isReadOnly ? (
        <InteractiveDashboard
          dashboardId={id}
          withDownloads
          style={{ height: "100%" }}
          drillThroughQuestionProps={{ isSaveEnabled: false }}
          enableEntityNavigation={settings.enableEntityNavigation}
        />
      ) : (
        <EditableDashboard
          withCardTitle
          dashboardId={id}
          style={{ height: "100%" }}
          enableEntityNavigation={settings.enableEntityNavigation}
        />
      );

      // The overflow-scroll is needed otherwise the editable
      // dashboard header gets scrolled out of view.
      return (
        <Group h="100%" style={{ overflowY: "scroll" }}>
          {dashboardView}
        </Group>
      );
    })
    .with(
      { type: P.union("question", "metric", "model"), id: P.nonNullable },
      ({ id }) => (
        <Box px="xl" h="100%">
          <InteractiveQuestion
            questionId={id}
            height="100%"
            withDownloads
            isSaveEnabled={!isReadOnly}
            targetCollection={targetCollection}
          />
        </Box>
      ),
    )
    .with({ type: "collection" }, (view) => (
      <Box px="xl" pt="lg" style={{ overflowY: "auto" }}>
        <CollectionBrowser
          collectionId={view.id}
          visibleColumns={settings.collectionVisibleColumns}
          visibleEntityTypes={settings.collectionEntityTypes}
          pageSize={settings.collectionPageSize}
          onClick={(item) => {
            const type = match<string, SdkBreadcrumbItemType>(item.model)
              .with("card", () => "question")
              .with("dataset", () => "model")
              .otherwise((model) => model as SdkBreadcrumbItemType);

            setCurrentView({ type, id: item.id });
          }}
        />
      </Box>
    ))
    .otherwise(() => null);

  const handleNewExploration = () => {
    setCurrentView({ type: "exploration" });
  };

  // Only show "New exploration" button if user has write access and it's enabled
  const showNewExplorationButton =
    (settings.withNewQuestion ?? true) && canWriteToInitialCollection;

  // Only show "New dashboard" button if not read-only and user has write access
  const showNewDashboardButton =
    !isReadOnly &&
    (settings.withNewDashboard ?? true) &&
    canWriteToInitialCollection;

  return (
    <Stack pos="relative" h="100%">
      <Box pos="absolute" top={0} left={0} w="100%">
        {/* Fixes the height to avoid layout shift when hiding buttons */}
        <Group
          justify="space-between"
          align="flex-start"
          gap="sm"
          h={BREADCRUMB_HEIGHT}
          px="xl"
          py="lg"
          w="100%"
        >
          <Group>
            <SdkBreadcrumbs />
          </Group>

          {currentView.type === "collection" && (
            <Group gap="sm">
              {showNewExplorationButton && (
                <Button justify="center" onClick={handleNewExploration}>
                  {t`New exploration`}
                </Button>
              )}

              {showNewDashboardButton && (
                <Button
                  justify="center"
                  onClick={() => setCurrentView({ type: "create-dashboard" })}
                >
                  {t`New dashboard`}
                </Button>
              )}
            </Group>
          )}
        </Group>
      </Box>

      <Stack mt={BREADCRUMB_HEIGHT} h="100%" style={{ overflowY: "hidden" }}>
        {viewContent}
      </Stack>
    </Stack>
  );
}

import { useEffect, useMemo, useState } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";
import _ from "underscore";

import { SdkBreadcrumbs } from "embedding-sdk/components/private/SdkBreadcrumbs";
import {
  CollectionBrowser,
  CreateDashboardModal,
  EditableDashboard,
  InteractiveDashboard,
  InteractiveQuestion,
} from "embedding-sdk/components/public";
import { useSdkBreadcrumbs } from "embedding-sdk/hooks/private/use-sdk-breadcrumb";
import type { SdkCollectionId } from "embedding-sdk/types";
import type { SdkBreadcrumbItemType } from "embedding-sdk/types/breadcrumb";
import { Button, Group, Stack } from "metabase/ui";

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

export function MetabaseBrowser({ settings }: MetabaseBrowserProps) {
  const { initialCollection } = settings;

  const isReadOnly = settings.readOnly ?? true;

  const { breadcrumbs, currentLocation, reportLocation } = useSdkBreadcrumbs();

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
      <InteractiveQuestion
        questionId="new"
        height="100%"
        withDownloads
        isSaveEnabled={!isReadOnly}
        entityTypes={settings.dataPickerEntityTypes}
        targetCollection={targetCollection}
      />
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

          setCurrentView({ type: "dashboard", id: dashboard.id });
        }}
        onClose={() =>
          setCurrentView({ type: "collection", id: targetCollection })
        }
        initialCollectionId={targetCollection}
      />
    ))
    .with({ type: "dashboard", id: P.nonNullable }, ({ id }) => {
      return isReadOnly ? (
        <InteractiveDashboard
          dashboardId={id}
          withDownloads
          style={{ height: "100%" }}
          drillThroughQuestionProps={{ isSaveEnabled: false }}
        />
      ) : (
        <EditableDashboard
          withCardTitle
          dashboardId={id}
          style={{ height: "100%" }}
        />
      );
    })
    .with(
      { type: P.union("question", "metric", "model"), id: P.nonNullable },
      ({ id }) => (
        <InteractiveQuestion
          questionId={id}
          height="100%"
          withDownloads
          isSaveEnabled={!isReadOnly}
          targetCollection={targetCollection}
        />
      ),
    )
    .with({ type: "collection" }, (view) => (
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
        style={{ overflowY: "scroll" }}
      />
    ))
    .otherwise(() => null);

  const handleNewExploration = () => {
    setCurrentView({ type: "exploration" });
    reportLocation({ type: "question", id: "new", name: "New Exploration" });
  };

  return (
    <Stack px="xl" py="lg" h="100%" style={{ overflowY: "hidden" }}>
      {/* Fixes the height to avoid layout shift when hiding buttons */}
      <Group justify="space-between" align="center" gap="sm">
        <Group h="2.5rem">
          <SdkBreadcrumbs />
        </Group>

        {currentView.type === "collection" && (
          <Group gap="sm">
            {(settings.withNewQuestion ?? true) && (
              <Button justify="center" onClick={handleNewExploration}>
                {t`New Exploration`}
              </Button>
            )}

            {!isReadOnly && (settings.withNewDashboard ?? true) && (
              <Button
                justify="center"
                onClick={() => setCurrentView({ type: "create-dashboard" })}
              >
                {t`New Dashboard`}
              </Button>
            )}
          </Group>
        )}
      </Group>

      {viewContent}
    </Stack>
  );
}

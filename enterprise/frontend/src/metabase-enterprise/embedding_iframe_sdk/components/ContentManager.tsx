import { useEffect, useMemo, useState } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";

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

interface ViewContentProps {
  settings: SdkIframeEmbedSettings & {
    componentName: "metabase-view-content" | "metabase-curate-content";
  };
}

type ContentManagerView =
  | { type: "collection"; id: SdkCollectionId }
  | { type: "dashboard"; id: number | string }
  | { type: "question" | "metric" | "model"; id: number | string }
  | { type: "exploration" }
  | { type: "create-dashboard" };

export function ContentManager({ settings }: ViewContentProps) {
  const { componentName, initialCollection } = settings;

  const isReadOnly = componentName === "metabase-view-content";

  const { breadcrumbs, currentLocation } = useSdkBreadcrumbs();

  const [currentView, setCurrentView] = useState<ContentManagerView>({
    type: "collection",
    id: initialCollection,
  });

  // Use the last collection in the breadcrumb as the target for saving new questions.
  const targetCollection = useMemo(() => {
    return (
      breadcrumbs.findLast((item) => item.type === "collection")?.id ??
      initialCollection
    );
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
        onCreate={(dashboard) =>
          setCurrentView({ type: "dashboard", id: dashboard.id })
        }
        onClose={() =>
          setCurrentView({ type: "collection", id: targetCollection })
        }
        initialCollectionId={targetCollection}
      />
    ))
    .with({ type: "dashboard", id: P.nonNullable }, ({ id }) => {
      return isReadOnly ? (
        <InteractiveDashboard dashboardId={id} withDownloads />
      ) : (
        <EditableDashboard withCardTitle dashboardId={id} />
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
      />
    ))
    .otherwise(() => null);

  return (
    <Stack px="lg" py="xl" maw="60rem" mx="auto" h="100%">
      {/* Fixes the height to avoid layout shift when hiding buttons */}
      <Group justify="space-between" align="center" gap="sm" h="2.5rem">
        <Group>
          <SdkBreadcrumbs />
        </Group>

        {currentView.type === "collection" && (
          <Group>
            {(settings.withNewQuestion ?? true) && (
              <Button
                justify="center"
                onClick={() => setCurrentView({ type: "exploration" })}
              >
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

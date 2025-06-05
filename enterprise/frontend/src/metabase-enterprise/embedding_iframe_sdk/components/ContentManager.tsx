import { useEffect, useMemo, useState } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import {
  CollectionBrowser,
  CreateDashboardModal,
  EditableDashboard,
  InteractiveDashboard,
  InteractiveQuestion,
  type SdkCollectionId,
} from "embedding-sdk";
import { SdkBreadcrumbs } from "embedding-sdk/components/private/SdkBreadcrumbs";
import { useSdkBreadcrumbs } from "embedding-sdk/hooks/private/use-sdk-breadcrumb";
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

  // Use the last collection in the breadcrumb as the target for new questions.
  const targetCollection = useMemo(() => {
    const fallback = { type: "collection", id: initialCollection };

    return (
      breadcrumbs.findLast((item) => item.type === "collection") ?? fallback
    );
  }, [breadcrumbs, initialCollection]);

  // If a user clicks on a collection breadcrumb, switch the view.
  useEffect(() => {
    if (currentLocation?.type === "collection") {
      setCurrentView({ type: currentLocation.type, id: currentLocation.id });
    }
  }, [currentLocation]);

  return match(currentView)
    .with({ type: "exploration" }, () => (
      <Stack h="100%">
        <SdkBreadcrumbs />

        <InteractiveQuestion
          questionId="new"
          height="100%"
          withDownloads
          isSaveEnabled={!isReadOnly}
          entityTypes={settings.dataPickerEntityTypes}
          targetCollection={targetCollection.id}
        />
      </Stack>
    ))
    .with({ type: "create-dashboard" }, () => (
      <Stack h="100%">
        <CreateDashboardModal
          onCreate={(dashboard) =>
            setCurrentView({ type: "dashboard", id: dashboard.id })
          }
          onClose={() =>
            setCurrentView({ type: "collection", id: targetCollection.id })
          }
          initialCollectionId={targetCollection.id}
        />
      </Stack>
    ))
    .with({ type: "dashboard", id: P.nonNullable }, ({ id }) => (
      <Stack h="100%">
        <SdkBreadcrumbs />

        {isReadOnly ? (
          <InteractiveDashboard dashboardId={id} withDownloads />
        ) : (
          <EditableDashboard withCardTitle dashboardId={id} />
        )}
      </Stack>
    ))
    .with(
      { type: P.union("question", "metric", "model"), id: P.nonNullable },
      ({ id }) => (
        <Stack h="100%">
          <SdkBreadcrumbs />

          <InteractiveQuestion
            questionId={id}
            height="100%"
            withDownloads
            isSaveEnabled={!isReadOnly}
            targetCollection={targetCollection.id}
          />
        </Stack>
      ),
    )
    .with({ type: "collection" }, (view) => (
      <Stack px="lg" py="xl" maw="60rem" mx="auto">
        <Group justify="space-between" align="center" gap="sm">
          <SdkBreadcrumbs />

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
        </Group>

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
      </Stack>
    ));
}

import { useState } from "react";
import { P, match } from "ts-pattern";
import { c, t } from "ttag";

import {
  CollectionBrowser,
  CreateDashboardModal,
  EditableDashboard,
  InteractiveDashboard,
  InteractiveQuestion,
  type SdkCollectionId,
} from "embedding-sdk";
import { Anchor, Button, Group, Stack, Text } from "metabase/ui";

import type { SdkIframeEmbedSettings } from "../types/embed";

interface ViewContentProps {
  settings: SdkIframeEmbedSettings & {
    template: "view-content" | "curate-content";
  };
}

type ContentManagerView =
  | { type: "dashboard"; id: number | string }
  | { type: "question"; id: number | string }
  | { type: "exploration" }
  | { type: "create-dashboard" }
  | { type: "collection-browser" };

export function ContentManager({ settings }: ViewContentProps) {
  const isReadOnly = settings.template === "view-content";

  const [currentView, setCurrentView] = useState<ContentManagerView>({
    type: "collection-browser",
  });

  // Track the collection that the user is currently viewing.
  // Used for specifying the target collection for new questions.
  const [currentCollection, setCurrentCollection] = useState<{
    id: SdkCollectionId;
    name?: string;
  }>({ id: settings.initialCollection });

  const GoBackToView = ({ view }: { view: ContentManagerView }) => {
    const backToMessage = match(view.type)
      .with("collection-browser", () => currentCollection.name ?? t`Collection`)
      .with("dashboard", () => t`Dashboard`)
      .otherwise(() => null);

    if (backToMessage === null) {
      return null;
    }

    return (
      <Text ff="var(--mb-default-font-family)" fw="600">
        {c("{0} is the link to return to the last visited resource")
          .jt`Return to ${(<Anchor onClick={() => setCurrentView(view)}>{backToMessage}</Anchor>)}`}
      </Text>
    );
  };

  const NavBar = () => (
    <Stack pt="md" px="lg">
      <GoBackToView view={{ type: "collection-browser" }} />
    </Stack>
  );

  return match(currentView)
    .with({ type: "exploration" }, () => (
      <Stack h="100%">
        <NavBar />

        <InteractiveQuestion
          questionId="new"
          height="100%"
          withDownloads
          isSaveEnabled={!isReadOnly}
          entityTypes={settings.dataPickerEntityTypes}
          targetCollection={currentCollection.id}
        />
      </Stack>
    ))
    .with({ type: "create-dashboard" }, () => (
      <Stack h="100%">
        <CreateDashboardModal
          onCreate={(dashboard) =>
            setCurrentView({ type: "dashboard", id: dashboard.id })
          }
          onClose={() => setCurrentView({ type: "collection-browser" })}
          initialCollectionId={currentCollection.id}
        />
      </Stack>
    ))
    .with({ type: "dashboard", id: P.nonNullable }, ({ id }) => (
      <Stack h="100%">
        <NavBar />

        {isReadOnly ? (
          <InteractiveDashboard dashboardId={id} withDownloads />
        ) : (
          <EditableDashboard withCardTitle dashboardId={id} />
        )}
      </Stack>
    ))
    .with({ type: "question", id: P.nonNullable }, ({ id }) => (
      <Stack h="100%">
        <NavBar />

        <InteractiveQuestion
          questionId={id}
          height="100%"
          withDownloads
          isSaveEnabled={!isReadOnly}
          targetCollection={currentCollection.id}
        />
      </Stack>
    ))
    .otherwise(() => (
      <Stack px="lg" py="xl" maw="60rem" mx="auto">
        <Group justify="flex-end" align="center" gap="sm">
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

        <CollectionBrowser
          collectionId={settings.initialCollection}
          visibleColumns={settings.collectionVisibleColumns}
          visibleEntityTypes={settings.collectionEntityTypes}
          pageSize={settings.collectionPageSize}
          onClick={(item) =>
            match(item)
              .with({ model: "dashboard" }, ({ id }) =>
                setCurrentView({ type: "dashboard", id }),
              )
              .with({ model: "card" }, ({ id }) =>
                setCurrentView({ type: "question", id }),
              )
              .with({ model: "dataset" }, ({ id }) => {
                setCurrentView({ type: "question", id });
              })
              .with({ model: "collection" }, (item) =>
                setCurrentCollection({ id: item.id, name: item.name }),
              )
              .otherwise(() => {})
          }
          style={{ height: "100%" }}
        />
      </Stack>
    ));
}

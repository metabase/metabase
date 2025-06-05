import { useState } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import {
  CollectionBrowser,
  CreateDashboardModal,
  EditableDashboard,
  InteractiveDashboard,
  InteractiveQuestion,
} from "embedding-sdk";
import { ActionIcon, Button, Group, Icon, Stack } from "metabase/ui";

import type { SdkIframeEmbedSettings } from "../types/embed";

interface ViewContentProps {
  settings: SdkIframeEmbedSettings & {
    template: "view-content" | "curate-content";
  };
}

type CurrentView =
  | { type: "dashboard"; id: number | string }
  | { type: "question"; id: number | string }
  | { type: "exploration" }
  | { type: "create-dashboard" }
  | { type: "edit-dashboard"; id: number | string }
  | null;

export function ContentManager({ settings }: ViewContentProps) {
  const isReadOnly = settings.template === "view-content";

  const [currentView, setCurrentView] = useState<CurrentView>(null);

  const GoBack = ({ view = null }: { view?: CurrentView }) => (
    <ActionIcon
      variant="outline"
      radius="xl"
      size="2.625rem"
      color="border"
      onClick={() => setCurrentView(view)}
    >
      <Icon c="brand" name="arrow_left" />
    </ActionIcon>
  );

  const NavBar = () => (
    <Stack pt="md" px="lg">
      <GoBack />
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
        />
      </Stack>
    ))
    .with({ type: "create-dashboard" }, () => (
      <Stack h="100%">
        <CreateDashboardModal
          onCreate={(dashboard) =>
            setCurrentView({ type: "edit-dashboard", id: dashboard.id })
          }
          onClose={() => setCurrentView(null)}
        />
      </Stack>
    ))
    .with({ type: "edit-dashboard" }, ({ id }) => (
      <Stack h="100%">
        <Group pt="md" px="lg" justify="space-between">
          <GoBack view={{ type: "dashboard", id }} />

          {/* <Button
            onClick={() => setCurrentView({ type: "edit-dashboard", id })}
            disabled
          >
            {t`Edit`}
          </Button> */}
        </Group>

        <EditableDashboard withCardTitle dashboardId={id} />
      </Stack>
    ))
    .with({ type: "dashboard", id: P.nonNullable }, ({ id }) => (
      <Stack h="100%">
        <Group pt="md" px="lg" justify="space-between">
          <GoBack />

          {!isReadOnly && (
            <Button
              onClick={() => setCurrentView({ type: "edit-dashboard", id })}
            >
              {t`Edit`}
            </Button>
          )}
        </Group>

        <InteractiveDashboard dashboardId={id} withDownloads />
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
        />
      </Stack>
    ))
    .otherwise(() => (
      <Stack px="lg" py="xl" maw="60rem" mx="auto">
        <Group justify="flex-end" align="center" gap="sm">
          <Button
            justify="center"
            onClick={() => setCurrentView({ type: "exploration" })}
          >
            {t`New Exploration`}
          </Button>

          {!isReadOnly && (
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
          visibleEntityTypes={
            settings.entityTypes ?? ["dashboard", "question", "collection"]
          }
          onClick={(item) =>
            match(item)
              .with({ model: "dashboard" }, ({ id }) =>
                setCurrentView({ type: "dashboard", id }),
              )
              .with({ model: "card" }, ({ id }) =>
                setCurrentView({ type: "question", id }),
              )
              .otherwise(() => {})
          }
          style={{ height: "100%" }}
        />
      </Stack>
    ));
}

import { useState } from "react";
import { P, match } from "ts-pattern";

import { CollectionBrowser } from "embedding-sdk/components/public/CollectionBrowser";
import { InteractiveDashboard } from "embedding-sdk/components/public/InteractiveDashboard";
import { InteractiveQuestion } from "embedding-sdk/components/public/InteractiveQuestion";
import { ActionIcon, Icon, Stack } from "metabase/ui";

import type { SdkIframeEmbedSettings } from "../types/embed";

interface ViewContentProps {
  settings: SdkIframeEmbedSettings & { template: "view-content" };
}

export function ViewContent({ settings }: ViewContentProps) {
  const [selectedEntity, setSelectedEntity] = useState<
    | { type: "dashboard"; id: number | string }
    | { type: "question"; id: number | string }
    | null
  >(null);

  const getNavBar = () => (
    <Stack pt="md" px="lg" onClick={() => setSelectedEntity(null)}>
      <ActionIcon variant="outline" radius="xl" size="2.625rem" color="border">
        <Icon c="brand" name="arrow_left" />
      </ActionIcon>
    </Stack>
  );

  return match(selectedEntity)
    .with({ type: "dashboard", id: P.nonNullable }, ({ id }) => (
      <Stack h="100%">
        {getNavBar()}

        <InteractiveDashboard dashboardId={id} withDownloads />
      </Stack>
    ))
    .with({ type: "question", id: P.nonNullable }, ({ id }) => (
      <Stack h="100%">
        {getNavBar()}

        <InteractiveQuestion questionId={id} height="100%" withDownloads />
      </Stack>
    ))
    .otherwise(() => (
      <Stack p="lg" maw="60rem" mx="auto">
        <CollectionBrowser
          collectionId={settings.initialCollection}
          visibleEntityTypes={
            settings.entityTypes ?? ["dashboard", "question", "collection"]
          }
          onClick={(item) =>
            match(item)
              .with({ model: "dashboard" }, ({ id }) =>
                setSelectedEntity({ type: "dashboard", id }),
              )
              .with({ model: "card" }, ({ id }) =>
                setSelectedEntity({ type: "question", id }),
              )
              .otherwise(() => {})
          }
          style={{ height: "100%" }}
        />
      </Stack>
    ));
}

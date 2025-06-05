import { useState } from "react";

import { CollectionBrowser } from "embedding-sdk/components/public/CollectionBrowser";
import { InteractiveDashboard } from "embedding-sdk/components/public/InteractiveDashboard";
import { InteractiveQuestion } from "embedding-sdk/components/public/InteractiveQuestion";

import type { SdkIframeEmbedSettings } from "../types/embed";

interface ViewContentProps {
  settings: SdkIframeEmbedSettings & { template: "view-content" };
}

export function ViewContent({ settings }: ViewContentProps) {
  const [selected, setSelected] = useState<
    | { type: "dashboard"; id: number | string }
    | { type: "question"; id: number | string }
    | null
  >(null);

  if (selected) {
    if (selected.type === "dashboard") {
      return <InteractiveDashboard dashboardId={selected.id} withDownloads />;
    }
    if (selected.type === "question") {
      return (
        <InteractiveQuestion
          questionId={selected.id}
          height="100%"
          withDownloads
        />
      );
    }
  }

  return (
    <CollectionBrowser
      collectionId={settings.initialCollection}
      visibleEntityTypes={settings.entityTypes ?? ["dashboard", "question"]}
      onClick={(item) => {
        if (item.model === "dashboard") {
          setSelected({ type: "dashboard", id: item.id });
        } else if (item.model === "card") {
          setSelected({ type: "question", id: item.id });
        }
      }}
      style={{ height: "100%" }}
    />
  );
}

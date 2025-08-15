import { useEffect, useState } from "react";
import { P, match } from "ts-pattern";

import { InteractiveDashboard } from "embedding-sdk/components/public";
import { useSdkBreadcrumbs } from "embedding-sdk/hooks/private/use-sdk-breadcrumb";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import type { SdkCollectionId } from "embedding-sdk/types";
import type { SdkBreadcrumbItemType } from "embedding-sdk/types/breadcrumb";
import { Stack } from "metabase/ui";

import { CollectionBrowser } from "../../public/CollectionBrowser";
import { InteractiveQuestion } from "../../public/InteractiveQuestion";

import { SdkBreadcrumbs } from "./SdkBreadcrumbs";
import { SdkBreadcrumbsProvider } from "./SdkBreadcrumbsProvider";

export default {
  title: "EmbeddingSDK/SdkBreadcrumb",
  component: SdkBreadcrumbs,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
};

type View =
  | { type: "collection"; id: SdkCollectionId }
  | { type: Exclude<SdkBreadcrumbItemType, "collection">; id: string | number };

const SdkBreadcrumbStory = () => {
  const { currentLocation } = useSdkBreadcrumbs();

  const [view, setView] = useState<View>({ type: "collection", id: "root" });

  // If a user clicks on a collection breadcrumb, switch the view.
  useEffect(() => {
    if (currentLocation?.type === "collection") {
      setView({ type: currentLocation.type, id: currentLocation.id });
    }
  }, [currentLocation]);

  const viewContent = match(view)
    .with({ type: "collection" }, () => (
      <CollectionBrowser
        collectionId={view.id}
        onClick={(item) => {
          const type = match<string, SdkBreadcrumbItemType>(item.model)
            .with("card", () => "question")
            .with("dataset", () => "model")
            .otherwise((model) => model as SdkBreadcrumbItemType);

          setView({ type, id: item.id });
        }}
      />
    ))
    .with({ type: "dashboard" }, () => (
      <InteractiveDashboard dashboardId={view.id} />
    ))
    .with({ type: P.union("question", "metric", "model") }, () => (
      <InteractiveQuestion questionId={view.id} />
    ))
    .exhaustive();

  return (
    <Stack p="md" gap="sm">
      <SdkBreadcrumbs />

      {viewContent}
    </Stack>
  );
};

export const Default = {
  render() {
    return (
      <SdkBreadcrumbsProvider>
        <SdkBreadcrumbStory />
      </SdkBreadcrumbsProvider>
    );
  },
};

import { useEffect, useState } from "react";
import { P, match } from "ts-pattern";

import { InteractiveDashboard } from "embedding-sdk-bundle/components/public/dashboard/InteractiveDashboard";
import { useSdkBreadcrumbs } from "embedding-sdk-bundle/hooks/private/use-sdk-breadcrumb";
import { CommonSdkStoryWrapper } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";
import type { SdkCollectionId } from "embedding-sdk-bundle/types";
import type { SdkBreadcrumbItemType } from "embedding-sdk-bundle/types/breadcrumb";
import { Stack } from "metabase/ui";

import { CollectionBrowser } from "../../public/CollectionBrowser";
import { InteractiveQuestion } from "../../public/InteractiveQuestion";

import { SdkBreadcrumbs } from "./SdkBreadcrumbs";
import { SdkBreadcrumbsProvider } from "./SdkBreadcrumbsProvider";

export default {
  title: "EmbeddingSDK/SdkBreadcrumbs",
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
    <Stack p="md">
      <Stack mb="xs">
        <SdkBreadcrumbs />
      </Stack>

      <Stack>{viewContent}</Stack>
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

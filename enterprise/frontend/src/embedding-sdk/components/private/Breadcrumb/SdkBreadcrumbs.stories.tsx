import { useEffect, useState } from "react";
import { match } from "ts-pattern";

import { InteractiveDashboard } from "embedding-sdk/components/public";
import { useSdkBreadcrumb } from "embedding-sdk/hooks/private/use-sdk-breadcrumb";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { questionIdArgType } from "embedding-sdk/test/storybook-id-args";
import type { SdkCollectionId } from "embedding-sdk/types";
import { Stack } from "metabase/ui";

import { CollectionBrowser } from "../../public/CollectionBrowser";
import { InteractiveQuestion } from "../../public/InteractiveQuestion";

import { SdkBreadcrumbs } from "./SdkBreadcrumbs";
import type { BreadcrumbItemType } from "./SdkBreadcrumbsProvider";

import { SdkBreadcrumbProvider } from "./index";

export default {
  title: "EmbeddingSDK/SdkBreadcrumb",
  component: SdkBreadcrumbs,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
  argTypes: {
    questionId: questionIdArgType,
  },
};

type View =
  | { type: "collection"; id: SdkCollectionId }
  | { type: Exclude<BreadcrumbItemType, "collection">; id: string | number };

const StoryContent = () => {
  const { currentLocation } = useSdkBreadcrumb();
  const [view, setView] = useState<View>({ type: "collection", id: "root" });

  useEffect(() => {
    if (currentLocation) {
      setView({ type: currentLocation.type, id: currentLocation.id });
    }
  }, [currentLocation]);

  return (
    <Stack p="md" gap="sm">
      <SdkBreadcrumbs />

      {view.type === "collection" && (
        <CollectionBrowser
          collectionId={view.id}
          onClick={(item) => {
            const type = match<string, BreadcrumbItemType>(item.model)
              .with("card", () => "question")
              .with("dataset", () => "model")
              .otherwise((model) => model as BreadcrumbItemType);

            const newView = { type, id: item.id };
            setView(newView);
          }}
        />
      )}

      {(view.type === "question" ||
        view.type === "metric" ||
        view.type === "model") && <InteractiveQuestion questionId={view.id} />}

      {view.type === "dashboard" && (
        <InteractiveDashboard dashboardId={view.id} />
      )}
    </Stack>
  );
};

export const Default = {
  render() {
    return (
      <SdkBreadcrumbProvider>
        <StoryContent />
      </SdkBreadcrumbProvider>
    );
  },

  args: {},
};

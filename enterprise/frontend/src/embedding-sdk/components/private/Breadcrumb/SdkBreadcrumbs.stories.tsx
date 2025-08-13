import { useState } from "react";
import { match } from "ts-pattern";

import { InteractiveDashboard } from "embedding-sdk/components/public";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { questionIdArgType } from "embedding-sdk/test/storybook-id-args";
import type { SdkCollectionId } from "embedding-sdk/types";
import { Stack } from "metabase/ui";

import { CollectionBrowser } from "../../public/CollectionBrowser";
import { InteractiveQuestion } from "../../public/InteractiveQuestion";

import { SdkBreadcrumbs } from "./SdkBreadcrumbs";
import {
  type BreadcrumbItem,
  type BreadcrumbItemType,
  SdkBreadcrumbsProvider,
} from "./SdkBreadcrumbsProvider";

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

export const Default = {
  render() {
    const [view, setView] = useState<View>({ type: "collection", id: "root" });

    const onBreadcrumbClick = ({ id, type }: BreadcrumbItem) =>
      setView({ id, type });

    return (
      <SdkBreadcrumbsProvider>
        <Stack p="md" gap="sm">
          <SdkBreadcrumbs onBreadcrumbClick={onBreadcrumbClick} />

          {view.type === "collection" && (
            <CollectionBrowser
              collectionId="root"
              onClick={(item) => {
                const type = match<string, BreadcrumbItemType>(item.model)
                  .with("card", () => "question")
                  .with("dataset", () => "model")
                  .otherwise((model) => model as BreadcrumbItemType);

                setView({ type, id: item.id });
              }}
            />
          )}

          {(view.type === "question" ||
            view.type === "metric" ||
            view.type === "model") && (
            <InteractiveQuestion questionId={view.id} />
          )}

          {view.type === "dashboard" && (
            <InteractiveDashboard dashboardId={view.id} />
          )}
        </Stack>
      </SdkBreadcrumbsProvider>
    );
  },

  args: {},
};

import { useState } from "react";
import { match } from "ts-pattern";

import { InteractiveDashboard } from "embedding-sdk/components/public";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { questionIdArgType } from "embedding-sdk/test/storybook-id-args";
import type { SdkCollectionId } from "embedding-sdk/types";
import { Stack } from "metabase/ui";

import { CollectionBrowser } from "../../public/CollectionBrowser";
import { InteractiveQuestion } from "../../public/InteractiveQuestion";

import { SdkBreadcrumb } from "./SdkBreadcrumb";
import {
  type BreadcrumbItem,
  type BreadcrumbItemType,
  SdkBreadcrumbProvider,
} from "./SdkBreadcrumbProvider";

export default {
  title: "EmbeddingSDK/SdkBreadcrumb",
  component: SdkBreadcrumb,
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
      <SdkBreadcrumbProvider>
        <Stack p="md" gap="sm">
          <SdkBreadcrumb onBreadcrumbClick={onBreadcrumbClick} />
          <code>view: {JSON.stringify(view)}</code>

          {view.type === "collection" && (
            <CollectionBrowser
              collectionId="root"
              onClick={(item) => {
                const type = match<string, BreadcrumbItemType>(item.model)
                  .with("card", () => "question")
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
      </SdkBreadcrumbProvider>
    );
  },

  args: {},
};

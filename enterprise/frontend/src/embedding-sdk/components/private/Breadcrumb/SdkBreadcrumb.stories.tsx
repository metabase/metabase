import { useState } from "react";

import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { questionIdArgType } from "embedding-sdk/test/storybook-id-args";
import type { SdkCollectionId } from "embedding-sdk/types";
import { Box } from "metabase/ui";

import { CollectionBrowser } from "../../public/CollectionBrowser";
import { InteractiveQuestion } from "../../public/InteractiveQuestion";

import { SdkBreadcrumb } from "./SdkBreadcrumb";
import { SdkBreadcrumbProvider } from "./SdkBreadcrumbProvider";

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

type View = "collection" | "question";

export const Default = {
  render() {
    const [view, setView] = useState<View>("collection");
    const [resourceId, setResourceId] = useState<SdkCollectionId | null>(null);

    return (
      <SdkBreadcrumbProvider>
        <Box p="md">
          {view === "collection" && (
            <CollectionBrowser
              collectionId="root"
              onClick={(item) => {
                if (item.type === "question") {
                  setView("question");
                  setResourceId(item.id);
                }
              }}
            />
          )}

          {view === "question" && (
            <InteractiveQuestion questionId={resourceId} />
          )}
        </Box>
      </SdkBreadcrumbProvider>
    );
  },

  args: {},
};

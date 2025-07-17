import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { questionIdArgType } from "embedding-sdk/test/storybook-id-args";

import { CollectionBrowser } from "../CollectionBrowser";
import { InteractiveQuestion } from "../InteractiveQuestion";

import {
  SdkBreadcrumbWrapper,
  type SdkBreadcrumbWrapperProps,
} from "./SdkBreadcrumbWrapper";

export default {
  title: "EmbeddingSDK/SdkBreadcrumbWrapper",
  component: SdkBreadcrumbWrapper,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
  argTypes: {
    questionId: questionIdArgType,
  },
};

export const Default = {
  render(_args: SdkBreadcrumbWrapperProps) {
    return (
      <SdkBreadcrumbWrapper>
        <CollectionBrowser collectionId={1} />
        <InteractiveQuestion questionId={1} />
      </SdkBreadcrumbWrapper>
    );
  },

  args: {},
};

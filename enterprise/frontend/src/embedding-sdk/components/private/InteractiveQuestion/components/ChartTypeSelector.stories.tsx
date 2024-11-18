import { ChartTypeSelectorList } from "embedding-sdk/components/private/InteractiveQuestion/components/ChartTypeSelectorList";

import { ChartTypeSelector } from "./ChartTypeSelector";

// const QUESTION_ID = (window as any).QUESTION_ID || 12;

export default {
  title: "EmbeddingSDK/InteractiveQuestion/ChartTypeSelector",
  component: ChartTypeSelector,
  parameters: {
    layout: "fullscreen",
  },
  // decorators: [CommonSdkStoryWrapper],
};

export const ChartTypeSelectorStory = {
  render() {
    return <ChartTypeSelectorList />;
  },
};

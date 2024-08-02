// @ts-expect-error There is no type definition
import createAsyncCallback from "@loki/create-async-callback";
import type { ComponentStory, Story } from "@storybook/react";
import { useEffect, type ComponentProps } from "react";
import { Provider } from "react-redux";

import { getStore } from "__support__/entities-store";
import { createMockMetadata } from "__support__/metadata";
import { getNextId } from "__support__/utils";
import { NumberColumn, StringColumn } from "__support__/visualizations";
import { waitTimeContext } from "metabase/context/wait-time";
import { publicReducers } from "metabase/reducers-public";
import { Box } from "metabase/ui";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { PublicOrEmbeddedQuestionView } from "./PublicOrEmbeddedQuestionView";

export default {
  title: "embed/PublicOrEmbeddedQuestionView",
  component: PublicOrEmbeddedQuestionView,
  decorators: [
    ReduxDecorator,
    FasterExplicitSizeUpdateDecorator,
    WaitForResizeToStopDecorator,
    MockIsEmbeddingDecorator,
  ],
  parameters: {
    layout: "fullscreen",
  },
};

function ReduxDecorator(Story: Story) {
  return (
    <Provider store={store}>
      <Story />
    </Provider>
  );
}

function FasterExplicitSizeUpdateDecorator(Story: Story) {
  return (
    <waitTimeContext.Provider value={0}>
      <Story />
    </waitTimeContext.Provider>
  );
}

/**
 * This is an arbitrary number, it should be big enough to pass CI tests.
 * This value works together with FasterExplicitSizeUpdateDecorator which
 * make sure we finish resizing any ExplicitSize components the fastest.
 */
const TIME_UNTIL_ALL_ELEMENTS_STOP_RESIZING = 1000;
function WaitForResizeToStopDecorator(Story: Story) {
  const asyncCallback = createAsyncCallback();
  useEffect(() => {
    setTimeout(asyncCallback, TIME_UNTIL_ALL_ELEMENTS_STOP_RESIZING);
  }, [asyncCallback]);

  return <Story />;
}

declare global {
  interface Window {
    overrideIsWithinIframe?: boolean;
  }
}
function MockIsEmbeddingDecorator(Story: Story) {
  window.overrideIsWithinIframe = true;
  return <Story />;
}

const CARD_BAR_ID = getNextId();
const initialState = createMockState({
  settings: createMockSettingsState({
    "hide-embed-branding?": false,
  }),
});

const store = getStore(publicReducers, initialState);

const Template: ComponentStory<typeof PublicOrEmbeddedQuestionView> = args => {
  return <PublicOrEmbeddedQuestionView {...args} />;
};

const defaultArgs: Partial<
  ComponentProps<typeof PublicOrEmbeddedQuestionView>
> = {
  card: createMockCard({ id: CARD_BAR_ID, name: "Bar", display: "bar" }),
  metadata: createMockMetadata({}),
  titled: true,
  bordered: true,
  getParameters: () => [],
  result: createMockDataset({
    data: createMockDatasetData({
      cols: [
        createMockColumn(StringColumn({ name: "Dimension" })),
        createMockColumn(NumberColumn({ name: "Count" })),
      ],
      rows: [
        ["foo", 1],
        ["bar", 2],
      ],
    }),
  }),
};

// Light theme
export const LightThemeDefault = Template.bind({});
LightThemeDefault.args = defaultArgs;

export const LightThemeDefaultNoResults = Template.bind({});
LightThemeDefaultNoResults.args = {
  ...defaultArgs,
  result: createMockDataset(),
};

// Dark theme
export const DarkThemeDefault = Template.bind({});
DarkThemeDefault.args = {
  ...defaultArgs,
  theme: "night",
};

export const DarkThemeDefaultNoResults = Template.bind({});
DarkThemeDefaultNoResults.args = {
  ...defaultArgs,
  theme: "night",
  result: createMockDataset(),
};

// Transparent theme
export const TransparentThemeDefault = Template.bind({});
TransparentThemeDefault.args = {
  ...defaultArgs,
  theme: "transparent",
};
TransparentThemeDefault.decorators = [LightBackgroundDecorator];

function LightBackgroundDecorator(Story: Story) {
  return (
    <Box bg="#ddd" h="100%">
      <Story />
    </Box>
  );
}

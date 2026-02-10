// @ts-expect-error There is no type definition
import createAsyncCallback from "@loki/create-async-callback";
import type { Store } from "@reduxjs/toolkit";
import type { StoryFn } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import { KBarProvider, VisualState, useKBar } from "kbar";
import { HttpResponse, http } from "msw";
import _ from "underscore";

import { getStore } from "__support__/entities-store";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { Api } from "metabase/api";
import { MetabaseReduxProvider } from "metabase/lib/redux";
import { commonReducers } from "metabase/reducers-common";
import { Box, Center } from "metabase/ui";
import { registerVisualization } from "metabase/visualizations";
import { ComboChart } from "metabase/visualizations/visualizations/ComboChart";
import { LineChart } from "metabase/visualizations/visualizations/LineChart";
import { SmartScalar } from "metabase/visualizations/visualizations/SmartScalar";
import { Table } from "metabase/visualizations/visualizations/Table/Table";
import type { State } from "metabase-types/store";
import { createMockState } from "metabase-types/store/mocks";

import { PaletteContainer } from "./Palette";
import { recents, search } from "./test_data.json";

const settings = mockSettings();

const storeInitialState = createMockState({
  settings,
  entities: createMockEntitiesState({}),
});
const publicReducerNames = Object.keys(commonReducers);
const initialState = _.pick(storeInitialState, ...publicReducerNames) as State;

const storeMiddleware = [Api.middleware];

// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(SmartScalar);
// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(ComboChart);
// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(LineChart);
// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(Table);

const store = getStore(
  commonReducers,
  initialState,
  storeMiddleware,
) as unknown as Store<State>;

const ReduxDecorator = (Story: StoryFn) => {
  return (
    <MetabaseReduxProvider store={store}>
      <KBarProvider>
        <Story />
      </KBarProvider>
    </MetabaseReduxProvider>
  );
};

const DefaultTemplate = () => {
  const { query } = useKBar();

  query.setVisualState(VisualState.showing);

  return (
    <Box h="100%" w="100%">
      <Center>
        <PaletteContainer disabled={false} locationQuery={{}} />
      </Center>
    </Box>
  );
};

const msw = {
  handlers: [
    http.get(/api\/search/, () => HttpResponse.json(search)),
    http.get(/\/api\/activity\/recents/, () => HttpResponse.json({ recents })),
    http.get(/\/api\/database/, () => HttpResponse.json({ data: [] })),
  ],
};

export default {
  title: "App/Palette",
  component: PaletteContainer,
  decorators: [ReduxDecorator],
  parameters: {
    msw,
    layout: "fullscreen",
    loki: {
      chromeSelector: "[data-testid=command-palette]",
    },
  },
};

export const Default = {
  render: DefaultTemplate,
  parameters: {
    loki: {
      skip: true,
    },
    msw,
  },
};

export const Recents = {
  render: DefaultTemplate,

  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const asyncCallback = createAsyncCallback();
    const canvas = within(canvasElement);

    await canvas.findByRole("option", { name: "Recents" });

    asyncCallback();
  },
};

export const Search = {
  render: DefaultTemplate,

  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const asyncCallback = createAsyncCallback();
    const canvas = within(canvasElement);

    await userEvent.type(
      await canvas.findByPlaceholderText(/Search for anything/),
      "ord",
    );

    await canvas.findByRole("option", { name: "Results" });

    // Wait for the result to all show up because "Results" will be
    // present when the search query is still loading
    await expect(
      await canvas.findByText("Product breakdown"),
    ).toBeInTheDocument();

    asyncCallback();
  },
};

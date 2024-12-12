import type { Store } from "@reduxjs/toolkit";
import type { StoryFn } from "@storybook/react";
import { userEvent, within } from "@storybook/testing-library";
import { Provider } from "react-redux";
import _ from "underscore";

import { getStore } from "__support__/entities-store";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { Api } from "metabase/api";
import { publicReducers } from "metabase/reducers-public";
import { createMockCard } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import type { State } from "metabase-types/store";
import {
  createMockQueryBuilderState,
  createMockState,
} from "metabase-types/store/mocks";

import { OverlaysDemo } from "./OverlaysDemo";
import type { OverlaysDemoProps } from "./types";

const mockCard = createMockCard();
const storeInitialState = createMockState({
  qb: createMockQueryBuilderState({ card: mockCard }),
  settings: mockSettings(),
  entities: createMockEntitiesState({
    databases: [createSampleDatabase()],
    questions: [mockCard],
  }),
});
const publicReducerNames = Object.keys(publicReducers);
const initialState = _.pick(storeInitialState, ...publicReducerNames) as State;
const reducers = publicReducers;

const storeMiddleware = [Api.middleware];

const store = getStore(
  reducers,
  initialState,
  storeMiddleware,
) as unknown as Store<State>;

const ReduxDecorator = (Story: StoryFn) => {
  return (
    <Provider store={store}>
      <Story />
    </Provider>
  );
};

const Template: StoryFn<OverlaysDemoProps> = args => {
  return <OverlaysDemo {...args} />;
};

type Scenario = {
  render: StoryFn<OverlaysDemoProps>;
  args: OverlaysDemoProps;
  play?: ({
    canvasElement,
  }: {
    canvasElement: HTMLCanvasElement;
  }) => Promise<void>;
};

export const Default: Scenario = {
  render: Template,
  args: {
    enableNesting: false,
  },
};

export default {
  title: "Design System/Overlays",
  component: (...args: any) => {
    return <OverlaysDemo {...args} />;
  },
  decorators: [ReduxDecorator],
  parameters: {
    layout: "fullscreen",
  },
};

const getMantineModal = async ({
  withinElement,
}: {
  withinElement: HTMLElement;
}) => {
  const context = within(withinElement);
  await userEvent.click(
    await context.findByRole("button", { name: "Mantine Modal" }),
  );
  await context.findByText("Mantine Modal text content");
  const modal = await context.findByRole("dialog", {
    name: /Mantine Modal content/i,
  });
  await within(modal).findByText("Mantine Modal text content");
  return modal;
};

const getLegacyModal = async ({
  withinElement,
}: {
  withinElement: HTMLElement;
}) => {
  const context = within(withinElement);
  await userEvent.click(
    await context.findByRole("button", { name: "Legacy modal" }),
  );
  await context.findByText("Legacy modal text content");
  const modal = await context.findByRole("dialog", {
    name: /Legacy modal content/i,
  });
  await within(modal).findByText("Legacy modal text content");
  return modal;
};

export const MantineModalCanLaunchLegacyModal: Scenario = {
  render: Template,
  args: {
    enableNesting: true,
  },
  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const body = canvasElement.parentElement as HTMLElement;
    const mantineModal = await getMantineModal({ withinElement: body });
    await getLegacyModal({ withinElement: mantineModal });
  },
};

export const LegacyModalCanLaunchMantineModal = {
  render: Template,
  args: {
    enableNesting: true,
  },
  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const body = canvasElement.parentElement as HTMLElement;
    const legacyModal = await getLegacyModal({ withinElement: body });
    await getMantineModal({ withinElement: legacyModal });
    // TODO: Legacy modals aren't properly aria-labelled in this branch so this doesn't quite work yet
  },
};

export const MantineModalCanLaunchLegacyPopover = {
  render: Template,
  args: {
    enableNesting: true,
    overlaysToOpen: ["Mantine Modal", "Legacy Popover"],
  },
};

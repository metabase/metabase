import type { Store } from "@reduxjs/toolkit";
import type { StoryFn, StoryObj } from "@storybook/react";
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
import { OverlayType, OverlaysDemoProps } from "./types";

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
};

export const Default: Scenario = {
  render: Template,
  args: {
    enableNesting: false,
  },
};

type Overlay = {
  name: string;
  targetEvent: string;
  targetText: string;
  textContent: string;
  contentLabel?: string;
  canLaunchOverlays: boolean;
  shouldBeInteractable?: boolean;
};

const overlays: Overlay[] = [
  {
    name: "Mantine Tooltip",
    targetEvent: "hover",
    targetText: "Mantine Tooltip",
    textContent: "Mantine Tooltip content",
    canLaunchOverlays: false,
    shouldBeInteractable: false,
  },
  {
    name: "Legacy Tooltip",
    targetEvent: "hover",
    targetText: "Legacy tooltip",
    textContent: "Legacy tooltip content",
    canLaunchOverlays: false,
    shouldBeInteractable: false,
  },
  {
    name: "Mantine Popover",
    targetEvent: "click",
    targetText: "Mantine Popover",
    textContent: "Mantine Popover text content",
    contentLabel: "Mantine Popover content",
    canLaunchOverlays: true,
  },
  {
    name: "Legacy Popover",
    targetEvent: "click",
    targetText: "Legacy popover",
    textContent: "Legacy popover text content",
    contentLabel: "Legacy popover content",
    canLaunchOverlays: true,
  },
  {
    name: "Mantine Modal",
    targetEvent: "click",
    targetText: "Mantine Modal",
    textContent: "Mantine Modal text content",
    contentLabel: "Mantine Modal content",
    canLaunchOverlays: true,
  },
  {
    name: "Legacy Modal",
    targetEvent: "click",
    targetText: "Legacy modal",
    textContent: "Legacy modal text content",
    contentLabel: "Legacy modal content",
    canLaunchOverlays: true,
  },
  {
    name: "Undo-Style toast",
    targetEvent: "click",
    targetText: "Undo-style toast",
    textContent: "Undo-style toast text content",
    contentLabel: "Undo-style toast content",
    canLaunchOverlays: false,
  },
  {
    name: "Action-Style toast",
    targetEvent: "click",
    targetText: "Action-style toast",
    textContent: "Action-style toast text content",
    contentLabel: "Action-style toast content",
    canLaunchOverlays: true,
  },
  {
    name: "Toaster-Style toast",
    targetEvent: "click",
    targetText: "Toaster-style toast",
    textContent: "Toaster-style toast text content",
    canLaunchOverlays: false,
  },
  {
    name: "Mantine Menu",
    targetEvent: "click",
    targetText: "Mantine Menu",
    textContent: "Mantine Menu Item 1",
    canLaunchOverlays: false,
  },
  {
    name: "Mantine Select",
    targetEvent: "click",
    targetText: "Mantine Select option 1",
    textContent: "Mantine Select option 2",
    canLaunchOverlays: false,
  },
  {
    name: "Legacy Select",
    targetEvent: "click",
    targetText: "Legacy Select option 1",
    textContent: "Legacy Select option 2",
    canLaunchOverlays: false,
  },
  {
    name: "Sidesheet",
    targetEvent: "click",
    targetText: "Sidesheet",
    textContent: "Sidesheet text content",
    contentLabel: "Sidesheet content",
    canLaunchOverlays: true,
  },
  {
    name: "Entity Picker",
    targetEvent: "click",
    targetText: "Entity Picker",
    textContent: "Entity Picker text content",
    contentLabel: "Entity Picker content",
    canLaunchOverlays: true,
  },
  {
    name: "Command Palette",
    targetEvent: "click",
    targetText: "Command Palette",
    textContent: "Command Palette text content",
    contentLabel: "Command Palette content",
    canLaunchOverlays: true,
  },
  // TODO: Make HoverCard work here
  // {
  //   name: "Mantine HoverCard",
  //   targetEvent: "click",
  //   targetText: "Mantine HoverCard",
  //   textContent: "Mantine HoverCard text content",
  //   canLaunchOverlays: false,
  // },
];

const launchers = overlays.filter(
  (overlay: Overlay) => overlay.canLaunchOverlays,
);

const scenarios: Record<string, Scenario> = {};

launchers.forEach(launcher => {
  overlays.forEach(launchee => {
    const scenario: Scenario = {
      render: Template,
      args: {
        enableNesting: true,
        overlaysToOpen: [launcher.name, launchee.name],
      },
    };
    const key = `${launcher.name} Launches ${launchee.name}`.replace(/\s/g, "");
    scenarios[key] = scenario;
  });
});

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

export const {
  MantineModalLaunchesLegacyModal,
  LegacyModalLaunchesMantineModal,
} = scenarios;

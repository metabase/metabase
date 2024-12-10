import type { Store } from "@reduxjs/toolkit";
import type { StoryFn } from "@storybook/react";
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

type StoryProps = {
  enableNesting: boolean;
};

const Template: StoryFn<StoryProps> = args => {
  return <OverlaysDemo {...args} />;
};

export const Default = {
  render: Template,
  args: {
    enableNesting: false,
  },
};

const overlays: OverlayData[] = [
  {
    name: "Mantine Tooltip",
    targetEvent: "hover",
    targetText: "Mantine Tooltip",
    textContent: "Mantine Tooltip content",
    canLaunchOverlays: false,
    shouldBeInteractable: false,
  },
  {
    name: "Legacy tooltip",
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
    name: "Legacy popover",
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
    name: "Legacy modal",
    targetEvent: "click",
    targetText: "Legacy modal",
    textContent: "Legacy modal text content",
    contentLabel: "Legacy modal content",
    canLaunchOverlays: true,
  },
  {
    name: "Undo-style toast",
    targetEvent: "click",
    targetText: "Undo-style toast",
    textContent: "Undo-style toast text content",
    contentLabel: "Undo-style toast content",
    canLaunchOverlays: false,
  },
  {
    name: "Action-style toast",
    targetEvent: "click",
    targetText: "Action-style toast",
    textContent: "Action-style toast text content",
    contentLabel: "Action-style toast content",
    canLaunchOverlays: true,
  },
  {
    name: "Toaster-style toast",
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

    // For Mantine Select we provide custom functions to find the target and text content
    findTarget: (container: Container, targetText: string) =>
      // eslint-disable-next-line testing-library/prefer-screen-queries
      container.findByDisplayValue(targetText),
    findTextContent: (container: Container, contentText: string) => {
      // eslint-disable-next-line testing-library/prefer-screen-queries
      return container.findByText(new RegExp(contentText));
    },
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
  // FIXME:
].filter(({ name }) => name === "Legacy modal");

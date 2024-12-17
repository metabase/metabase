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

import { OverlaysDemo, type OverlaysDemoProps } from "./OverlaysDemo";
import { hidden } from "./constants";
import { findListboxWithOption } from "./find-utils";

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
  parameters?: Record<string, unknown>;
};

const scenarioDefaults: Scenario = {
  render: Template,
  args: {
    enableNesting: true,
  },
};

export const AllOverlays: Scenario = scenarioDefaults;

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

type OverlayType =
  | "Mantine Modal"
  | "Mantine Popover"
  | "Mantine HoverCard"
  | "Mantine Select"
  | "Legacy Tooltip"
  | "Legacy Modal"
  | "Legacy Popover"
  | "Legacy Select";

type Launcher = ({
  launchFrom,
  portalRoot,
}: {
  launchFrom: HTMLElement;
  portalRoot: HTMLElement;
}) => Promise<HTMLElement>;

const getLaunchers = ({ portalRoot }: { portalRoot: HTMLElement }) => {
  const launchers: Record<OverlayType, Launcher> = {
    "Mantine Modal": async ({ launchFrom }) => {
      await userEvent.click(
        await within(launchFrom).findByRole("button", {
          name: "Mantine Modal",
        }),
      );
      const modal = await within(portalRoot).findByRole("dialog", {
        name: /Mantine Modal content/i,
      });
      await within(modal).findByText("Mantine Modal text content");
      return modal;
    },
    "Legacy Modal": async ({ launchFrom }) => {
      await userEvent.click(
        await within(launchFrom).findByRole("button", { name: "Legacy modal" }),
      );
      const modal = await within(portalRoot).findByRole("dialog", {
        name: "Legacy modal content",
      });
      await within(modal).findByText("Legacy modal text content");
      return modal;
    },
    "Legacy Popover": async ({ launchFrom }) => {
      // NOTE: Legacy Popovers are hovered, not clicked
      await userEvent.hover(
        await within(launchFrom).findByRole("button", {
          name: "Legacy popover",
        }),
      );
      return await within(portalRoot).findByRole("tooltip", {
        name: "Legacy popover content",
      });
    },
    "Legacy Tooltip": async ({ launchFrom }) => {
      await userEvent.hover(
        await within(launchFrom).findByRole("button", {
          name: "Legacy tooltip",
        }),
      );
      return await within(portalRoot).findByRole("tooltip", {
        name: "Legacy tooltip content",
      });
    },
    "Legacy Select": async ({ launchFrom }) => {
      await userEvent.click(
        await within(launchFrom).findByRole("button", {
          name: /Legacy Select option 1/,
        }),
      );
      within(portalRoot).findByRole("option", {
        name: "Legacy Select option 2",
      });
      return await within(portalRoot).findByTestId("LegacySelect-list");
    },
    "Mantine Popover": async ({ launchFrom }) => {
      // NOTE: Mantine Popovers are clicked, not hovered
      await userEvent.click(
        await within(launchFrom).findByRole("button", {
          name: "Mantine Popover",
        }),
      );
      return await within(portalRoot).findByRole("dialog", {
        name: /^Mantine Popover$/i,
      });
    },
    "Mantine HoverCard": async ({ launchFrom }) => {
      await userEvent.hover(
        await within(launchFrom).findByRole("button", {
          name: "Mantine HoverCard",
        }),
      );
      return await within(portalRoot).findByRole("dialog", {
        name: /^Mantine HoverCard$/i,
        ...hidden,
      });
    },
    "Mantine Select": async ({ launchFrom }) => {
      await userEvent.click(
        await within(launchFrom).findByDisplayValue(/Mantine Select option 1/),
      );
      await within(portalRoot).findByRole("option", {
        name: "Mantine Select option 2",
        ...hidden,
      });
      return await findListboxWithOption(portalRoot, /Mantine Select option 2/);
    },
  };
  return launchers;
};

/** Launch overlay A, then use it to launch overlay B */
const launchAThenB = async (
  aType: OverlayType,
  bType: OverlayType,
  { canvasElement }: { canvasElement: HTMLElement },
) => {
  const body = canvasElement.parentElement as HTMLElement;
  const launchers = getLaunchers({ portalRoot: body });
  const [launchA, launchB] = [launchers[aType], launchers[bType]];
  const a = await launchA({ launchFrom: body, portalRoot: body });
  await launchB({ launchFrom: a, portalRoot: body });
};

export const MantineModalCanLaunchLegacyModal: Scenario = {
  ...scenarioDefaults,
  play: props => launchAThenB("Mantine Modal", "Legacy Modal", props),
};

export const LegacyModalCanLaunchMantineModal: Scenario = {
  ...scenarioDefaults,
  play: props => launchAThenB("Legacy Modal", "Mantine Modal", props),
};

export const MantineModalCanLaunchLegacyPopover: Scenario = {
  ...scenarioDefaults,
  play: props => launchAThenB("Mantine Modal", "Legacy Popover", props),
};

export const MantinePopoverCanLaunchLegacyPopover: Scenario = {
  ...scenarioDefaults,
  play: props => launchAThenB("Mantine Popover", "Legacy Popover", props),
};

export const MantinePopoverCanLaunchLegacyTooltip: Scenario = {
  ...scenarioDefaults,
  play: props => launchAThenB("Mantine Popover", "Legacy Tooltip", props),
};

export const MantinePopoverCanLaunchLegacySelect: Scenario = {
  ...scenarioDefaults,
  play: props => launchAThenB("Mantine Popover", "Legacy Select", props),
};

export const MantinePopoverCanLaunchLegacyModal: Scenario = {
  ...scenarioDefaults,
  play: props => launchAThenB("Mantine Popover", "Legacy Modal", props),
};

export const LegacyPopoverCanLaunchMantinePopover: Scenario = {
  ...scenarioDefaults,
  play: props => launchAThenB("Legacy Popover", "Mantine Popover", props),
};

export const MantineModalCanLaunchLegacyTooltip: Scenario = {
  ...scenarioDefaults,
  play: props => launchAThenB("Mantine Modal", "Legacy Tooltip", props),
};

export const MantineModalCanLaunchLegacySelect: Scenario = {
  ...scenarioDefaults,
  play: props => launchAThenB("Mantine Modal", "Legacy Select", props),
};

export const MantineModalCanLaunchMantineHovercard: Scenario = {
  ...scenarioDefaults,
  play: props => launchAThenB("Mantine Modal", "Mantine HoverCard", props),
};

export const MantineModalCanLaunchMantineSelect: Scenario = {
  ...scenarioDefaults,
  play: props => launchAThenB("Mantine Modal", "Mantine Select", props),
};

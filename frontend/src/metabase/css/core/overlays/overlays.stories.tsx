import type { Store } from "@reduxjs/toolkit";
import createAsyncCallback from "@loki/create-async-callback";
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

const tellLokiThePageIsReady = createAsyncCallback();

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
type OverlayType =
  | "Mantine Modal"
  | "Legacy Modal"
  | "Legacy Popover"
  | "Mantine Popover";

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
      const popover = await within(portalRoot).findByRole("tooltip", {
        name: "Legacy popover content",
      });
      return popover;
    },
    "Mantine Popover": async ({ launchFrom }) => {
      // NOTE: Mantine Popovers are clicked, not hovered
      await userEvent.click(
        await within(launchFrom).findByRole("button", {
          name: "Mantine Popover",
        }),
      );
      const popover = await within(portalRoot).findByRole("dialog", {
        name: /^Mantine Popover$/i,
      });
      return popover;
    },
  };
  return launchers;
};

/** Launch overlay A, then use it to launch overlay B */
const launchAThenB = async (
  aType: OverlayType,
  bType: OverlayType,
  body: HTMLElement,
) => {
  const launchers = getLaunchers({ portalRoot: body });
  const [launchA, launchB] = [launchers[aType], launchers[bType]];
  const a = await launchA({ launchFrom: body, portalRoot: body });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const b = await launchB({ launchFrom: a, portalRoot: body });
  // To test this logic here we could do the following:
  // expect(a.nextSibling).toBe(b);
  // const az = getNearestZIndex(a);
  // const bz = getNearestZIndex(b);
  // expect(az).toBe(bz);
  // expect(az).toBeGreaterThan(10);
  await tellLokiThePageIsReady();
};

const getNearestZIndex = (el: HTMLElement): number | null => {
  if (!el) {
    return null;
  }
  const z = Number(getComputedStyle(el).zIndex);
  return !isNaN(z) ? z : getNearestZIndex(el.parentElement!);
};

export const MantineModalCanLaunchLegacyModal: Scenario = {
  render: Template,
  args: {
    enableNesting: true,
  },
  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const body = canvasElement.parentElement as HTMLElement;
    await launchAThenB("Mantine Modal", "Legacy Modal", body);
  },
};

export const LegacyModalCanLaunchMantineModal = {
  render: Template,
  args: {
    enableNesting: true,
  },
  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const body = canvasElement.parentElement as HTMLElement;
    await launchAThenB("Mantine Modal", "Legacy Modal", body);
  },
};

export const LegacyModalCanLaunchLegacyModal = {
  render: Template,
  args: {
    enableNesting: true,
  },
  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const body = canvasElement.parentElement as HTMLElement;
    await launchAThenB("Legacy Modal", "Legacy Modal", body);
  },
};

export const MantineModalCanLaunchMantineModal = {
  render: Template,
  args: {
    enableNesting: true,
  },
  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const body = canvasElement.parentElement as HTMLElement;
    await launchAThenB("Mantine Modal", "Mantine Modal", body);
  },
};

export const MantineModalCanLaunchLegacyPopover = {
  render: Template,
  args: {
    enableNesting: true,
  },
  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const body = canvasElement.parentElement as HTMLElement;
    await launchAThenB("Mantine Modal", "Legacy Popover", body);
  },
};

export const MantinePopoverCanLaunchLegacyPopover = {
  render: Template,
  args: {
    enableNesting: true,
  },
  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const body = canvasElement.parentElement as HTMLElement;
    await launchAThenB("Mantine Popover", "Legacy Popover", body);
  },
};

export const LegacyPopoverCanLaunchMantinePopover = {
  render: Template,
  args: {
    enableNesting: true,
  },
  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const body = canvasElement.parentElement as HTMLElement;
    await launchAThenB("Legacy Popover", "Mantine Popover", body);
  },
};

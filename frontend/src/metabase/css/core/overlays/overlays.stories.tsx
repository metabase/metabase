import type { Store } from "@reduxjs/toolkit";
import type { StoryFn } from "@storybook/react";
import { userEvent, within } from "@storybook/testing-library";
import { expect } from "@storybook/jest";
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
type OverlayType = "Mantine Modal" | "Legacy Modal" | "Legacy Popover";

type Launcher = ({
  launchFrom,
  portalRoot,
}: {
  launchFrom: HTMLElement;
  portalRoot: HTMLElement;
}) => Promise<HTMLElement>;

const launchers: Record<OverlayType, Launcher> = {
  "Mantine Modal": async ({ launchFrom, portalRoot }) => {
    await userEvent.click(
      await within(launchFrom).findByRole("button", { name: "Mantine Modal" }),
    );
    const modal = await within(portalRoot).findByRole("dialog", {
      name: /Mantine Modal content/i,
    });
    await within(modal).findByText("Mantine Modal text content");
    return modal;
  },
  "Legacy Modal": async ({
    launchFrom,
    portalRoot,
  }: {
    launchFrom: HTMLElement;
    portalRoot: HTMLElement;
  }) => {
    await userEvent.click(
      await within(launchFrom).findByRole("button", { name: "Legacy modal" }),
    );
    const modal = await within(portalRoot).findByRole("dialog", {
      name: "Legacy modal content",
    });
    await within(modal).findByText("Legacy modal text content");
    return modal;
  },
};

const launchAFromB = (aName: string, bName: string) => {
  const [launcherA, launcherB] = [
    launchers[aName],
    launchers[bName],
  ] as Function[];
  const a = await launchMantineModal({
    launchFrom: body,
    portalRoot: body,
  });
  const legacyModal = await launchLegacyModal({
    launchFrom: mantineModal,
    portalRoot: body,
  });
  expect(legacyModal.nextSibling).toBe(mantineModal);
  const [legacyModalZ, mantineModalZ] = [
    getNearestZIndex(legacyModal),
    getNearestZIndex(mantineModal),
  ];
  expect(legacyModalZ).toBe(mantineModalZ);
  expect(legacyModalZ).toBeGreaterThan(10);
};

export const MantineModalCanLaunchLegacyModal: Scenario = {
  render: Template,
  args: {
    enableNesting: true,
  },
  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const body = canvasElement.parentElement as HTMLElement;
    const mantineModal = await launchMantineModal({
      launchFrom: body,
      portalRoot: body,
    });
    const legacyModal = await launchLegacyModal({
      launchFrom: mantineModal,
      portalRoot: body,
    });
    expect(legacyModal.nextSibling).toBe(mantineModal);
    const [legacyModalZ, mantineModalZ] = [
      getNearestZIndex(legacyModal),
      getNearestZIndex(mantineModal),
    ];
    expect(legacyModalZ).toBe(mantineModalZ);
    expect(legacyModalZ).toBeGreaterThan(10);
  },
};

const getNearestZIndex = (el: HTMLElement): number | null => {
  if (!el) {
    return null;
  }
  const z = Number(getComputedStyle(el).zIndex);
  return !isNaN(z) ? z : getNearestZIndex(el.parentElement!);
};

export const LegacyModalCanLaunchMantineModal = {
  render: Template,
  args: {
    enableNesting: true,
  },
  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const body = canvasElement.parentElement as HTMLElement;
    const legacyModal = await launchLegacyModal({
      launchFrom: body,
      portalRoot: body,
    });
    const mantineModal = await launchMantineModal({
      launchFrom: legacyModal,
      portalRoot: body,
    });
    expect(mantineModal.nextSibling).toBe(legacyModal);
    const [mantineModalZ, legacyModalZ] = [
      getNearestZIndex(mantineModal),
      getNearestZIndex(legacyModal),
    ];
    expect(legacyModalZ).toBe(mantineModalZ);
    expect(mantineModalZ).toBeGreaterThan(10);
  },
};

export const MantineModalCanLaunchLegacyPopover = {
  render: Template,
  args: {
    enableNesting: true,
    overlaysToOpen: ["Mantine Modal", "Legacy Popover"],
  },
};

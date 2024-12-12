import createAsyncCallback from "@loki/create-async-callback";
import type { Store } from "@reduxjs/toolkit";
import { expect } from "@storybook/jest";
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
  | "Mantine Popover"
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
      const popover = await within(portalRoot).findByRole("dialog", {
        name: /^Mantine Popover$/i,
      });
      return popover;
    },
  };
  return launchers;
};

/** Launch overlay A, then use it to launch overlay B
 *
 * For convenience and to clarify the expected behavior, this function makes
 * several expect() assertions with storybook/jest. These assertions do not run
 * in CI. The expected behavior is validated in CI via visual regression tests.
 */
const launchAThenB = async (
  aType: OverlayType,
  bType: OverlayType,
  body: HTMLElement,
) => {
  const launchers = getLaunchers({ portalRoot: body });
  const [launchA, launchB] = [launchers[aType], launchers[bType]];
  const a = await launchA({ launchFrom: body, portalRoot: body });
  const b = await launchB({ launchFrom: a, portalRoot: body });
  const az = getOperativeZIndex(a);
  const bz = getOperativeZIndex(b);

  // Ensure that either overlay A is no longer present or that it is occurs before overlay B
  expect(!a.isConnected || isEarlierInDOM(a, b)).toBe(true);
  expect(!a.isConnected || az === bz).toBe(true);
  expect(!a.isConnected || az > 10).toBe(true);
  expect(bz > 10).toBe(true);

  // Given that the z-index is the same, the overlay that appears later in the
  // DOM will appear on top

  await tellLokiThePageIsReady();
};

/**
 * Returns true if elementA appears earlier in the DOM than elementB
 * */
const isEarlierInDOM = (elementA: HTMLElement, elementB: HTMLElement) => {
  const position = elementA.compareDocumentPosition(elementB);

  // If the elements are disconnected, they are not in the same DOM tree
  if (position & Node.DOCUMENT_POSITION_DISCONNECTED) {
    return false;
  }

  if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
    return true;
  } else if (position & Node.DOCUMENT_POSITION_PRECEDING) {
    return false;
  } else {
    throw new Error("Neither element is earlier in the DOM");
  }
};

/**
 * Get the z-index of the first element with a z-index in the element's
 * ancestry
 *
 * With this approach, if a library like Tippy adds a z-index within the
 * element's ancestry that doesn't actually affect the overlay's stacking, we
 * ignore that z-index. For example, here, the operative z-index of #el is 200:
 *  <div style="z-index: 200">
 *   <div style="z-index: 3">
 *     <div id='el' />
 *   </div>
 *  </div>
 */
const getOperativeZIndex = (el: HTMLElement) => {
  let curr: HTMLElement | null = el;
  const zIndexes: number[] = [];
  while (curr) {
    const { zIndex: zIndexString, position } = getComputedStyle(curr);
    const zIndexNumber = parseInt(zIndexString, 10);
    if (!isNaN(zIndexNumber) && position !== "static") {
      zIndexes.unshift(zIndexNumber);
    }
    curr = curr.parentElement;
  }
  return zIndexes[0];
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

export const MantinePopoverCanLaunchLegacyTooltip = {
  render: Template,
  args: {
    enableNesting: true,
  },
  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const body = canvasElement.parentElement as HTMLElement;
    await launchAThenB("Mantine Popover", "Legacy Tooltip", body);
  },
};

export const MantinePopoverCanLaunchLegacySelect = {
  render: Template,
  args: {
    enableNesting: true,
  },
  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const body = canvasElement.parentElement as HTMLElement;
    await launchAThenB("Mantine Popover", "Legacy Select", body);
  },
};

export const MantinePopoverCanLaunchLegacyModal = {
  render: Template,
  args: {
    enableNesting: true,
  },
  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const body = canvasElement.parentElement as HTMLElement;
    await launchAThenB("Mantine Popover", "Legacy Modal", body);
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

export const MantineModalCanLaunchLegacyTooltip = {
  render: Template,
  args: {
    enableNesting: true,
  },
  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const body = canvasElement.parentElement as HTMLElement;
    await launchAThenB("Mantine Modal", "Legacy Tooltip", body);
  },
};

export const MantineModalCanLaunchLegacySelect = {
  render: Template,
  args: {
    enableNesting: true,
  },
  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const body = canvasElement.parentElement as HTMLElement;
    await launchAThenB("Mantine Modal", "Legacy Select", body);
  },
};

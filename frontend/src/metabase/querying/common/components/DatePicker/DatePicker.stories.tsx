import type { Store } from "@reduxjs/toolkit";
import FakeTimers from "@sinonjs/fake-timers";
import type { Meta, StoryFn } from "@storybook/react-webpack5";
import { merge } from "icepick";
import { type ComponentProps, useEffect } from "react";
import { userEvent, within } from "storybook/test";

import { getStore } from "__support__/entities-store";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { MetabaseReduxProvider } from "metabase/lib/redux";
import { publicReducers } from "metabase/reducers-public";
import { Box, Popover } from "metabase/ui";
import type { State } from "metabase-types/store";
import { createMockState } from "metabase-types/store/mocks";

import { DatePicker } from "./DatePicker";

import "metabase/public/components/EmbedFrame/EmbedFrame.module.css";

const storeInitialState = createMockState({
  settings: mockSettings(),
  entities: createMockEntitiesState({}),
});
const store = getStore(
  publicReducers,
  storeInitialState,
  [],
) as unknown as Store<State>;

const ReduxDecorator = (Story: StoryFn) => {
  return (
    <MetabaseReduxProvider store={store}>
      <Story />
    </MetabaseReduxProvider>
  );
};

export default {
  title: "Components/Parameters/DatePicker",
  component: DatePicker,
  decorators: [ReduxDecorator],
} as Meta<typeof DatePicker>;

let clock: FakeTimers.InstalledClock | undefined;
function WithMockDate(StoryFn: StoryFn) {
  if (!clock) {
    clock = FakeTimers.install({
      toFake: ["Date"],
      // Happy new year 2025! 🥳
      now: new Date("2025-01-01T00:00:00.000Z"),
    });
  }

  useEffect(() => {
    return () => {
      clock?.uninstall();
      clock = undefined;
    };
  }, []);

  return <StoryFn />;
}

type CustomStoryProps = {
  snapshotSize?: {
    width: number;
    height: number;
  };
};
const Template: StoryFn<
  ComponentProps<typeof DatePicker> & CustomStoryProps
> = (args) => {
  return (
    <>
      <Popover opened position="bottom-start" withinPortal={false}>
        <Popover.Target>
          <div></div>
        </Popover.Target>
        <Popover.Dropdown>
          <DatePicker {...args} />
        </Popover.Dropdown>
      </Popover>
      {args.snapshotSize && (
        <Box
          pos="absolute"
          // the space between the popover and the target element
          mt="8px"
          w={args.snapshotSize.width}
          h={args.snapshotSize.height}
        />
      )}
    </>
  );
};

export const AllOptions = {
  render: Template,
  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const canvas = within(canvasElement);
    const yesterday = canvas.getByRole("button", {
      name: "Yesterday",
    });
    yesterday.classList.add("pseudo-hover");
  },
};
export const AllOptionsDarkTheme = merge(AllOptions, {
  args: {
    theme: "dark",
  },
});

export const Exclude = {
  render: Template,
  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Exclude…",
      }),
    );
    canvas
      .getByRole("button", { name: "Days of the week…" })
      .classList.add("pseudo-hover");
  },
};
export const ExcludeDarkTheme = merge(Exclude, {
  args: {
    theme: "dark",
  },
});

export const ExcludeDayOfWeek = {
  render: Template,
  args: {
    value: {
      type: "exclude",
      operator: "!=",
      unit: "day-of-week",
      values: [3, 4, 5],
    },
  },
};
export const ExcludeDayOfWeekDarkTheme = merge(ExcludeDayOfWeek, {
  args: {
    theme: "dark",
  },
});

export const RelativeCurrent = {
  render: Template,
  args: {
    value: { type: "relative", unit: "day", value: 0 },
  },
  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const canvas = within(canvasElement);
    const week = canvas.getByRole("button", {
      name: "Week",
    });
    week.classList.add("pseudo-hover");
    const next = canvas.getByRole("tab", {
      name: "Next",
    });
    next.classList.add("pseudo-hover");
  },
};
export const RelativeCurrentDarkTheme = merge(RelativeCurrent, {
  args: {
    theme: "dark",
  },
});

export const RelativePrevious = {
  render: Template,
  args: {
    value: {
      options: { includeCurrent: true },
      type: "relative",
      unit: "month",
      value: -12,
    },
  },
  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const canvas = within(canvasElement);
    const next = canvas.getByRole("tab", {
      name: "Next",
    });
    next.classList.add("pseudo-hover");
  },
  decorators: [WithMockDate],
};
export const RelativePreviousDarkTheme = merge(RelativePrevious, {
  args: {
    theme: "dark",
  },
});

export const RelativeNext = {
  render: Template,
  args: {
    value: { type: "relative", unit: "day", value: 30 },
    snapshotSize: {
      width: 365,
      height: 415,
    },
  },
  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const canvas = within(canvasElement);
    const next = canvas.getByRole("tab", {
      name: "Next",
    });
    next.classList.add("pseudo-hover");
    await userEvent.click(canvas.getByRole("textbox", { name: "Unit" }));
  },
  decorators: [WithMockDate],
};
export const RelativeNextDarkTheme = merge(RelativeNext, {
  args: {
    theme: "dark",
  },
});

export const SpecificBetween = {
  render: Template,
  args: {
    value: {
      type: "specific",
      operator: "between",
      values: [
        new Date("2024-11-11T17:00:00.000Z"),
        new Date("2024-11-20T17:00:00.000Z"),
      ],
      hasTime: false,
    },
  },
  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Add time" }));
  },
};

export const SpecificBetweenDarkTheme = merge(SpecificBetween, {
  args: {
    theme: "dark",
  },
});

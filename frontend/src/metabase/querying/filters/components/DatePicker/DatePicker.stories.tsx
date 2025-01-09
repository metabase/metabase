import FakeTimers from "@sinonjs/fake-timers";
import type { ComponentMeta, Story, StoryFn } from "@storybook/react";
import { userEvent, within } from "@storybook/testing-library";
import { merge } from "icepick";
import { type ComponentProps, useEffect } from "react";

import { Box, Popover } from "metabase/ui";

import { DatePicker } from "./DatePicker";

import "metabase/public/components/EmbedFrame/EmbedFrame.module.css";

export default {
  title: "Parameters/DatePicker",
  component: DatePicker,
} as ComponentMeta<typeof DatePicker>;

let clock: FakeTimers.InstalledClock | undefined;
function withMockDate(StoryFn: StoryFn) {
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
  theme?: "light" | "dark";
  snapshotSize?: {
    width: number;
    height: number;
  };
};
const Template: Story<
  ComponentProps<typeof DatePicker> & CustomStoryProps
> = args => {
  const isDarkTheme = args.theme === "dark";

  useEffect(() => {
    if (isDarkTheme) {
      document.documentElement.setAttribute("data-metabase-theme", "night");
    } else {
      document.documentElement.setAttribute("data-metabase-theme", "light");
    }
  }, [isDarkTheme]);

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
    value: { type: "relative", unit: "day", value: "current" },
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
  decorators: [withMockDate],
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
    await userEvent.click(canvas.getByRole("searchbox", { name: "Unit" }));
  },
  decorators: [withMockDate],
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

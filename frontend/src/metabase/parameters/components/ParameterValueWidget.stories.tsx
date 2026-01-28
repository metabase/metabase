// @ts-expect-error There is no type definition
import createAsyncCallback from "@loki/create-async-callback";
import { Box } from "@mantine/core";
import { useArgs } from "@storybook/preview-api";
import type { StoryFn } from "@storybook/react";
import { userEvent, within } from "@storybook/test";

import { ReduxProvider } from "__support__/storybook";
import { createMockParameter } from "metabase-types/api/mocks";

import {
  ParameterValueWidget,
  type ParameterValueWidgetProps,
} from "./ParameterValueWidget";

export default {
  title: "Components/Parameters/ParameterValueWidget",
  component: ParameterValueWidget,
};

const Template: StoryFn<ParameterValueWidgetProps> = (args) => {
  const [{ value }, updateArgs] = useArgs();

  const setValue = (value: string | number | null) => {
    updateArgs({ value });
  };

  return (
    <ReduxProvider>
      <Box maw={220} p={100}>
        <ParameterValueWidget {...args} value={value} setValue={setValue} />
      </Box>
      <Box pos="absolute" w={500} h={200} />
    </ReduxProvider>
  );
};

export const Default = {
  render: Template,

  args: {
    value: "2025-12-16~2025-12-19",
    parameter: createMockParameter({ id: "test-field", type: "date" }),
  },

  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const asyncCallback = createAsyncCallback();
    const canvas = within(canvasElement);

    // To force the tooltip to show up
    await userEvent.hover(
      (await canvas.findByText("December 16, 2025 - December 19, 2025"))
        .parentElement!,
    );

    asyncCallback();
  },
};

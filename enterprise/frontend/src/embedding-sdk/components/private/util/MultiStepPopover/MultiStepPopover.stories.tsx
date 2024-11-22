import { useCounter } from "@mantine/hooks";

import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Button, Group, Stack } from "metabase/ui";

import { MultiStepPopover } from "./MultiStepPopover";

export default {
  title: "EmbeddingSDK/InteractiveQuestion/MultiStepPopover",
  component: MultiStepPopover,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
};

export const MultiStepPopoverStory = {
  render() {
    const [count, handlers] = useCounter(0, {
      min: 0,
      max: 3,
    });

    return (
      <Stack>
        <Group>
          <Button onClick={handlers.decrement}>Prev Step</Button>
          <Button onClick={handlers.increment}>Next Step</Button>
        </Group>
        <MultiStepPopover currentStep={count !== 0 ? `step${count}` : null}>
          <MultiStepPopover.Target>
            <Button onClick={() => handlers.set(count ? 0 : 1)}>
              Hello world {`${count}`}
            </Button>
          </MultiStepPopover.Target>
          <MultiStepPopover.Step value="step1">
            Step 1 content
          </MultiStepPopover.Step>
          <MultiStepPopover.Step value="step2">
            Step 2 content
          </MultiStepPopover.Step>
          <MultiStepPopover.Step value="step3">
            Step 3 content
          </MultiStepPopover.Step>
        </MultiStepPopover>
      </Stack>
    );
  },
};

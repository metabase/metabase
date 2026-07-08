import { useCounter } from "@mantine/hooks";

import { CommonSdkStoryWrapper } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";
import { Button, Group, Paper, Stack } from "metabase/ui";

import { MultiStepPopover } from "./MultiStepPopover";

export default {
  title: "EmbeddingSDK/SdkQuestion/MultiStepPopover",
  component: MultiStepPopover,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
};

export const MultiStepPopoverStory = {
  render: function Render() {
    const [count, handlers] = useCounter(0, {
      min: 0,
      max: 3,
    });

    const Page = ({ page }: { page: number }) => {
      return (
        <Paper>
          <Group mb="lg">
            <Button onClick={handlers.decrement}>Prev Step</Button>
            <Button onClick={handlers.increment}>Next Step</Button>
          </Group>
          This is page {page}
        </Paper>
      );
    };
    return (
      <Stack>
        <MultiStepPopover
          currentStep={count !== 0 ? `step${count}` : null}
          onClose={() => handlers.reset()}
        >
          <MultiStepPopover.Target>
            <Button onClick={() => handlers.set(count ? 0 : 1)}>
              Hello world {`${count}`}
            </Button>
          </MultiStepPopover.Target>
          <MultiStepPopover.Step value="step1">
            <Page page={1} />
          </MultiStepPopover.Step>
          <MultiStepPopover.Step value="step2">
            <Page page={2} />
          </MultiStepPopover.Step>
          <MultiStepPopover.Step value="step3">
            <Page page={3} />
          </MultiStepPopover.Step>
        </MultiStepPopover>
      </Stack>
    );
  },
};

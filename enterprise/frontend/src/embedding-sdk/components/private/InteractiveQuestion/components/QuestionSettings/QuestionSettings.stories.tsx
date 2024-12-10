import { InteractiveQuestion, type MetabaseTheme } from "embedding-sdk";
import {
  Wrapper,
  darkTheme,
} from "embedding-sdk/components/public/InteractiveQuestion/util";
import { CommonSdkStoryWrapper } from "embedding-sdk/test/CommonSdkStoryWrapper";
import { Box, Button, Popover } from "metabase/ui";

import { QuestionSettings } from "./QuestionSettings";

const QUESTION_ID = (window as any).QUESTION_ID || 12;

export default {
  title: "EmbeddingSDK/InteractiveQuestion/QuestionSettings",
  component: QuestionSettings,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
};

export const QuestionSettingsWithNoPopover = {
  render() {
    return (
      <Box p="lg">
        <InteractiveQuestion questionId={QUESTION_ID}>
          <Box>
            <InteractiveQuestion.QuestionSettings />
            <InteractiveQuestion.QuestionVisualization />
          </Box>
        </InteractiveQuestion>
      </Box>
    );
  },
};

const DefaultTemplate = (theme: MetabaseTheme) => (
  <Wrapper theme={theme}>
    <Box p="lg">
      <InteractiveQuestion questionId={QUESTION_ID}>
        <Box>
          <Popover>
            <Popover.Target>
              <Button>Open Question Settings</Button>
            </Popover.Target>
            <Popover.Dropdown>
              <InteractiveQuestion.QuestionSettings />
            </Popover.Dropdown>
          </Popover>
          <InteractiveQuestion.QuestionVisualization />
        </Box>
      </InteractiveQuestion>
    </Box>
  </Wrapper>
);

export const QuestionSettingsWithPopover = {
  render: DefaultTemplate,
};

export const QuestionSettingsDarkTheme = {
  render: DefaultTemplate,
  args: darkTheme,
};

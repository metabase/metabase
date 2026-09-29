import type { StoryFn } from "@storybook/react";

import { ReduxProvider } from "__support__/storybook";
import { createMockDatabase } from "metabase-types/api/mocks";

import { HelpText } from "./HelpText";

export default {
  title: "Query Builder/Editor/HelpText",
  component: HelpText,
};

const Template: StoryFn<typeof HelpText> = () => {
  const database = createMockDatabase();

  return (
    <ReduxProvider>
      <HelpText
        database={database}
        enclosingFunction={{
          name: "datetime-diff",
          arg: null,
        }}
        reportTimezone="America/Los_Angeles"
        expressionMode="expression"
      />
    </ReduxProvider>
  );
};

export const Default = Template;

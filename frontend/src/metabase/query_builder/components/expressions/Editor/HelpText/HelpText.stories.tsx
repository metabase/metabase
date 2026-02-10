import type { StoryFn } from "@storybook/react-webpack5";

import { createMockMetadata } from "__support__/metadata";
import { ReduxProvider } from "__support__/storybook";
import { createQuery } from "metabase-lib/test-helpers";
import { createMockDatabase } from "metabase-types/api/mocks";

import { HelpText } from "./HelpText";

export default {
  title: "Query Builder/Editor/HelpText",
  component: HelpText,
};

const Template: StoryFn<typeof HelpText> = () => {
  const database = createMockDatabase();
  const metadata = createMockMetadata({ databases: [database] });
  const query = createQuery({
    databaseId: database.id,
  });

  return (
    <ReduxProvider>
      <HelpText
        query={query}
        metadata={metadata}
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

import type { StoryFn } from "@storybook/react";

import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/lib/types";
import { getHelpText } from "metabase-lib/v1/expressions/helper-text-strings";
import { createMockDatabase } from "metabase-types/api/mocks";

import type { ExpressionEditorHelpTextProps } from "./ExpressionEditorHelpText";
import { ExpressionEditorHelpText } from "./ExpressionEditorHelpText";

export default {
  title: "App/Query Builder/ExpressionEditorHelpText",
  component: ExpressionEditorHelpText,
};

const Template: StoryFn<typeof ExpressionEditorHelpText> = () => {
  const database = createMockDatabase();
  const metadata = createMockMetadata({ databases: [database] });

  const props: ExpressionEditorHelpTextProps = {
    helpText: getHelpText(
      "datetime-diff",
      checkNotNull(metadata.database(database.id)),
      "UTC",
    ),
  };

  return <ExpressionEditorHelpText {...props} />;
};

export const Default = Template;

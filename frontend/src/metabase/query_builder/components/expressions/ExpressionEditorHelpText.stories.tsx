import React from "react";
import type { ComponentStory } from "@storybook/react";

import { getHelpText } from "metabase/query_builder/components/expressions/ExpressionEditorTextfield/helper-text-strings";
import type { Database } from "metabase-types/api";
import { HelpText } from "metabase-lib/expressions/types";
import ExpressionEditorHelpText from "./ExpressionEditorHelpText";

export default {
  title: "Query Builder/ExpressionEditorHelpText",
  component: ExpressionEditorHelpText,
};

const Template: ComponentStory<typeof ExpressionEditorHelpText> = args => {
  const helpText = getHelpText(
    "datetime-diff",
    null as unknown as Database, // Database is not needed for this particular help text generator
    "UTC",
  ) as HelpText;

  const props = {
    helpText,
    width: 397,
    target: null as any,
  };

  return <ExpressionEditorHelpText {...props} />;
};

export const Default = Template;

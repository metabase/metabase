import React, { useRef } from "react";
import type { ComponentStory } from "@storybook/react";

import { getHelpText } from "metabase/query_builder/components/expressions/ExpressionEditorTextfield/helper-text-strings";
import { createMockDatabase } from "metabase-types/api/mocks";
import { HelpText } from "metabase-lib/expressions/types";

import ExpressionEditorHelpText from "./ExpressionEditorHelpText";

export default {
  title: "Query Builder/ExpressionEditorHelpText",
  component: ExpressionEditorHelpText,
};

const Template: ComponentStory<typeof ExpressionEditorHelpText> = args => {
  const target = useRef(null);

  const helpText = getHelpText(
    "datetime-diff",
    createMockDatabase(),
    "UTC",
  ) as HelpText;

  const props = {
    helpText,
    width: 397,
    target,
  };

  return <ExpressionEditorHelpText {...props} />;
};

export const Default = Template;

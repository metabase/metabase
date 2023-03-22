import React, { useRef } from "react";
import type { ComponentStory } from "@storybook/react";

import { createMockDatabase } from "metabase-types/api/mocks";

import { getHelpText } from "./ExpressionEditorTextfield/helper-text-strings";
import ExpressionEditorHelpText, {
  ExpressionEditorHelpTextProps,
} from "./ExpressionEditorHelpText";

export default {
  title: "Query Builder/ExpressionEditorHelpText",
  component: ExpressionEditorHelpText,
};

const Template: ComponentStory<typeof ExpressionEditorHelpText> = args => {
  const target = useRef(null);

  const props: ExpressionEditorHelpTextProps = {
    helpText: getHelpText("datetime-diff", createMockDatabase(), "UTC"),
    width: 397,
    target,
  };

  return <ExpressionEditorHelpText {...props} />;
};

export const Default = Template;

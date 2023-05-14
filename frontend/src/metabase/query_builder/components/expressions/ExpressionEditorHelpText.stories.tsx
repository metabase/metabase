import React, { useRef } from "react";
import type { ComponentStory } from "@storybook/react";

import { createMockDatabase } from "metabase-types/api/mocks";
import Database from "metabase-lib/metadata/Database";

import { getHelpText } from "./ExpressionEditorTextfield/helper-text-strings";
import ExpressionEditorHelpText, {
  ExpressionEditorHelpTextProps,
} from "./ExpressionEditorHelpText";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default {
  title: "Query Builder/ExpressionEditorHelpText",
  component: ExpressionEditorHelpText,
};

const Template: ComponentStory<typeof ExpressionEditorHelpText> = args => {
  const target = useRef(null);

  const props: ExpressionEditorHelpTextProps = {
    helpText: getHelpText(
      "datetime-diff",
      new Database(createMockDatabase()),
      "UTC",
    ),
    width: 397,
    target,
  };

  return <ExpressionEditorHelpText {...props} />;
};

export const Default = Template;

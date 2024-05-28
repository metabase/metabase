import type { ComponentStory } from "@storybook/react";
import { useRef } from "react";

import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/lib/types";
import { getHelpText } from "metabase-lib/v1/expressions/helper-text-strings";
import { createMockDatabase } from "metabase-types/api/mocks";

import type { ExpressionEditorHelpTextProps } from "./ExpressionEditorHelpText";
import { ExpressionEditorHelpText } from "./ExpressionEditorHelpText";

export default {
  title: "Query Builder/ExpressionEditorHelpText",
  component: ExpressionEditorHelpText,
};

const Template: ComponentStory<typeof ExpressionEditorHelpText> = () => {
  const target = useRef(null);
  const database = createMockDatabase();
  const metadata = createMockMetadata({ databases: [database] });

  const props: ExpressionEditorHelpTextProps = {
    helpText: getHelpText(
      "datetime-diff",
      checkNotNull(metadata.database(database.id)),
      "UTC",
    ),
    width: 397,
    target,
  };

  return <ExpressionEditorHelpText {...props} />;
};

export const Default = Template;

import { useRef } from "react";
import type { ComponentStory } from "@storybook/react";
import { checkNotNull } from "metabase/lib/types";
import { createMockDatabase } from "metabase-types/api/mocks";
import { createMockMetadata } from "__support__/metadata";
import { getHelpText } from "metabase-lib/expressions/helper-text-strings";
import type { ExpressionEditorHelpTextProps } from "./ExpressionEditorHelpText";
import ExpressionEditorHelpText from "./ExpressionEditorHelpText";

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

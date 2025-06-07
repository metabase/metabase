import { highlight } from "metabase/query_builder/components/expressions/HighlightExpression/utils";
import { Code, Group } from "metabase/ui";

import { CopyButton } from "./CopyButton";

interface CodeSnippetProps {
  code: string;
}

export const CodeSnippet = ({ code }: CodeSnippetProps) => {
  return (
    <Group
      px="lg"
      py="md"
      bd="1px solid border"
      bg="bg-light"
      w="100%"
      style={{
        borderRadius: 8,
      }}
    >
      <Code flex={1} dangerouslySetInnerHTML={{ __html: highlight(code) }} />
      <CopyButton value={code} />
    </Group>
  );
};

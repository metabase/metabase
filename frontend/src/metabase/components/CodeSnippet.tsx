import { Code, Group, Icon } from "metabase/ui";

import { CopyButton } from "./CopyButton";

interface CodeSnippetProps {
  code: string;
  language?: string;
}

export const CodeSnippet = ({ code }: CodeSnippetProps) => {
  return (
    <Group
      p="md"
      bd="1px solid border"
      bg="bg-light"
      w="100%"
      style={{
        borderRadius: 8,
      }}
    >
      <Icon name="chevronright" size={16} />
      <Code block flex={1}>
        {code}
      </Code>
      <CopyButton value={code} />
    </Group>
  );
};

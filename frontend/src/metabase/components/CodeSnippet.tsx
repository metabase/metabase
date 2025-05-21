import { Box, Code } from "metabase/ui";

interface CodeSnippetProps {
  code: string;
  language?: string;
}

export const CodeSnippet = ({ code }: CodeSnippetProps) => {
  return (
    <Box
      p="md"
      style={{
        backgroundColor: "var(--mb-color-bg-light)",
        borderRadius: "4px",
        overflow: "auto",
      }}
    >
      <Code block>{code}</Code>
    </Box>
  );
};

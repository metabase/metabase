import { CodeEditor } from "metabase/common/components/CodeEditor";
import { Box } from "metabase/ui";

export default {
  title: "Components/CodeEditor",
  component: CodeEditor,
};

const MARKDOWN_EXAMPLE = `# SQL Query Assistant

You are an expert SQL analyst specializing in business intelligence.

## Core Principles

**Clarity over cleverness.** Write SQL that a colleague can read at a
glance. Favor *explicit joins* and \`meaningful_aliases\`.

**Performance awareness.** Consider how queries will execute:

- Filter early using WHERE clauses before joins where possible
- Avoid SELECT * — always name columns explicitly
- Use CTEs (WITH clauses) to break complex logic into readable steps

---

## Query Structure

\`\`\`sql
SELECT column_name
FROM table_name
\`\`\`
`;

export const Markdown = {
  render: () => (
    <Box maw="40rem" p="md">
      <CodeEditor
        language="markdown"
        lineNumbers={false}
        value={MARKDOWN_EXAMPLE}
      />
    </Box>
  ),
};

// @ts-expect-error There is no type definition
import createAsyncCallback from "@loki/create-async-callback";
import { expect, waitFor, within } from "@storybook/test";

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

  // The editor loads lazily and CodeMirror paints its content in an effect, so
  // loki would otherwise capture the empty editor. Hold the snapshot until the
  // content is on screen and syntax highlighting has been applied.
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const asyncCallback = createAsyncCallback();
    try {
      const canvas = within(canvasElement);
      await waitFor(() =>
        expect(canvas.getByText(/SQL analyst/)).toBeInTheDocument(),
      );
      // The document text renders a tick before CodeMirror colours its tokens,
      // so waiting for the text alone let the burn-in catch a half-highlighted
      // editor. Wait for the highlighted token spans too.
      await waitFor(() =>
        expect(
          canvasElement.querySelectorAll(".cm-content .cm-line span").length,
        ).toBeGreaterThan(0),
      );
      // A late monospace-font swap drifts the glyph metrics sub-pixel, and the
      // drift accumulates down the document until the last line crosses the
      // antialiasing threshold. The burn-in caught that swap mid-flight. Hold
      // the snapshot until the fonts are ready.
      await document.fonts.ready;
    } finally {
      asyncCallback();
    }
  },
};

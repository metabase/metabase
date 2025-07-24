import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Editor as TiptapEditor } from "@tiptap/react";

import { STATIC_QUESTION_REGEX } from "./QuestionStatic/QuestionStatic";

export const MarkdownSerializer = Extension.create({
  name: "markdownSerializer",

  addCommands() {
    return {
      getMarkdown:
        () =>
        ({ editor }: { editor: TiptapEditor }) => {
          const { doc } = editor.state;
          return serializeToMarkdown(doc);
        },
      setMarkdown:
        (markdown: string) =>
        ({ commands }: { commands: TiptapEditor["commands"] }) => {
          const html = parseMarkdownToHTML(markdown);
          return commands.setContent(html);
        },
    };
  },

  addStorage() {
    return {
      markdown: {
        getMarkdown: () => "",
      },
    };
  },
});

export function serializeToMarkdown(doc: ProseMirrorNode): string {
  let markdown = "";

  doc.forEach((node) => {
    if (node.type.name === "paragraph") {
      let paragraphContent = "";
      node.forEach((child) => {
        if (child.type.name === "text") {
          paragraphContent += child.text;
        } else if (child.type.name === "questionEmbed") {
          const { questionId, snapshotId, customName } = child.attrs;
          paragraphContent += customName
            ? `{{card:${questionId}:${snapshotId}:${customName}}}`
            : `{{card:${questionId}:${snapshotId}}}`;
        } else if (child.type.name === "questionStatic") {
          paragraphContent += `{{static-card:${child.attrs.questionName}:series-${child.attrs.series}:viz-${child.attrs.viz}:display-${child.attrs.display}}}`;
        }
      });
      markdown += paragraphContent + "\n\n";
    } else if (node.type.name === "heading") {
      const level = node.attrs.level || 1;
      const prefix = "#".repeat(level);
      markdown += `${prefix} ${node.textContent}\n\n`;
    } else if (node.type.name === "bulletList") {
      node.forEach((listItem) => {
        markdown += `- ${listItem.textContent}\n`;
      });
      markdown += "\n";
    } else if (node.type.name === "orderedList") {
      let index = 1;
      node.forEach((listItem) => {
        markdown += `${index}. ${listItem.textContent}\n`;
        index++;
      });
      markdown += "\n";
    } else if (node.type.name === "questionEmbed") {
      const { questionId, snapshotId, customName } = node.attrs;
      markdown += customName
        ? `{{card:${questionId}:${snapshotId}:${customName}}}\n\n`
        : `{{card:${questionId}:${snapshotId}}}\n\n`;
    } else if (node.type.name === "questionStatic") {
      markdown += `{{static-card:${node.attrs.questionName}:series-${node.attrs.series}:viz-${node.attrs.viz}:display-${node.attrs.display}}}`;
    } else if (node.type.name === "codeBlock") {
      markdown += `\`\`\`${node.attrs.language || ""}\n${node.textContent}\n\`\`\`\n\n`;
    } else {
      markdown += node.textContent + "\n\n";
    }
  });

  return markdown.trim();
}

export function parseMarkdownToHTML(markdown: string): string {
  let html = markdown
    .replace(
      /{{card:(\d+):(\d+)(?::([^}]+))?}}/g,
      (_match, id, snapshotId, customName) =>
        customName
          ? `<div data-type="question-embed" data-question-id="${id}" data-snapshot-id="${snapshotId}" data-custom-name="${customName}" data-model="card"></div>`
          : `<div data-type="question-embed" data-question-id="${id}" data-snapshot-id="${snapshotId}" data-model="card"></div>`,
    )
    .replace(
      STATIC_QUESTION_REGEX,
      (_match, questionName, series, viz, display) =>
        `<div data-type="question-static" data-question-name="${questionName}" data-series="${series}" data-viz="${viz}" data-display="${display}"></div>`,
    )
    .replace(/^### (.*$)/gim, "<h3>$1</h3>")
    .replace(/^## (.*$)/gim, "<h2>$1</h2>")
    .replace(/^# (.*$)/gim, "<h1>$1</h1>")
    .replace(/^\* (.+)/gim, "<li>$1</li>")
    .replace(/^- (.+)/gim, "<li>$1</li>")
    .replace(/^\d+\. (.+)/gim, "<li>$1</li>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(
      /```(\w*)\n([\s\S]*?)```/g,
      '<pre><code class="language-$1">$2</code></pre>',
    )
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<)/, "<p>")
    .replace(/(?!>)$/, "</p>");

  html = html.replace(/<li>(.*?)<\/li>/g, (match) => {
    if (
      html.indexOf(match) > 0 &&
      !html.substring(0, html.indexOf(match)).endsWith("</ul>")
    ) {
      return "<ul>" + match;
    }
    return match;
  });

  html = html.replace(/(<\/li>)(?![\s\S]*<li>)/g, "$1</ul>");

  return html;
}

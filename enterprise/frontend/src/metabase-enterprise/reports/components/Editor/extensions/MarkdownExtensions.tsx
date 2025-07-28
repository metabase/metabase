import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Editor as TiptapEditor } from "@tiptap/react";

import { STATIC_CARD_REGEX } from "./CardStatic/CardStatic";

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

function serializeList(node: ProseMirrorNode, indent: string = ""): string {
  let markdown = "";

  node.forEach((listItem, _offset, index) => {
    if (listItem.type.name === "listItem") {
      let itemContent = "";
      let nestedLists = "";

      listItem.forEach((child) => {
        if (child.type.name === "paragraph") {
          itemContent += child.textContent;
        } else if (
          child.type.name === "bulletList" ||
          child.type.name === "orderedList"
        ) {
          nestedLists += serializeList(child, indent + "  ");
        }
      });

      if (node.type.name === "bulletList") {
        markdown += `${indent}- ${itemContent}\n`;
      } else if (node.type.name === "orderedList") {
        markdown += `${indent}${index + 1}. ${itemContent}\n`;
      }

      if (nestedLists) {
        markdown += nestedLists;
      }
    }
  });

  return markdown;
}

export function serializeToMarkdown(doc: ProseMirrorNode): string {
  let markdown = "";

  doc.forEach((node) => {
    if (node.type.name === "paragraph") {
      let paragraphContent = "";
      node.forEach((child) => {
        if (child.type.name === "text") {
          let text = child.text;
          child.marks.forEach((mark) => {
            if (mark.type.name === "link") {
              text = `[${text}](${mark.attrs.href})`;
            }
          });
          paragraphContent += text;
        } else if (child.type.name === "cardEmbed") {
          const { cardId, snapshotId, customName } = child.attrs;
          paragraphContent += customName
            ? `{{card:${cardId}:${snapshotId}:${customName}}}`
            : `{{card:${cardId}:${snapshotId}}}`;
        } else if (child.type.name === "cardStatic") {
          paragraphContent += `{{static-card:${child.attrs.questionName}:series-${child.attrs.series}:viz-${child.attrs.viz}:display-${child.attrs.display}}}`;
        } else if (child.type.name === "smartLink") {
          paragraphContent += `{{link:${child.attrs.url}:${child.attrs.text}:${child.attrs.icon}}}`;
        }
      });
      // Every paragraph gets standard spacing, empty or not
      markdown += paragraphContent + "\n\n";
    } else if (node.type.name === "heading") {
      const level = node.attrs.level || 1;
      const prefix = "#".repeat(level);
      markdown += `${prefix} ${node.textContent}\n\n`;
    } else if (
      node.type.name === "bulletList" ||
      node.type.name === "orderedList"
    ) {
      markdown += serializeList(node) + "\n";
    } else if (node.type.name === "image") {
      markdown += `![${node.attrs.alt || ""}](${node.attrs.src})\n\n`;
    } else if (node.type.name === "cardEmbed") {
      const { cardId, snapshotId, customName } = node.attrs;
      markdown += customName
        ? `{{card:${cardId}:${snapshotId}:${customName}}}\n\n`
        : `{{card:${cardId}:${snapshotId}}}\n\n`;
    } else if (node.type.name === "cardStatic") {
      markdown += `{{static-card:${node.attrs.questionName}:series-${node.attrs.series}:viz-${node.attrs.viz}:display-${node.attrs.display}}}\n\n`;
    } else if (node.type.name === "smartLink") {
      markdown += `{{link:${node.attrs.url}:${node.attrs.text}:${node.attrs.icon}}}\n\n`;
    } else if (node.type.name === "codeBlock") {
      markdown += `\`\`\`${node.attrs.language || ""}\n${node.textContent}\n\`\`\`\n\n`;
    } else {
      markdown += node.textContent + "\n\n";
    }
  });

  return markdown.trim();
}

export function parseMarkdownToHTML(markdown: string): string {
  // First, replace question embeds with placeholder tokens to protect them
  const embedTokens: string[] = [];
  let html = markdown
    .replace(
      /{{card:(\d+):(\d+)(?::([^}]+))?}}/g,
      (_match, id, snapshotId, customName) => {
        const embed = customName
          ? `<div data-type="card-embed" data-card-id="${id}" data-snapshot-id="${snapshotId}" data-custom-name="${customName}" data-model="card"></div>`
          : `<div data-type="card-embed" data-card-id="${id}" data-snapshot-id="${snapshotId}" data-model="card"></div>`;
        const token = `__EMBED_TOKEN_${embedTokens.length}__`;
        embedTokens.push(embed);
        return token;
      },
    )
    .replace(
      STATIC_CARD_REGEX,
      (_match, questionName, series, viz, display) => {
        const embed = `<div data-type="question-static" data-question-name="${questionName}" data-series="${series}" data-viz="${viz}" data-display="${display}"></div>`;
        const token = `__EMBED_TOKEN_${embedTokens.length}__`;
        embedTokens.push(embed);
        return token;
      },
    )
    .replace(/{{link:([^:]+):([^:]+):(\w+)}}/g, (_match, url, text, icon) => {
      return `<span data-type="smart-link" data-url="${url}" data-text="${text}" data-icon="${icon}"></span>`;
    })
    .replace(/^### (.*$)/gim, "<h3>$1</h3>")
    .replace(/^## (.*$)/gim, "<h2>$1</h2>")
    .replace(/^# (?!#)(.*$)/gim, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(
      /```(\w*)\n([\s\S]*?)```/g,
      '<pre><code class="language-$1">$2</code></pre>',
    )
    .replace(
      /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/gi,
      `<img src="$2" alt="$1" />`,
    )
    .replace(/\[([^\]]+)]\((https?:\/\/[^\s)]+)\)/gi, `<a href="$2">$1</a>`)
    .replace(/`(.+?)`/g, "<code>$1</code>");

  // Handle lists before paragraph processing
  const lines = html.split("\n");
  const result = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const bulletMatch = line.match(/^(\s*)- (.+)$/);
    const numberMatch = line.match(/^(\s*)\d+\. (.+)$/);

    if (bulletMatch || numberMatch) {
      // Start of a list
      const baseIndent = bulletMatch
        ? bulletMatch[1].length
        : // @ts-expect-error TODO: fix this
          numberMatch[1].length;
      const listItems = [];

      // Collect all items at this level and deeper
      while (i < lines.length) {
        const currentLine = lines[i];
        const currentBullet = currentLine.match(/^(\s*)- (.+)$/);
        const currentNumber = currentLine.match(/^(\s*)\d+\. (.+)$/);

        if (!currentBullet && !currentNumber) {
          break;
        }

        const currentIndent = currentBullet
          ? currentBullet[1].length
          : // @ts-expect-error TODO: fix this
            currentNumber[1].length;

        if (currentIndent < baseIndent) {
          break;
        }

        listItems.push({
          indent: currentIndent,
          // @ts-expect-error TODO: fix this
          content: currentBullet ? currentBullet[2] : currentNumber[2],
          type: currentBullet ? "ul" : "ol",
        });

        i++;
      }

      // Convert items to HTML
      const listHtml = buildListHtml(listItems, baseIndent);
      result.push(listHtml);
    } else {
      result.push(line);
      i++;
    }
  }

  html = result.join("\n");

  function buildListHtml(
    items: Array<{ indent: number; content: string; type: string }>,
    baseIndent: number,
  ): string {
    if (items.length === 0) {
      return "";
    }

    const firstType = items[0].type;
    let html = `<${firstType}>`;
    let i = 0;

    while (i < items.length) {
      const item = items[i];

      if (item.indent === baseIndent) {
        html += `<li><p>${item.content}</p>`;

        // Check for nested items
        const nestedItems = [];
        let j = i + 1;
        while (j < items.length && items[j].indent > baseIndent) {
          nestedItems.push(items[j]);
          j++;
        }

        if (nestedItems.length > 0) {
          const nestedHtml = buildListHtml(nestedItems, items[i + 1].indent);
          html += nestedHtml;
          i = j - 1;
        }

        html += "</li>";
      }
      i++;
    }

    html += `</${firstType}>`;
    return html;
  }

  // Now handle paragraphs
  html = html
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<)/, "<p>")
    .replace(/(?!>)$/, "</p>");

  // Now fix paragraph/embed structure by moving standalone embeds outside paragraphs
  html = html.replace(/<p>(__EMBED_TOKEN_\d+__)<\/p>/g, "$1");

  // Fix paragraph/heading structure by moving headings outside paragraphs
  html = html.replace(/<p>(<h[1-6]>.*?<\/h[1-6]>)<\/p>/g, "$1");

  // Fix paragraph/list structure by moving lists outside paragraphs
  html = html.replace(/<p>(<[uo]l>[\s\S]*?<\/[uo]l>)<\/p>/g, "$1");

  // Clean up orphaned paragraph tags around headings
  html = html.replace(/<\/p><p>(<h[1-6]>.*?<\/h[1-6]>)/g, "$1");
  html = html.replace(/(<h[1-6]>.*?<\/h[1-6]>)<\/p><p>/g, "$1");
  html = html.replace(/(<h[1-6]>.*?<\/h[1-6]>)<\/p>/g, "$1");

  // Clean up orphaned paragraph tags around lists
  html = html.replace(/<\/p><p>(<[uo]l>)/g, "$1");
  html = html.replace(/(<\/[uo]l>)<\/p><p>/g, "$1");
  html = html.replace(/(<\/[uo]l>)<\/p>/g, "$1");

  // Remove empty paragraphs that might be created between headings
  html = html.replace(/<p><\/p>/g, "");

  // Finally, restore the actual embed HTML
  embedTokens.forEach((embed, index) => {
    html = html.replace(`__EMBED_TOKEN_${index}__`, embed);
  });

  return html;
}

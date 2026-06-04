import type { JSONContent } from "@tiptap/core";
import { match } from "ts-pattern";
import { t } from "ttag";

import type { AdhocVizValue } from "metabase/api/ai-streaming/schemas";
import { deserializeCardFromQuery } from "metabase/common/utils/card";
import { wrapCardEmbed } from "metabase/rich_text_editing/tiptap/extensions/shared/layout";
import type {
  Card,
  DocumentContent,
  MetabotTodoItem,
} from "metabase-types/api";

import type { MetabotChatMessage, MetabotDataPart } from "../state/types";

export type ConversationDocument = {
  document: DocumentContent;
  // Ad-hoc charts become draft cards (negative ids) that `POST /api/document`
  // materializes alongside the document, the same way the editor saves cards.
  cards: Record<number, Card>;
};

type Mark = { type: string; attrs?: Record<string, unknown> };

function textNode(text: string, marks: Mark[]): JSONContent {
  return marks.length > 0
    ? { type: "text", text, marks }
    : { type: "text", text };
}

// Ordered so that, at a shared start index, the earlier rule wins (e.g. `**`
// resolves to bold before italic's `*` rule can claim it).
const INLINE_RULES: {
  re: RegExp;
  mark?: (m: RegExpExecArray) => Mark;
  recurse: boolean;
}[] = [
  { re: /`([^`]+)`/, mark: () => ({ type: "code" }), recurse: false },
  {
    re: /\[([^\]]+)\]\(([^)\s]+)\)/,
    mark: (m) => ({ type: "link", attrs: { href: m[2] } }),
    recurse: true,
  },
  { re: /\*\*([\s\S]+?)\*\*/, mark: () => ({ type: "bold" }), recurse: true },
  { re: /__([\s\S]+?)__/, mark: () => ({ type: "bold" }), recurse: true },
  { re: /~~([\s\S]+?)~~/, mark: () => ({ type: "strike" }), recurse: true },
  { re: /\*([\s\S]+?)\*/, mark: () => ({ type: "italic" }), recurse: true },
  { re: /_([\s\S]+?)_/, mark: () => ({ type: "italic" }), recurse: true },
];

function parseInline(text: string, marks: Mark[] = []): JSONContent[] {
  if (!text) {
    return [];
  }

  let best: {
    index: number;
    length: number;
    inner: string;
    mark: Mark;
    recurse: boolean;
  } | null = null;

  for (const rule of INLINE_RULES) {
    const m = rule.re.exec(text);
    if (m && (best === null || m.index < best.index)) {
      best = {
        index: m.index,
        length: m[0].length,
        inner: m[1],
        mark: rule.mark?.(m) ?? { type: "text" },
        recurse: rule.recurse,
      };
    }
  }

  if (!best) {
    return [textNode(text, marks)];
  }

  const nodes: JSONContent[] = [];
  if (best.index > 0) {
    nodes.push(textNode(text.slice(0, best.index), marks));
  }
  const innerMarks = [...marks, best.mark];
  nodes.push(
    ...(best.recurse
      ? parseInline(best.inner, innerMarks)
      : [textNode(best.inner, innerMarks)]),
  );
  nodes.push(...parseInline(text.slice(best.index + best.length), marks));
  return nodes;
}

const isBlankLine = (line: string) => line.trim() === "";
const isHeading = (line: string) => /^#{1,6}\s/.test(line);
const isFence = (line: string) => /^```/.test(line);
const isQuote = (line: string) => /^>\s?/.test(line);
const isBullet = (line: string) => /^\s*[-*+]\s+/.test(line);
const isOrdered = (line: string) => /^\s*\d+\.\s+/.test(line);
const isHr = (line: string) => /^\s*([-*_])(\s*\1){2,}\s*$/.test(line);

const startsBlock = (line: string) =>
  isFence(line) ||
  isHeading(line) ||
  isQuote(line) ||
  isBullet(line) ||
  isOrdered(line);

function listItem(text: string): JSONContent {
  return {
    type: "listItem",
    content: [{ type: "paragraph", content: parseInline(text) }],
  };
}

// A deliberately small Markdown → TipTap converter covering the subset the
// agent actually emits (headings, paragraphs, lists, blockquotes, fenced code,
// inline bold/italic/code/strike/links). We hand-roll it rather than pull in
// markdown-it, which isn't hoisted in the Bun install layout.
function markdownToNodes(md: string): JSONContent[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: JSONContent[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (isBlankLine(line)) {
      i++;
      continue;
    }

    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        code.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push({
        type: "codeBlock",
        attrs: { language: fence[1] || null },
        content:
          code.length > 0 ? [{ type: "text", text: code.join("\n") }] : [],
      });
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push({
        type: "heading",
        attrs: { level: heading[1].length },
        content: parseInline(heading[2].trim()),
      });
      i++;
      continue;
    }

    if (isHr(line)) {
      blocks.push({ type: "horizontalRule" });
      i++;
      continue;
    }

    if (isQuote(line)) {
      const quote: string[] = [];
      while (i < lines.length && isQuote(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({
        type: "blockquote",
        content: markdownToNodes(quote.join("\n")),
      });
      continue;
    }

    if (isBullet(line)) {
      const items: JSONContent[] = [];
      while (i < lines.length && isBullet(lines[i])) {
        items.push(listItem(lines[i].replace(/^\s*[-*+]\s+/, "")));
        i++;
      }
      blocks.push({ type: "bulletList", content: items });
      continue;
    }

    if (isOrdered(line)) {
      const items: JSONContent[] = [];
      while (i < lines.length && isOrdered(lines[i])) {
        items.push(listItem(lines[i].replace(/^\s*\d+\.\s+/, "")));
        i++;
      }
      blocks.push({ type: "orderedList", content: items });
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      !isBlankLine(lines[i]) &&
      !startsBlock(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push({ type: "paragraph", content: parseInline(para.join(" ")) });
  }

  return blocks;
}

function blockquote(content: JSONContent[]): JSONContent {
  return { type: "blockquote", content };
}

function linkParagraph(href: string, label: string): JSONContent {
  return {
    type: "paragraph",
    content: [
      { type: "text", text: label, marks: [{ type: "link", attrs: { href } }] },
    ],
  };
}

function todoListNodes(items: MetabotTodoItem[]): JSONContent[] {
  if (items.length === 0) {
    return [];
  }
  return [
    {
      type: "bulletList",
      content: items.map((item) => listItem(item.content)),
    },
  ];
}

function codeBlockNodes(code: string): JSONContent[] {
  return [
    {
      type: "codeBlock",
      attrs: { language: null },
      content: code ? [{ type: "text", text: code }] : [],
    },
  ];
}

/**
 * Turns a Metabot conversation (the redux `messages` array) into a TipTap
 * document AST plus the draft cards it references. User prompts become
 * blockquotes, agent markdown becomes body text, saved charts (`static_viz`)
 * embed by id, and ad-hoc charts (`adhoc_viz`) are decoded into draft cards and
 * embedded as live previews. Chat-only messages (tool calls, aborts, errors)
 * are dropped.
 */
export function conversationToDocument(
  messages: MetabotChatMessage[],
): ConversationDocument {
  const cards: Record<number, Card> = {};
  let nextDraftId = -1;

  // Decode an ad-hoc chart link into a draft card and embed it as a live
  // preview. Falls back to a plain link if the link can't be decoded.
  const adhocVizNodes = (value: AdhocVizValue): JSONContent[] => {
    try {
      const card = deserializeCardFromQuery(value.link);
      const id = nextDraftId;
      nextDraftId -= 1;
      // The backend requires non-blank name/display and a map for
      // visualization_settings, so fill any gaps the decoded card leaves.
      cards[id] = {
        ...card,
        id,
        name: value.title || card.name || t`Generated question`,
        display: card.display || "table",
        visualization_settings: card.visualization_settings ?? {},
      } as Card;
      return [wrapCardEmbed({ type: "cardEmbed", attrs: { id } })];
    } catch {
      return [linkParagraph(value.link, value.title ?? t`View chart`)];
    }
  };

  const dataPartToNodes = (part: MetabotDataPart): JSONContent[] =>
    match(part)
      .with({ type: "static_viz" }, ({ value }) => [
        wrapCardEmbed({ type: "cardEmbed", attrs: { id: value.entity_id } }),
      ])
      .with({ type: "adhoc_viz" }, ({ value }) => adhocVizNodes(value))
      .with({ type: "automagic_dashboard" }, ({ value }) => [
        linkParagraph(value.url, value.title ?? t`View dashboard`),
      ])
      .with({ type: "todo_list" }, ({ value }) => todoListNodes(value))
      .with({ type: "code_edit" }, ({ value }) => codeBlockNodes(value.value))
      .with({ type: "transform_suggestion" }, () => [])
      .exhaustive();

  const content = messages.flatMap((message) =>
    match(message)
      .with({ role: "user", type: "text" }, ({ message }) => {
        const inner = markdownToNodes(message);
        return inner.length > 0 ? [blockquote(inner)] : [];
      })
      .with({ role: "agent", type: "text" }, ({ message }) =>
        markdownToNodes(message),
      )
      .with({ role: "agent", type: "data_part" }, ({ part }) =>
        dataPartToNodes(part),
      )
      .otherwise(() => []),
  );

  return {
    document: {
      type: "doc",
      content: content.length > 0 ? content : [{ type: "paragraph" }],
    },
    cards,
  };
}

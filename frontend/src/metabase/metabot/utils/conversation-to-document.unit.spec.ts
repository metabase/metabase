import { serializeCardForUrl } from "metabase/common/utils/card";
import { createMockCard } from "metabase-types/api/mocks";

import type { MetabotChatMessage } from "../state/types";

import {
  conversationToDocument,
  modelAuthoredDocument,
} from "./conversation-to-document";

const userText = (message: string): MetabotChatMessage => ({
  id: "u1",
  role: "user",
  type: "text",
  message,
});

const agentText = (message: string): MetabotChatMessage => ({
  id: "a1",
  role: "agent",
  type: "text",
  message,
});

const staticViz = (id: string, entityId: number): MetabotChatMessage => ({
  id,
  role: "agent",
  type: "data_part",
  part: { type: "static_viz", version: 1, value: { entity_id: entityId } },
});

describe("conversationToDocument", () => {
  it("returns a doc with a single empty paragraph for an empty conversation", () => {
    expect(conversationToDocument([])).toEqual({
      document: { type: "doc", content: [{ type: "paragraph" }] },
      cards: {},
    });
  });

  it("renders a user prompt as a blockquote", () => {
    const { document } = conversationToDocument([
      userText("Show me sales by region"),
    ]);
    expect(document.content).toEqual([
      {
        type: "blockquote",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Show me sales by region" }],
          },
        ],
      },
    ]);
  });

  it("drops empty user prompts", () => {
    expect(conversationToDocument([userText("   ")]).document.content).toEqual([
      { type: "paragraph" },
    ]);
  });

  it("converts agent markdown into paragraphs, headings, lists and inline marks", () => {
    const { document } = conversationToDocument([
      agentText(
        "## Findings\n\nSales are **up** with `growth` and a [link](https://x.com).\n\n- one\n- two",
      ),
    ]);

    expect(document.content).toEqual([
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Findings" }],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Sales are " },
          { type: "text", text: "up", marks: [{ type: "bold" }] },
          { type: "text", text: " with " },
          { type: "text", text: "growth", marks: [{ type: "code" }] },
          { type: "text", text: " and a " },
          {
            type: "text",
            text: "link",
            marks: [{ type: "link", attrs: { href: "https://x.com" } }],
          },
          { type: "text", text: "." },
        ],
      },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "one" }] },
            ],
          },
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "two" }] },
            ],
          },
        ],
      },
    ]);
  });

  it("renders a fenced code block", () => {
    const { document } = conversationToDocument([
      agentText("```sql\nSELECT 1\n```"),
    ]);
    expect(document.content).toEqual([
      {
        type: "codeBlock",
        attrs: { language: "sql" },
        content: [{ type: "text", text: "SELECT 1" }],
      },
    ]);
  });

  it("embeds a saved chart (static_viz) as a resizeNode-wrapped cardEmbed", () => {
    const { document, cards } = conversationToDocument([
      {
        id: "a1",
        role: "agent",
        type: "data_part",
        part: { type: "static_viz", version: 1, value: { entity_id: 42 } },
      },
    ]);
    expect(document.content).toEqual([
      {
        type: "resizeNode",
        content: [{ type: "cardEmbed", attrs: { id: 42 } }],
      },
    ]);
    expect(cards).toEqual({});
  });

  it("embeds an ad-hoc chart (adhoc_viz) as a live preview backed by a draft card", () => {
    const card = createMockCard({ id: 7, name: "Original", display: "bar" });
    const link = `/question#${serializeCardForUrl(card)}`;

    const { document, cards } = conversationToDocument([
      {
        id: "a1",
        role: "agent",
        type: "data_part",
        part: {
          type: "adhoc_viz",
          version: 1,
          value: { query: {}, link, title: "Sales" },
        },
      },
    ]);

    expect(document.content).toEqual([
      {
        type: "resizeNode",
        content: [{ type: "cardEmbed", attrs: { id: -1 } }],
      },
    ]);
    // The decoded card is registered under its negative draft id, renamed to
    // the chart's title.
    expect(cards[-1]).toMatchObject({ id: -1, name: "Sales", display: "bar" });
  });

  it("falls back to a link when an ad-hoc chart link can't be decoded", () => {
    const { document, cards } = conversationToDocument([
      {
        id: "a1",
        role: "agent",
        type: "data_part",
        part: {
          type: "adhoc_viz",
          version: 1,
          value: {
            query: {},
            link: "/question#not-base64-json",
            title: "Sales",
          },
        },
      },
    ]);
    expect(document.content).toEqual([
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Sales",
            marks: [
              { type: "link", attrs: { href: "/question#not-base64-json" } },
            ],
          },
        ],
      },
    ]);
    expect(cards).toEqual({});
  });

  it("renders an automagic_dashboard as a link paragraph", () => {
    const { document } = conversationToDocument([
      {
        id: "a1",
        role: "agent",
        type: "data_part",
        part: {
          type: "automagic_dashboard",
          version: 1,
          value: { url: "/auto/dashboard/1", title: "X-ray" },
        },
      },
    ]);
    expect(document.content?.[0]).toMatchObject({
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "X-ray",
          marks: [{ type: "link", attrs: { href: "/auto/dashboard/1" } }],
        },
      ],
    });
  });

  it("skips chat-only messages (tool calls, aborts, errors)", () => {
    const { document } = conversationToDocument([
      {
        id: "t1",
        role: "agent",
        type: "tool_call",
        name: "analyze_data",
        status: "ended",
      },
      { id: "x1", role: "agent", type: "turn_aborted" },
      {
        id: "e1",
        role: "agent",
        type: "turn_errored",
        error: { message: "boom" },
      },
    ]);
    expect(document.content).toEqual([{ type: "paragraph" }]);
  });
});

describe("modelAuthoredDocument", () => {
  it("turns the authored markdown into document blocks (not a chat transcript)", () => {
    const { document } = modelAuthoredDocument(
      "# Sales\n\nRevenue is **up**.",
      [userText("show sales"), agentText("ok")],
    );
    expect(document.content).toEqual([
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Sales" }],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Revenue is " },
          { type: "text", text: "up", marks: [{ type: "bold" }] },
          { type: "text", text: "." },
        ],
      },
    ]);
  });

  it("resolves a [[chart:N]] placeholder to the Nth chart in conversation order", () => {
    const { document } = modelAuthoredDocument(
      "Intro.\n\n[[chart:2]]\n\nOutro.",
      [staticViz("c1", 11), agentText("note"), staticViz("c2", 22)],
    );
    expect(document.content).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "Intro." }] },
      {
        type: "resizeNode",
        content: [{ type: "cardEmbed", attrs: { id: 22 } }],
      },
      { type: "paragraph", content: [{ type: "text", text: "Outro." }] },
    ]);
  });

  it("drops placeholders that reference a chart that doesn't exist", () => {
    const { document } = modelAuthoredDocument("[[chart:5]]\n\nText.", [
      staticViz("c1", 11),
    ]);
    expect(document.content).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "Text." }] },
    ]);
  });

  it("returns a single empty paragraph when content is blank", () => {
    expect(modelAuthoredDocument("", []).document).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
  });
});

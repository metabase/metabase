import type { JSONContent } from "@tiptap/core";

interface SlidePreview {
  heading: string | null;
  body: string;
  hasChart: boolean;
  chartCount: number;
}

const collectText = (node: JSONContent): string => {
  if (node.type === "text") {
    return node.text ?? "";
  }
  if (!node.content) {
    return "";
  }
  return node.content.map(collectText).join("");
};

export const previewSlide = (doc: JSONContent | null | undefined): SlidePreview => {
  let heading: string | null = null;
  const bodyParts: string[] = [];
  let chartCount = 0;

  if (doc?.content) {
    for (const node of doc.content) {
      if (node.type === "heading" && heading === null) {
        heading = collectText(node).trim() || null;
      } else if (node.type === "paragraph") {
        const t = collectText(node).trim();
        if (t) {
          bodyParts.push(t);
        }
      } else if (node.type === "bulletList" || node.type === "orderedList") {
        for (const item of node.content ?? []) {
          const t = collectText(item).trim();
          if (t) {
            bodyParts.push(`• ${t}`);
          }
        }
      } else if (
        node.type === "cardEmbed" ||
        node.type === "resizeNode" ||
        node.type === "flexContainer"
      ) {
        chartCount += 1;
      }
    }
  }

  return {
    heading,
    body: bodyParts.join(" · "),
    hasChart: chartCount > 0,
    chartCount,
  };
};

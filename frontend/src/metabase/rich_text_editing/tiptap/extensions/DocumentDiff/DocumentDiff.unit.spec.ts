import { Editor } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";

import { DocumentDiff } from "./DocumentDiff";
import { diffBlocks } from "./diff";
import { buildReviewContent } from "./review-doc";

const para = (text: string) => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});

describe("DocumentDiff extension (headless TipTap)", () => {
  it("registers the insertion/deletion marks and renders the review diff", () => {
    const editor = new Editor({
      extensions: [
        StarterKit,
        DocumentDiff.configure({ onResolveChange: () => {} }),
      ],
      content: { type: "doc", content: [para("x")] },
    });

    const diff = diffBlocks([para("old body")], [para("new body")]);
    editor.commands.setContent({
      type: "doc",
      content: buildReviewContent(diff),
    });

    const html = editor.getHTML();
    // Both the removed and the added block render with their diff markers.
    expect(html).toContain('data-diff="deletion"');
    expect(html).toContain('data-diff="insertion"');
    expect(html).toContain("old body");
    expect(html).toContain("new body");

    editor.destroy();
  });

  it("mounts cleanly when there is nothing to review", () => {
    const editor = new Editor({
      extensions: [
        StarterKit,
        DocumentDiff.configure({ onResolveChange: () => {} }),
      ],
      content: { type: "doc", content: [para("unchanged")] },
    });
    expect(editor.getHTML()).toContain("unchanged");
    expect(editor.getHTML()).not.toContain("data-diff");
    editor.destroy();
  });
});

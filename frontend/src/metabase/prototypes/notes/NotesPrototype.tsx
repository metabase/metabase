import { Marked } from "marked";
import { render as renderDiagram } from "pele";

import { Box } from "metabase/ui";

import S from "./Notes.module.css";
import notes from "./notes.md";

// Markdown with raw HTML mixed in: marked passes HTML blocks and inline tags
// through, so the notes can use classes the stylesheet knows (callout, note).
// ```mermaid fences become SVG diagrams, themed through --pele-* variables.
const NOTES_HTML = new Marked({
  async: false,
  gfm: true,
  renderer: {
    code({ text, lang }) {
      if (lang !== "mermaid") {
        return false;
      }
      const { svg } = renderDiagram(text, { fontFamily: "Lato, sans-serif" });
      return `<div class="diagram">${svg}</div>`;
    },
  },
}).parse(notes, { async: false });

/** Design notes behind the prototypes, written in notes.md. */
export function NotesPrototype() {
  return (
    <Box
      className={S.notes}
      maw="52rem"
      // Our own file, not user input.
      dangerouslySetInnerHTML={{ __html: NOTES_HTML }}
    />
  );
}

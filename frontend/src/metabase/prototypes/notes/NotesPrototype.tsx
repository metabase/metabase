import { marked } from "marked";

import { Box } from "metabase/ui";

import S from "./Notes.module.css";
import notes from "./notes.md";

// Markdown with raw HTML mixed in: marked passes HTML blocks and inline tags
// through, so the notes can use classes the stylesheet knows (callout, note).
const NOTES_HTML = marked.parse(notes, { async: false, gfm: true });

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

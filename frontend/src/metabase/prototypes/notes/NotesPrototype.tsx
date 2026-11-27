import { Marked } from "marked";
import { render as renderDiagram } from "pele";
import { type MouseEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Box } from "metabase/ui";

import S from "./Notes.module.css";
import { NOTES_QUERIES } from "./NotesQueries";
import notes from "./notes.md";

// Markdown with raw HTML mixed in: marked passes HTML blocks and inline tags
// through, so the notes can use classes the stylesheet knows (callout, note).
// ```mermaid fences become SVG diagrams, themed through --pele-* variables.
const NOTES_HTML = new Marked({
  async: false,
  gfm: true,
  renderer: {
    // marked dropped heading ids; the table of contents links to them.
    heading({ tokens, depth, text }) {
      const id = text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-|-$/g, "");
      return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
    },
    code({ text, lang }) {
      if (lang !== "mermaid") {
        return false;
      }
      const { svg } = renderDiagram(text, { fontFamily: "Lato, sans-serif" });
      return `<div class="diagram">${svg}</div>`;
    },
  },
}).parse(notes, { async: false });

function scrollToHash(hash: string, behavior: ScrollBehavior) {
  document
    .getElementById(decodeURIComponent(hash.slice(1)))
    ?.scrollIntoView({ behavior, block: "start" });
}

// The app's <base href> resolves "#id" to the root URL, so in-page links
// set the hash on the current URL and scroll here instead of navigating.
function handleAnchorClick(event: MouseEvent<HTMLDivElement>) {
  if (!(event.target instanceof Element)) {
    return;
  }
  const hash = event.target.closest("a")?.getAttribute("href");
  if (!hash?.startsWith("#")) {
    return;
  }
  event.preventDefault();
  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${window.location.search}${hash}`,
  );
  scrollToHash(hash, "smooth");
}

/** Design notes behind the prototypes, written in notes.md. */
export function NotesPrototype() {
  const notesRef = useRef<HTMLDivElement>(null);
  const [querySlots, setQuerySlots] = useState<Element[]>([]);

  useEffect(() => {
    if (notesRef.current) {
      setQuerySlots(
        Array.from(notesRef.current.querySelectorAll("[data-query]")),
      );
    }
    if (window.location.hash) {
      scrollToHash(window.location.hash, "auto");
    }
  }, []);

  return (
    <>
      <Box
        ref={notesRef}
        className={S.notes}
        maw="52rem"
        onClick={handleAnchorClick}
        // Our own file, not user input.
        dangerouslySetInnerHTML={{ __html: NOTES_HTML }}
      />
      {/* The HTML string never changes, so React leaves these nodes alone. */}
      {querySlots.map((slot) => {
        const QueryBlock = NOTES_QUERIES[slot.getAttribute("data-query") ?? ""];
        return QueryBlock ? createPortal(<QueryBlock />, slot) : null;
      })}
    </>
  );
}

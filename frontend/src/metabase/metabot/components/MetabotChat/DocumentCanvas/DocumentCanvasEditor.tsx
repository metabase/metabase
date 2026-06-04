import type { JSONContent } from "@tiptap/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { Editor } from "metabase/documents/components/Editor";
import {
  type BlockDiff,
  DocumentDiff,
  buildReviewContent,
  diffBlocks,
  hasPendingChanges,
  resolveAll,
  resolveChange,
  toContent,
} from "metabase/rich_text_editing/tiptap/extensions/DocumentDiff";
import { Box, Button, Group, Text } from "metabase/ui";

const asDoc = (content: JSONContent[]): JSONContent => ({
  type: "doc",
  content: content.length > 0 ? content : [{ type: "paragraph" }],
});

interface DocumentCanvasEditorProps {
  /** The initial document content. Used as the diff base; not re-applied on
   * every keystroke (the editor is uncontrolled after mount to keep the cursor
   * stable while typing). */
  content: JSONContent;
  /**
   * A model-proposed revision. When set, the editor enters read-only review mode
   * showing the tracked-changes diff against the latest content.
   */
  proposedDoc?: JSONContent | null;
  editable?: boolean;
  /** Fired when the user edits the document directly (debounced upstream). */
  onManualChange?: (content: JSONContent) => void;
  /** Fired with the resolved content once every change is accepted/rejected. */
  onReviewResolved?: (content: JSONContent) => void;
}

export function DocumentCanvasEditor({
  content,
  proposedDoc,
  editable = false,
  onManualChange,
  onReviewResolved,
}: DocumentCanvasEditorProps) {
  // The latest accepted content (updated by manual edits) — the base we diff a
  // proposal against. A ref so typing doesn't churn the editor.
  const currentRef = useRef<JSONContent>(content);
  // What the editor displays. Only changes on review transitions, never on a
  // manual keystroke, so the caret stays put while editing.
  const [displayContent, setDisplayContent] = useState<JSONContent>(content);
  const [reviewDiff, setReviewDiff] = useState<BlockDiff | null>(null);

  // Enter / leave review mode as a proposal arrives or clears.
  useEffect(() => {
    if (proposedDoc) {
      const diff = diffBlocks(
        currentRef.current.content ?? [],
        proposedDoc.content ?? [],
      );
      setReviewDiff(diff);
      setDisplayContent(asDoc(buildReviewContent(diff)));
    } else {
      setReviewDiff(null);
    }
  }, [proposedDoc]);

  const finalize = (diff: BlockDiff) => {
    const final = asDoc(toContent(diff));
    currentRef.current = final;
    setReviewDiff(null);
    setDisplayContent(final);
    onReviewResolved?.(final);
  };

  // The extension is created once; route its per-change callback through a ref
  // so it always sees the latest review state.
  const resolveRef = useRef<(changeId: number, accept: boolean) => void>(
    () => {},
  );
  resolveRef.current = (changeId, accept) => {
    if (!reviewDiff) {
      return;
    }
    const next = resolveChange(reviewDiff, changeId, accept);
    if (hasPendingChanges(next)) {
      setReviewDiff(next);
      setDisplayContent(asDoc(buildReviewContent(next)));
    } else {
      finalize(next);
    }
  };

  const extraExtensions = useMemo(
    () => [
      DocumentDiff.configure({
        onResolveChange: (changeId, accept) =>
          resolveRef.current(changeId, accept),
      }),
    ],
    [],
  );

  const inReview = reviewDiff != null;

  return (
    <Box>
      {inReview && (
        <Group
          justify="space-between"
          align="center"
          px="md"
          py="sm"
          bg="background-secondary"
          style={{ borderBottom: "1px solid var(--mb-color-border)" }}
        >
          <Text size="sm" c="text-secondary">
            {t`Review suggested changes`}
          </Text>
          <Group gap="xs">
            <Button
              size="xs"
              variant="subtle"
              onClick={() => finalize(resolveAll(reviewDiff, false))}
            >
              {t`Undo`}
            </Button>
            <Button
              size="xs"
              onClick={() => finalize(resolveAll(reviewDiff, true))}
            >
              {t`Accept all`}
            </Button>
          </Group>
        </Group>
      )}
      <Editor
        initialContent={displayContent}
        editable={editable && !inReview}
        extraExtensions={extraExtensions}
        onChange={(updated) => {
          if (!inReview) {
            currentRef.current = updated;
            onManualChange?.(updated);
          }
        }}
      />
    </Box>
  );
}

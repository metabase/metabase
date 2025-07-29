import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { Placeholder } from "@tiptap/extension-placeholder";
import {
  EditorContent,
  type Editor as TiptapEditor,
  useEditor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import cx from "classnames";
import type React from "react";
import { useEffect, useRef } from "react";
import { t } from "ttag";

import { DND_IGNORE_CLASS_NAME } from "metabase/common/components/dnd";
import CS from "metabase/css/core/index.css";
import { useDispatch } from "metabase/lib/redux";
import { Box } from "metabase/ui";

import styles from "./Editor.module.css";
import { QuestionMentionPlugin } from "./QuestionMentionPlugin";
import { CardEmbed } from "./extensions/CardEmbed";
import { SmartLinkEmbed } from "./extensions/SmartLink";
import { Markdown } from "./extensions/markdown/index";
import { useCardEmbedsTracking, useQuestionSelection } from "./hooks";
import type { CardEmbedRef } from "./types";

interface EditorProps {
  onEditorReady?: (editor: TiptapEditor) => void;
  onCardEmbedsChange?: (refs: CardEmbedRef[]) => void;
  content: string;
  onQuestionSelect?: (cardId: number | null) => void;
  editable?: boolean;
}

export const Editor: React.FC<EditorProps> = ({
  onEditorReady,
  onCardEmbedsChange,
  content = "",
  editable = true,
  onQuestionSelect,
}) => {
  const dispatch = useDispatch();

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({
        inline: false,
        HTMLAttributes: {
          class: styles.img,
        },
      }),
      Link.configure({
        HTMLAttributes: {
          class: CS.link,
        },
      }),
      Placeholder.configure({
        placeholder: t`Start writing, press "/" to insert a chart, or "@" to insert a reference...`,
      }),
      Markdown,
      CardEmbed.configure({
        HTMLAttributes: {
          class: "card-embed",
        },
      }),
      SmartLinkEmbed.configure({
        HTMLAttributes: {
          class: "smart-link",
        },
      }),
    ],
    autofocus: true,
  });

  // Initialize content only once when editor is ready
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (editor && content && !editor.isDestroyed && !hasInitialized.current) {
      // Use storage method directly to avoid command timing issues
      try {
        editor.storage.markdown.setMarkdown(content);
        hasInitialized.current = true;
      } catch (error) {
        console.error("Failed to set initial markdown content:", error);
        // Fallback to setting content as HTML if markdown parsing fails
        editor.commands.setContent(content);
        hasInitialized.current = true;
      }
    }
  }, [editor, content]);

  // Update editor editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  useCardEmbedsTracking(editor, dispatch, onCardEmbedsChange);
  useQuestionSelection(editor, onQuestionSelect);

  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor);
    }
  }, [editor, onEditorReady]);

  if (!editor) {
    return null;
  }

  return (
    <Box className={cx(styles.editor, DND_IGNORE_CLASS_NAME)}>
      <Box
        className={styles.editorContent}
        onClick={(e) => {
          // Focus editor when clicking on empty space
          const target = e.target as HTMLElement;
          if (
            target.classList.contains(styles.editorContent) ||
            target.classList.contains("ProseMirror")
          ) {
            const clickY = e.clientY;
            const proseMirrorElement = target.querySelector(".ProseMirror");

            if (proseMirrorElement) {
              const proseMirrorRect =
                proseMirrorElement.getBoundingClientRect();
              const isClickBelowContent = clickY > proseMirrorRect.bottom;

              if (isClickBelowContent) {
                // Only move to end if clicking below the actual content
                editor.commands.focus("end");
              } else {
                // Just focus without changing cursor position for clicks in padding areas
                editor.commands.focus();
              }
            } else {
              // Fallback: just focus without position change
              editor.commands.focus();
            }
          }
        }}
      >
        <EditorContent editor={editor} />
        <QuestionMentionPlugin editor={editor} />
      </Box>
    </Box>
  );
};

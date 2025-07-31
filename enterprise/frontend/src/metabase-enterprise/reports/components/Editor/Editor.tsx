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
import { Box, Loader } from "metabase/ui";

import styles from "./Editor.module.css";
import { QuestionMentionPlugin } from "./QuestionMentionPlugin";
import { CardEmbed } from "./extensions/CardEmbed";
import { MetabotNode } from "./extensions/MetabotEmbed";
import { SmartLinkEmbed } from "./extensions/SmartLink";
import { Markdown } from "./extensions/markdown/index";
import { useCardEmbedsTracking, useQuestionSelection } from "./hooks";
import type { CardEmbedRef } from "./types";

interface EditorProps {
  onEditorReady?: (editor: TiptapEditor) => void;
  onCardEmbedsChange?: (refs: CardEmbedRef[]) => void;
  content: string;
  onChange?: (content: string) => void;
  onQuestionSelect?: (cardId: number | null) => void;
  editable?: boolean;
  isLoading?: boolean;
}

export const Editor: React.FC<EditorProps> = ({
  onEditorReady,
  onCardEmbedsChange,
  content,
  onChange,
  editable = true,
  onQuestionSelect,
  isLoading = false,
}) => {
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
      MetabotNode,
    ],
    autofocus: true,
    immediatelyRender: false,
  });

  // Track the previous content to avoid unnecessary updates
  const previousContent = useRef<string>("");

  // Update editor content when content prop changes
  useEffect(() => {
    if (editor && !editor.isDestroyed && content !== previousContent.current) {
      // Use microtask to defer content update and avoid flushSync warning
      queueMicrotask(() => {
        if (editor.isDestroyed) {
          return;
        }

        try {
          if (!content || content.trim() === "") {
            editor.commands.setContent("");
          } else {
            // Expect JSON AST format
            const parsedContent = JSON.parse(content);
            editor.commands.setContent(parsedContent);
          }
          previousContent.current = content;
        } catch (error) {
          console.error("Failed to parse JSON AST content:", error);
          // Set empty document if JSON parsing fails
          editor.commands.setContent("");
          previousContent.current = content;
        }
      });
    }
  }, [editor, content]);

  // Notify parent when editor is ready
  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor);
    }
  }, [editor, onEditorReady]);

  // Set up change handler
  useEffect(() => {
    if (!editor || !onChange) {
      return;
    }

    const handleUpdate = () => {
      const currentAst = JSON.stringify(editor.state.doc.toJSON());
      onChange(currentAst);
    };

    editor.on("update", handleUpdate);

    return () => {
      editor.off("update", handleUpdate);
    };
  }, [editor, onChange]);

  // Update editor editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  useCardEmbedsTracking(editor, onCardEmbedsChange);
  useQuestionSelection(editor, onQuestionSelect);

  if (!editor) {
    return null;
  }

  if (isLoading) {
    return (
      <Box className={cx(styles.editor, DND_IGNORE_CLASS_NAME)}>
        <Loader />
      </Box>
    );
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

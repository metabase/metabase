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
import { useEffect } from "react";
import { t } from "ttag";

import { DND_IGNORE_CLASS_NAME } from "metabase/common/components/dnd";
import CS from "metabase/css/core/index.css";
import { useDispatch } from "metabase/lib/redux";
import { Box } from "metabase/ui";

import styles from "./Editor.module.css";
import { QuestionMentionPlugin } from "./QuestionMentionPlugin";
import { CardEmbed } from "./extensions/CardEmbed";
import { CardStaticNode } from "./extensions/CardStatic/CardStatic";
import { ColumnExtension } from "./extensions/Columns/Columns";
import {
  MarkdownSerializer,
  serializeToMarkdown,
} from "./extensions/MarkdownExtensions";
import { SmartLinkEmbed } from "./extensions/SmartLink";
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
        placeholder: t`Start writing, press "/" for commands, or "@" to insert a reference...`,
      }),
      CardEmbed.configure({
        HTMLAttributes: {
          class: "card-embed",
        },
      }),
      CardStaticNode,
      SmartLinkEmbed.configure({
        HTMLAttributes: {
          class: "smart-link",
        },
      }),
      MarkdownSerializer,
      ColumnExtension,
    ],
    content,
    autofocus: true,
  });

  // Update editor content when content prop changes
  useEffect(() => {
    if (editor && content != null) {
      (
        editor.commands as unknown as { setMarkdown: (content: string) => void }
      ).setMarkdown(content);
    }

    editor.setEditable(editable);
  }, [editor, content, editable]);

  useCardEmbedsTracking(editor, dispatch, onCardEmbedsChange);
  useQuestionSelection(editor, onQuestionSelect);

  // Notify parent when editor is ready
  useEffect(() => {
    if (editor && onEditorReady) {
      // Add getMarkdown method to storage for easy access
      (
        editor.storage as unknown as { markdown: { getMarkdown: () => string } }
      ).markdown = {
        getMarkdown: () => {
          const markdown = serializeToMarkdown(editor.state.doc);
          return markdown;
        },
      };
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

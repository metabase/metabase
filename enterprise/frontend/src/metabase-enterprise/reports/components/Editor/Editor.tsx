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
import _ from "underscore";

import { DND_IGNORE_CLASS_NAME } from "metabase/common/components/dnd";
import CS from "metabase/css/core/index.css";
import { Box } from "metabase/ui";

import type { QuestionEmbed as QuestionEmbedType } from "../../reports.slice";

import styles from "./Editor.module.css";
import { QuestionMentionPlugin } from "./QuestionMentionPlugin";
import { ColumnExtension } from "./extensions/Columns/Columns";
import {
  MarkdownSerializer,
  serializeToMarkdown,
} from "./extensions/MarkdownExtensions";
import { QuestionEmbed } from "./extensions/QuestionEmbed";
import { QuestionStaticNode } from "./extensions/QuestionStatic/QuestionStatic";
import { SmartLinkEmbed } from "./extensions/SmartLink";

interface EditorProps {
  onEditorReady?: (editor: TiptapEditor) => void;
  onQuestionRefsChange?: (refs: QuestionEmbedType[]) => void;
  content: string;
  editable?: boolean;
}

export const Editor: React.FC<EditorProps> = ({
  onEditorReady,
  onQuestionRefsChange,
  content = "",
  editable = true,
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
      QuestionEmbed.configure({
        HTMLAttributes: {
          class: "question-embed",
        },
      }),
      QuestionStaticNode,
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

  // Track question references
  useEffect(() => {
    if (!editor || !onQuestionRefsChange) {
      return;
    }

    const updateQuestionRefs = () => {
      const refs = getRefs(editor);
      onQuestionRefsChange(refs);
    };
    updateQuestionRefs();

    editor.on("update", updateQuestionRefs);

    return () => {
      editor.off("update", updateQuestionRefs);
    };
  }, [editor, onQuestionRefsChange]);

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

const getRefs = (editor: TiptapEditor): QuestionEmbedType[] => {
  const refs: QuestionEmbedType[] = [];

  editor.state.doc.descendants((node: any) => {
    if (node.type.name === "questionEmbed") {
      refs.push({
        id: node.attrs.questionId,
        name: node.attrs.customName || node.attrs.questionName,
        snapshotId: node.attrs.snapshotId,
      });
    }
    if (node.type.name === "questionStatic") {
      // Assign an ID, but only once
      if (!node.attrs.id) {
        node.attrs.id = `static-${_.uniqueId()}`;
        node.attrs.snapshotId = `static-${_.uniqueId()}`;
      }
      const { questionName, id, snapshotId } = node.attrs;

      refs.push({
        id: id,
        name: questionName,
        snapshotId,
      });
    }
  });
  return refs;
};

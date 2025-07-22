import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type React from "react";
import { useEffect } from "react";

import { Box } from "metabase/ui";

import styles from "./Editor.module.css";
import { QuestionMentionPlugin } from "./QuestionMentionPlugin";
import {
  MarkdownSerializer,
  serializeToMarkdown,
} from "./extensions/MarkdownExtensions";
import { QuestionEmbed } from "./extensions/QuestionEmbed";

interface EditorProps {
  onEditorReady?: (editor: any) => void;
  onQuestionRefsChange?: (refs: Array<{ id: number; name: string }>) => void;
  content: string;
  onQuestionSelect?: (questionId: number | null) => void;
}

export const Editor: React.FC<EditorProps> = ({
  onEditorReady,
  onQuestionRefsChange,
  content = "",
  onQuestionSelect,
}) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      QuestionEmbed.configure({
        HTMLAttributes: {
          class: "question-embed",
        },
      }),
      MarkdownSerializer,
    ],
    content,
    autofocus: true,
  });

  // Track question references
  useEffect(() => {
    if (!editor || !onQuestionRefsChange) {
      return;
    }

    const updateQuestionRefs = () => {
      const refs: Array<{ id: number; name: string }> = [];
      editor.state.doc.descendants((node) => {
        if (node.type.name === "questionEmbed") {
          refs.push({
            id: node.attrs.questionId,
            name: node.attrs.customName || node.attrs.questionName,
          });
        }
      });
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
      editor.storage.markdown = {
        getMarkdown: () => {
          const markdown = serializeToMarkdown(editor.state.doc);
          return markdown;
        },
      };
      onEditorReady(editor);
    }
  }, [editor, onEditorReady]);

  // Track selection changes to detect when a question embed is selected
  useEffect(() => {
    if (!editor || !onQuestionSelect) {
      return;
    }

    const updateSelection = () => {
      const { selection } = editor.state;
      const node = editor.state.doc.nodeAt(selection.from);

      if (node && node.type.name === "questionEmbed") {
        onQuestionSelect(node.attrs.questionId);
      } else {
        // Check if selection is inside a question embed
        let foundQuestionId: number | null = null;
        editor.state.doc.nodesBetween(selection.from, selection.to, (node) => {
          if (node.type.name === "questionEmbed") {
            foundQuestionId = node.attrs.questionId;
            return false;
          }
        });
        onQuestionSelect(foundQuestionId);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Clear selection by moving cursor to end of document
        editor.commands.focus("end");
        onQuestionSelect(null);
      }
    };

    updateSelection();
    editor.on("selectionUpdate", updateSelection);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      editor.off("selectionUpdate", updateSelection);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [editor, onQuestionSelect]);

  if (!editor) {
    return null;
  }

  return (
    <Box className={styles.editor}>
      <Box
        className={styles.editorContent}
        onClick={(e) => {
          // Focus editor when clicking on empty space
          const target = e.target as HTMLElement;
          if (
            target.classList.contains(styles.editorContent) ||
            target.classList.contains("ProseMirror")
          ) {
            editor.commands.focus("end");
          }
        }}
      >
        <EditorContent editor={editor} />
        <QuestionMentionPlugin editor={editor} />
      </Box>
    </Box>
  );
};

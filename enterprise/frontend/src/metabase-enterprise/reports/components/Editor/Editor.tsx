import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type React from "react";

import { Box } from "metabase/ui";

import styles from "./Editor.module.css";
import { EditorToolbar } from "./EditorToolbar";

export const Editor: React.FC = () => {
  const editor = useEditor({
    extensions: [StarterKit],
    content: "<p>Start writing your report...</p>",
    autofocus: true,
  });

  if (!editor) {
    return null;
  }

  return (
    <Box className={styles.editor}>
      <EditorToolbar editor={editor} />
      <Box className={styles.editorContent}>
        <EditorContent editor={editor} />
      </Box>
    </Box>
  );
};

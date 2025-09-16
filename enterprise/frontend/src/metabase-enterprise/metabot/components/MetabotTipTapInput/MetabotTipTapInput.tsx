import { Placeholder } from "@tiptap/extension-placeholder";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import cx from "classnames";
import { useEffect, useMemo } from "react";
import { t } from "ttag";

import { Box, Icon } from "metabase/ui";

import styles from "./MetabotTipTapInput.module.css";

interface MetabotTipTapInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  isLoading?: boolean;
  inputRef?: React.RefObject<TiptapEditor | null>;
}

export const MetabotTipTapInput = ({
  value,
  onChange,
  onSubmit,
  isLoading = false,
  inputRef,
}: MetabotTipTapInputProps) => {
  // Configure minimal extensions for chat input
  const extensions = useMemo(
    () => [
      StarterKit.configure({
        // Disable unwanted extensions from StarterKit
        blockquote: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        heading: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        bold: false,
        italic: false,
        strike: false,
      }),
      Placeholder.configure({
        placeholder: t`Tell me to do something, or ask a question`,
      }),
    ],
    [],
  );

  const editor = useEditor({
    extensions,
    content: value || "",
    editable: !isLoading,
    immediatelyRender: false,
    autofocus: true,
    onUpdate: ({ editor }) => {
      // For now, just get plain text
      const text = editor.getText();
      onChange(text);
    },
    editorProps: {
      handleKeyDown: (view, event) => {
        // Handle Enter key for submit (without Shift)
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
          const text = view.state.doc.textContent;
          if (text.trim()) {
            event.preventDefault();
            onSubmit(text);
            // Clear the editor after submit
            editor?.commands.clearContent();
            return true;
          }
        }
        return false;
      },
    },
  });

  // Update ref if provided
  useEffect(() => {
    if (inputRef && editor) {
      (inputRef as any).current = editor;
    }
  }, [editor, inputRef]);

  // Sync external value changes to editor
  useEffect(() => {
    if (editor && value !== editor.getText()) {
      editor.commands.setContent(value);
    }
  }, [editor, value]);

  // Handle loading state
  useEffect(() => {
    if (editor) {
      editor.setEditable(!isLoading);
    }
  }, [editor, isLoading]);

  if (!editor) {
    return null;
  }

  return (
    <Box className={cx(styles.inputContainer, isLoading && styles.loading)}>
      <Box className={styles.iconContainer}>
        <Icon name="metabot" c="brand" />
      </Box>
      <EditorContent
        editor={editor}
        className={styles.editorContent}
        data-testid="metabot-tiptap-input"
      />
    </Box>
  );
};

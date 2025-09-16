import { Placeholder } from "@tiptap/extension-placeholder";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import cx from "classnames";
import { useEffect, useMemo } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { Box, Icon } from "metabase/ui";

import {
  parseMetabotFormat,
  serializeToMetabotFormat,
} from "../../utils/metabotMessageSerializer";
import { MetabotSmartLink } from "../MetabotSmartLink";

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
  const siteUrl = useSelector((state) => getSetting(state, "site-url"));

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
      MetabotSmartLink.configure({
        siteUrl,
        HTMLAttributes: {
          class: styles.smartLink,
        },
      }),
    ],
    [siteUrl],
  );

  const editor = useEditor({
    extensions,
    content: value || "",
    editable: !isLoading,
    immediatelyRender: false,
    autofocus: true,
    onUpdate: ({ editor }) => {
      // Serialize to string format for state management
      const jsonContent = editor.getJSON();
      const serialized = serializeToMetabotFormat(jsonContent);
      onChange(serialized);
    },
    editorProps: {
      handleKeyDown: (view, event) => {
        // Handle Enter key for submit (without Shift)
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
          const jsonContent = editor?.getJSON();
          if (jsonContent) {
            const serialized = serializeToMetabotFormat(jsonContent);
            if (serialized.trim()) {
              event.preventDefault();
              onSubmit(serialized);
              // Clear the editor after submit
              editor?.commands.clearContent();
              return true;
            }
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

  // Temporary: Expose editor for testing SmartLink functionality
  useEffect(() => {
    if (editor && typeof window !== "undefined") {
      (window as any).__metabotTipTapEditor = editor;
    }
    return () => {
      if (typeof window !== "undefined") {
        delete (window as any).__metabotTipTapEditor;
      }
    };
  }, [editor]);

  // Sync external value changes to editor
  useEffect(() => {
    if (editor && value) {
      // Check if we need to update - compare serialized content
      const currentSerialized = serializeToMetabotFormat(editor.getJSON());
      if (value !== currentSerialized) {
        // If value looks like it contains metabase:// links, parse it
        if (value.includes("metabase://")) {
          editor.commands.setContent(parseMetabotFormat(value));
        } else {
          // Plain text
          editor.commands.setContent(value);
        }
      }
    } else if (editor && !value) {
      editor.commands.clearContent();
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

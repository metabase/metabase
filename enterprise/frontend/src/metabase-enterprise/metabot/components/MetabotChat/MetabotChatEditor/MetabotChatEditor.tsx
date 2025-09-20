import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import Paragraph from "@tiptap/extension-paragraph";
import { Placeholder } from "@tiptap/extension-placeholder";
import Text from "@tiptap/extension-text";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import cx from "classnames";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { Box, Icon } from "metabase/ui";
import { MetabotMentionSuggestion } from "metabase-enterprise/rich_text_editing/tiptap/extensions/MetabotMention/MetabotSuggestion";

import S from "./MetabotChatEditor.module.css";
import {
  MetabotMentionExtension,
  MetabotMentionPluginKey,
} from "./MetabotMentionExtension";
import { MetabotSmartLink } from "./MetabotSmartLink";
import {
  parseMetabotFormat,
  serializeToMetabotFormat,
} from "./metabotMessageSerializer";
import { createMetabotSuggestionRenderer } from "./metabotSuggestionRenderer";

interface Props {
  value: string;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export const MetabotChatEditor = forwardRef<Editor | null, Props>(
  (
    {
      value,
      placeholder = t`Tell me to do something, or ask a question`,
      autoFocus = false,
      disabled = false,
      onChange,
      onSubmit,
    },
    ref,
  ) => {
    const siteUrl = useSelector((state) => getSetting(state, "site-url"));

    // Use refs to avoid recreating the editor when callbacks change - not doing so prepends all characters
    const onChangeRef = useRef(onChange);
    const onSubmitRef = useRef(onSubmit);
    useEffect(() => {
      onChangeRef.current = onChange;
      onSubmitRef.current = onSubmit;
    });

    const extensions = [
      Document,
      Paragraph,
      Text,
      Placeholder.configure({ placeholder }),
      HardBreak,

      MetabotSmartLink.configure({
        siteUrl,
        HTMLAttributes: { class: S.smartLink },
      }),
      MetabotMentionExtension.configure({
        suggestion: {
          render: createMetabotSuggestionRenderer(MetabotMentionSuggestion),
        },
      }),
    ];

    const editor = useEditor(
      {
        extensions,
        content: value,
        autofocus: autoFocus,
        editable: !disabled,
        immediatelyRender: false,
        onUpdate: ({ editor }) => {
          const jsonContent = editor.getJSON();
          const serialized = serializeToMetabotFormat(jsonContent);
          onChangeRef.current(serialized);
        },
        editorProps: {
          handleKeyDown: (view, event) => {
            if (event.key === "Enter") {
              // Defer enter handling to mention UI if open
              const mentionState = MetabotMentionPluginKey.getState(view.state);
              if (mentionState?.active) {
                return false; // Let the suggestion system handle it
              }

              // Check for any modifier keys (shift, ctrl, meta, alt)
              const isModifiedKeyPress =
                event.shiftKey ||
                event.ctrlKey ||
                event.metaKey ||
                event.altKey;

              if (!isModifiedKeyPress) {
                event.preventDefault();
                onSubmitRef.current();
                return true;
              }
            }

            return false;
          },
        },
      },
      [disabled],
    );

    useEffect(() => {
      if (editor && editor.getText() !== value) {
        editor.commands.setContent(value);
      }
    }, [editor, value]);

    useImperativeHandle(ref, () => {
      if (!editor) {
        return null;
      }

      // Return the editor with a focus method that matches the expected API
      return Object.assign(editor, {
        focus: () => editor.commands.focus("end"),
      });
    }, [editor]);

    // Sync external value changes to editor
    useEffect(() => {
      if (!editor) {
        return;
      }

      // Check if we need to update - compare serialized content
      const currentSerialized = serializeToMetabotFormat(editor.getJSON());
      if (value && value !== currentSerialized) {
        // TODO: move includes check into parse function
        // If value looks like it contains metabase:// links, parse it
        const nextContent = value.includes("metabase://")
          ? parseMetabotFormat(value)
          : value;
        editor.commands.setContent(nextContent);
      } else if (!value && currentSerialized) {
        editor.commands.clearContent();
      }
    }, [editor, value]);

    if (!editor) {
      return null;
    }

    return (
      <Box className={S.editorContainer}>
        <Box className={S.iconContainer}>
          <Icon name="metabot" c="brand" />
        </Box>
        <Box className={S.contentWrapper}>
          <EditorContent
            editor={editor}
            className={cx(S.content, {
              [S.disabled]: disabled,
            })}
          />
        </Box>
      </Box>
    );
  },
);

// @ts-expect-error - must set a displayName
MetabotChatEditor.displayName = "MetabotChatEditor";

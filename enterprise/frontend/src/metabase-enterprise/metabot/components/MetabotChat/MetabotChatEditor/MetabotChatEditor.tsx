import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import Paragraph from "@tiptap/extension-paragraph";
import { Placeholder } from "@tiptap/extension-placeholder";
import Text from "@tiptap/extension-text";
import { EditorContent, useEditor } from "@tiptap/react";
import cx from "classnames";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { Box, Icon } from "metabase/ui";
import type { MetabotPromptInputRef } from "metabase-enterprise/metabot/context";
import { createMentionSuggestion } from "metabase-enterprise/rich_text_editing/tiptap/extensions/Mention/MentionSuggestion";
import {
  MetabotMentionExtension,
  MetabotMentionPluginKey,
} from "metabase-enterprise/rich_text_editing/tiptap/extensions/MetabotMention/MetabotMentionExtension";
import { SmartLink } from "metabase-enterprise/rich_text_editing/tiptap/extensions/SmartLink/SmartLinkNode";
import { createSuggestionRenderer } from "metabase-enterprise/rich_text_editing/tiptap/extensions/suggestionRenderer";

import S from "./MetabotChatEditor.module.css";
import {
  parseMetabotMessageToTiptapDoc,
  serializeTiptapToMetabotMessage,
} from "./utils";

interface Props {
  value: string;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export const MetabotChatEditor = forwardRef<
  MetabotPromptInputRef | null,
  Props
>(
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
    const serializedRef = useRef(value);

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
      SmartLink.configure({
        HTMLAttributes: { class: S.smartLink },
        siteUrl,
      }),
      MetabotMentionExtension.configure({
        suggestion: {
          render: createSuggestionRenderer(
            createMentionSuggestion({
              searchModels: ["dataset", "transform", "table", "database"],
            }),
          ),
        },
      }),
    ];

    const editor = useEditor(
      {
        extensions,
        content: value,
        autofocus: autoFocus,
        immediatelyRender: false,
        onUpdate: ({ editor }) => {
          const jsonContent = editor.getJSON();
          serializedRef.current = serializeTiptapToMetabotMessage(jsonContent);
          onChangeRef.current(serializedRef.current);
        },
        editorProps: {
          handleDOMEvents: {
            copy(view, e) {
              e.preventDefault();
              const { from, to } = view.state.selection;
              const slice = view.state.doc.slice(from, to);
              const doc = view.state.schema.topNodeType.create(
                null,
                slice.content,
              );
              const serialized = serializeTiptapToMetabotMessage(doc.toJSON());
              e.clipboardData?.setData("text/plain", serialized);
              return true;
            },
            cut(view, e) {
              e.preventDefault();
              const { from, to } = view.state.selection;
              const slice = view.state.doc.slice(from, to);
              const doc = view.state.schema.topNodeType.create(
                null,
                slice.content,
              );
              const serialized = serializeTiptapToMetabotMessage(doc.toJSON());
              e.clipboardData?.setData("text/plain", serialized);
              view.dispatch(view.state.tr.deleteSelection());
              return true;
            },
          },
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
          clipboardTextSerializer: (content) => {
            return serializeTiptapToMetabotMessage(content.toJSON());
          },
        },
      },
      [],
    );

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
      if (value !== serializedRef.current) {
        editor?.commands.setContent(parseMetabotMessageToTiptapDoc(value));
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

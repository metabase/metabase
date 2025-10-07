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
import type { MetabotChatInputRef } from "metabase/metabot";
import { getSetting } from "metabase/selectors/settings";
import { Box, Icon } from "metabase/ui";
import { createMentionSuggestion } from "metabase-enterprise/rich_text_editing/tiptap/extensions/Mention/MentionSuggestion";
import {
  MetabotMentionExtension,
  MetabotMentionPluginKey,
} from "metabase-enterprise/rich_text_editing/tiptap/extensions/MetabotMention/MetabotMentionExtension";
import { SmartLink } from "metabase-enterprise/rich_text_editing/tiptap/extensions/SmartLink/SmartLinkNode";
import type { SuggestionModel } from "metabase-enterprise/rich_text_editing/tiptap/extensions/shared/types";
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
  suggestionModels: SuggestionModel[];
}

export const MetabotChatEditor = forwardRef<MetabotChatInputRef | null, Props>(
  (
    {
      value,
      placeholder = t`Tell me to do something, or ask a question`,
      autoFocus = false,
      disabled = false,
      suggestionModels,
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
              searchModels: suggestionModels,
              canBrowseAll: false,
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

      return Object.assign(editor, {
        focus: () => editor.commands.focus("end"),
        get scrollHeight() {
          return editor.view.dom.scrollHeight;
        },
        get scrollTop() {
          return editor.view.dom.scrollTop;
        },
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

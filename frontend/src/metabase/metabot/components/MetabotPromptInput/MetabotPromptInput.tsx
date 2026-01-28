import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import Paragraph from "@tiptap/extension-paragraph";
import { Placeholder } from "@tiptap/extension-placeholder";
import Text from "@tiptap/extension-text";
import { TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { EditorContent, useEditor } from "@tiptap/react";
import cx from "classnames";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import type { MetabotPromptInputRef } from "metabase/metabot";
import { createMentionSuggestion } from "metabase/rich_text_editing/tiptap/extensions/Mention/MentionSuggestion";
import {
  MetabotMentionExtension,
  MetabotMentionPluginKey,
} from "metabase/rich_text_editing/tiptap/extensions/MetabotMention/MetabotMentionExtension";
import { SmartLink } from "metabase/rich_text_editing/tiptap/extensions/SmartLink/SmartLinkNode";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import type { EntitySearchOptions } from "metabase/rich_text_editing/tiptap/extensions/shared/useEntitySearch";
import { createSuggestionRenderer } from "metabase/rich_text_editing/tiptap/extensions/suggestionRenderer";
import { getSetting } from "metabase/selectors/settings";

import S from "./MetabotPromptInput.module.css";
import {
  parseMetabotMessageToTiptapDoc,
  serializeTiptapToMetabotMessage,
} from "./utils";

export interface MetabotPromptInputProps {
  value: string;
  placeholder?: string;
  autoFocus?: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  onStop: () => void;
  suggestionConfig: {
    suggestionModels: SuggestionModel[];
    searchOptions?: EntitySearchOptions;
  };
}
export const MetabotPromptInput = forwardRef<
  MetabotPromptInputRef | null,
  MetabotPromptInputProps
>(
  (
    {
      value,
      placeholder = t`Tell me to do something, or ask a question`,
      autoFocus,
      disabled,
      suggestionConfig,
      onChange,
      onSubmit,
      onStop,
      ...props
    },
    ref,
  ) => {
    const siteUrl = useSelector((state) => getSetting(state, "site-url"));
    const serializedRef = useRef(value);

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
              searchModels: suggestionConfig.suggestionModels,
              searchOptions: suggestionConfig.searchOptions,
              canFilterSearchModels: true,
              canBrowseAll: false,
            }),
          ),
        },
      }),
    ];

    const editor = useEditor({
      extensions,
      content: parseMetabotMessageToTiptapDoc(value),
      autofocus: autoFocus,
      injectNonce: window.MetabaseNonce,
      onUpdate: ({ editor }) => {
        const jsonContent = editor.getJSON();
        serializedRef.current = serializeTiptapToMetabotMessage(jsonContent);
        onChange(serializedRef.current);
      },
      editorProps: {
        handleDOMEvents: {
          copy: (view: EditorView, e: ClipboardEvent) => {
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
          cut: (view: EditorView, e: ClipboardEvent) => {
            e.preventDefault();
            const { from, to } = view.state.selection;
            const slice = view.state.doc.slice(from, to);
            const doc = view.state.schema.topNodeType.create(
              null,
              slice.content,
            );
            const serialized = serializeTiptapToMetabotMessage(doc.toJSON());
            e.clipboardData?.setData("text/plain", serialized);

            // Delete the selected text and position cursor at cut location
            const tr = view.state.tr.deleteRange(from, to);
            tr.setSelection(TextSelection.create(tr.doc, from));
            view.dispatch(tr);

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
              event.shiftKey || event.ctrlKey || event.metaKey || event.altKey;

            if (!isModifiedKeyPress && onSubmit) {
              event.preventDefault();
              onSubmit();
              return true;
            }
          }

          if (event.key === "Escape") {
            event.preventDefault();
            onStop();
            return true;
          }

          return false;
        },
        clipboardTextSerializer: (content) => {
          return serializeTiptapToMetabotMessage(content.toJSON());
        },
      },
    });

    useImperativeHandle(ref, () => {
      if (!editor) {
        return null;
      }

      return Object.assign(editor, {
        focus: () => editor.commands.focus("end"),
        clear: () => editor.commands.clearContent(),
        getValue: () => serializeTiptapToMetabotMessage(editor.getJSON()),
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
      <EditorContent
        {...props}
        editor={editor}
        className={cx(S.content, {
          [S.disabled]: disabled,
        })}
      />
    );
  },
);

// @ts-expect-error - must set a displayName
MetabotPromptInput.displayName = "MetabotPromptInput";

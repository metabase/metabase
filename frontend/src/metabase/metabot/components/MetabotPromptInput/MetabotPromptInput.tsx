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

import type { MetabotPromptInputRef } from "metabase/metabot";
import {
  MetabotMentionExtension,
  MetabotMentionPluginKey,
} from "metabase/metabot/components/editor-extensions/MetabotMention/MetabotMentionExtension";
import { createMetabotMentionSuggestionNew } from "metabase/metabot/components/editor-extensions/MetabotMention/MetabotSuggestionNew";
import { useSelector } from "metabase/redux";
import { SmartLink } from "metabase/rich_text_editing/tiptap/extensions/SmartLink/SmartLinkNode";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import { createBareSuggestionRenderer } from "metabase/rich_text_editing/tiptap/extensions/suggestionRenderer";
import { getSetting } from "metabase/settings";
import { getCspNonce } from "metabase/utils/csp";
import type { DatabaseId } from "metabase-types/api";

import S from "./MetabotPromptInput.module.css";
import {
  parseClipboardTextAsParagraphs,
  parseMetabotMessageToTiptapDoc,
  serializeTiptapToMetabotMessage,
} from "./utils";

export interface MetabotPromptInputProps {
  value: string;
  placeholder?: string;
  suggestedPrompt?: string;
  onNavigateSuggestions?: (direction: "up" | "down") => void;
  autoFocus?: boolean;
  disabled: boolean;
  readOnly?: boolean;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  onStop: () => void;
  suggestionConfig: {
    suggestionModels: SuggestionModel[];
    onlyDatabaseId?: DatabaseId;
  };
}
export const MetabotPromptInput = forwardRef<
  MetabotPromptInputRef | null,
  MetabotPromptInputProps
>(
  (
    {
      value,
      placeholder = t`How can I help? Type @ to mention items.`,
      suggestedPrompt,
      onNavigateSuggestions,
      autoFocus,
      disabled,
      readOnly = false,
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
    const readOnlyRef = useRef(readOnly);
    readOnlyRef.current = readOnly;
    const shortcutRef = useRef({
      value,
      disabled,
      suggestedPrompt,
      onNavigateSuggestions,
    });
    shortcutRef.current = {
      value,
      disabled,
      suggestedPrompt,
      onNavigateSuggestions,
    };
    const placeholderRef = useRef(placeholder);
    placeholderRef.current = suggestedPrompt
      ? t`${suggestedPrompt} (Tab to send)`
      : placeholder;
    const acceptedSuggestionRef = useRef<string>();
    useEffect(() => {
      acceptedSuggestionRef.current = undefined;
    }, [suggestedPrompt]);

    // editorProps closures are baked into the editor at creation and are not
    // refreshed by tiptap when useEditor has a dependency array, so they must
    // read the latest handlers through refs.
    const onSubmitRef = useRef(onSubmit);
    onSubmitRef.current = onSubmit;
    const onStopRef = useRef(onStop);
    onStopRef.current = onStop;

    const extensions = [
      Document,
      Paragraph,
      Text,
      Placeholder.configure({ placeholder: () => placeholderRef.current }),
      HardBreak,
      SmartLink.configure({
        HTMLAttributes: { class: S.smartLink },
        siteUrl,
      }),
      MetabotMentionExtension.configure({
        suggestion: {
          render: createBareSuggestionRenderer(
            createMetabotMentionSuggestionNew({
              searchModels: suggestionConfig.suggestionModels,
              onlyDatabaseId: suggestionConfig.onlyDatabaseId,
            }),
          ),
        },
      }),
    ];

    const editor = useEditor(
      {
        extensions,
        content: parseMetabotMessageToTiptapDoc(value),
        autofocus: autoFocus ? "end" : false,
        injectNonce: getCspNonce(),
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
              if (readOnlyRef.current) {
                return true;
              }
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
            if (readOnlyRef.current) {
              return false;
            }
            const shortcuts = shortcutRef.current;
            const mentionState = MetabotMentionPluginKey.getState(view.state);
            const isEmpty =
              view.state.doc.childCount === 1 &&
              view.state.doc.firstChild?.childCount === 0;
            if (
              isEmpty &&
              shortcuts.value === "" &&
              !shortcuts.disabled &&
              !mentionState?.active &&
              !view.composing &&
              !event.isComposing &&
              !event.shiftKey &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.altKey
            ) {
              if (
                event.key === "Tab" &&
                shortcuts.suggestedPrompt &&
                onSubmitRef.current
              ) {
                event.preventDefault();
                if (
                  !event.repeat &&
                  acceptedSuggestionRef.current !== shortcuts.suggestedPrompt
                ) {
                  acceptedSuggestionRef.current = shortcuts.suggestedPrompt;
                  onSubmitRef.current(shortcuts.suggestedPrompt);
                }
                return true;
              }
              if (
                (event.key === "ArrowUp" || event.key === "ArrowDown") &&
                shortcuts.onNavigateSuggestions
              ) {
                event.preventDefault();
                shortcuts.onNavigateSuggestions(
                  event.key === "ArrowUp" ? "up" : "down",
                );
                return true;
              }
            }
            if (event.key === "Escape" || event.key === "Enter") {
              // Defer enter handling to mention UI if open
              const mentionState = MetabotMentionPluginKey.getState(view.state);
              if (mentionState?.active) {
                return false; // Let the suggestion system handle it
              }
            }

            if (event.key === "Enter") {
              // Check for any modifier keys (shift, ctrl, meta, alt)
              const isModifiedKeyPress =
                event.shiftKey ||
                event.ctrlKey ||
                event.metaKey ||
                event.altKey;

              if (!isModifiedKeyPress && onSubmitRef.current) {
                event.preventDefault();
                onSubmitRef.current(
                  serializeTiptapToMetabotMessage(view.state.doc.toJSON()),
                );
                return true;
              }
            }

            if (event.key === "Escape") {
              const mentionState = MetabotMentionPluginKey.getState(view.state);
              if (mentionState?.active) {
                return false;
              }

              event.preventDefault();
              onStopRef.current();
              return true;
            }

            return false;
          },
          clipboardTextSerializer: (content) => {
            return serializeTiptapToMetabotMessage(content.toJSON());
          },
          clipboardTextParser: parseClipboardTextAsParagraphs,
        },
      },
      // Extension config (including the suggestion closure over onlyDatabaseId)
      // is captured by plugins at editor creation and cannot be updated via
      // setOptions, so the editor must be recreated when it changes.
      // suggestionModels is keyed by content because some consumers pass a
      // fresh array on every render.
      [
        suggestionConfig.onlyDatabaseId,
        suggestionConfig.suggestionModels.join(","),
        siteUrl,
      ],
    );

    useImperativeHandle(ref, () => {
      if (!editor) {
        return null;
      }

      return Object.assign(editor, {
        focus: () => editor.commands.focus("end"),
        clear: () => editor.commands.clearContent(),
        getValue: () => serializeTiptapToMetabotMessage(editor.getJSON()),
        captureDictationSelection: () => {
          const { selection, doc } = editor.state;
          const restore = () => {
            if (!editor.isDestroyed && editor.state.doc.eq(doc)) {
              editor.commands.setTextSelection(selection);
              editor.commands.focus();
            }
          };
          return {
            restore,
            insert: (text: string) => {
              if (editor.isDestroyed || !editor.state.doc.eq(doc)) {
                return null;
              }
              const content = text
                .split("\n")
                .flatMap((line, index) => [
                  ...(index > 0 ? [{ type: "hardBreak" }] : []),
                  ...(line ? [{ type: "text", text: line }] : []),
                ]);
              editor
                .chain()
                .setTextSelection(selection)
                .insertContent(content)
                .focus()
                .run();
              return serializeTiptapToMetabotMessage(editor.getJSON());
            },
          };
        },
        get scrollHeight() {
          return editor.view.dom.scrollHeight;
        },
        get scrollTop() {
          return editor.view.dom.scrollTop;
        },
      });
    }, [editor]);

    useEffect(() => {
      editor?.setEditable(!readOnly, false);
    }, [editor, readOnly]);

    useEffect(() => {
      if (editor && !editor.isDestroyed) {
        editor.view.dispatch(editor.state.tr);
      }
    }, [editor, placeholder, suggestedPrompt]);

    // Sync external value changes to editor
    useEffect(() => {
      if (editor && value !== serializedRef.current) {
        editor.commands.setContent(parseMetabotMessageToTiptapDoc(value), {
          emitUpdate: false,
        });
        serializedRef.current = value;
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

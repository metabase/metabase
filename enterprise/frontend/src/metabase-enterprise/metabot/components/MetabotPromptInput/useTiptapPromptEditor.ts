import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import Paragraph from "@tiptap/extension-paragraph";
import { Placeholder } from "@tiptap/extension-placeholder";
import Text from "@tiptap/extension-text";
import { TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { useEditor } from "@tiptap/react";
import { useRef } from "react";

import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { createMentionSuggestion } from "metabase-enterprise/rich_text_editing/tiptap/extensions/Mention/MentionSuggestion";
import {
  MetabotMentionExtension,
  MetabotMentionPluginKey,
} from "metabase-enterprise/rich_text_editing/tiptap/extensions/MetabotMention/MetabotMentionExtension";
import { SmartLink } from "metabase-enterprise/rich_text_editing/tiptap/extensions/SmartLink/SmartLinkNode";
import type { SuggestionModel } from "metabase-enterprise/rich_text_editing/tiptap/extensions/shared/types";
import { createSuggestionRenderer } from "metabase-enterprise/rich_text_editing/tiptap/extensions/suggestionRenderer";

import {
  parseMetabotMessageToTiptapDoc,
  serializeTiptapToMetabotMessage,
} from "../MetabotChat/MetabotChatEditor/utils";

export interface UsePromptEditorOptions {
  value: string;
  placeholder?: string;
  autoFocus?: boolean;
  suggestionModels: SuggestionModel[];
  smartLinkClassName?: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function usePromptEditor({
  value,
  placeholder,
  autoFocus = false,
  suggestionModels,
  smartLinkClassName,
  onChange,
  onSubmit,
  onCancel,
}: UsePromptEditorOptions) {
  const siteUrl = useSelector((state) => getSetting(state, "site-url"));
  const serializedRef = useRef(value);

  const extensions = [
    Document,
    Paragraph,
    Text,
    Placeholder.configure({ placeholder }),
    HardBreak,
    SmartLink.configure({
      HTMLAttributes: smartLinkClassName ? { class: smartLinkClassName } : {},
      siteUrl,
    }),
    MetabotMentionExtension.configure({
      suggestion: {
        render: createSuggestionRenderer(
          createMentionSuggestion({
            searchModels: suggestionModels,
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
          const doc = view.state.schema.topNodeType.create(null, slice.content);
          const serialized = serializeTiptapToMetabotMessage(doc.toJSON());
          e.clipboardData?.setData("text/plain", serialized);
          return true;
        },
        cut: (view: EditorView, e: ClipboardEvent) => {
          e.preventDefault();
          const { from, to } = view.state.selection;
          const slice = view.state.doc.slice(from, to);
          const doc = view.state.schema.topNodeType.create(null, slice.content);
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

          if (!isModifiedKeyPress) {
            event.preventDefault();
            onSubmit();
            return true;
          }
        }

        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
          return true;
        }

        return false;
      },
      clipboardTextSerializer: (content) => {
        return serializeTiptapToMetabotMessage(content.toJSON());
      },
    },
  });

  return {
    editor,
    serializedRef,
  };
}

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
  isArtifactDrag,
  readArtifactDragData,
} from "metabase/metabot/components/MetabotBar/artifactDragData";
import { useSelector } from "metabase/redux";
import {
  MetabotMentionExtension,
  MetabotMentionPluginKey,
} from "metabase/rich_text_editing/tiptap/extensions/MetabotMention/MetabotMentionExtension";
import { createMetabotMentionSuggestionNew } from "metabase/rich_text_editing/tiptap/extensions/MetabotMention/MetabotSuggestionNew";
import { SmartLink } from "metabase/rich_text_editing/tiptap/extensions/SmartLink/SmartLinkNode";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import { createBareSuggestionRenderer } from "metabase/rich_text_editing/tiptap/extensions/suggestionRenderer";
import { getSetting } from "metabase/selectors/settings";
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
  autoFocus?: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
  onSubmit?: () => void;
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
          render: createBareSuggestionRenderer(
            createMetabotMentionSuggestionNew({
              searchModels: suggestionConfig.suggestionModels,
              onlyDatabaseId: suggestionConfig.onlyDatabaseId,
            }),
          ),
        },
      }),
    ];

    const editor = useEditor({
      extensions,
      content: parseMetabotMessageToTiptapDoc(value),
      autofocus: autoFocus,
      injectNonce: getCspNonce(),
      onUpdate: ({ editor }) => {
        const jsonContent = editor.getJSON();
        serializedRef.current = serializeTiptapToMetabotMessage(jsonContent);
        onChange(serializedRef.current);
      },
      editorProps: {
        handleDrop: (view, event) =>
          handleArtifactMentionDrop(view, event as DragEvent),
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
              event.shiftKey || event.ctrlKey || event.metaKey || event.altKey;

            if (!isModifiedKeyPress && onSubmit) {
              event.preventDefault();
              onSubmit();
              return true;
            }
          }

          if (event.key === "Escape") {
            const mentionState = MetabotMentionPluginKey.getState(view.state);
            if (mentionState?.active) {
              return false;
            }

            event.preventDefault();
            onStop();
            return true;
          }

          return false;
        },
        clipboardTextSerializer: (content) => {
          return serializeTiptapToMetabotMessage(content.toJSON());
        },
        clipboardTextParser: parseClipboardTextAsParagraphs,
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

    // Cancel dragover for artifact drags so the browser actually fires `drop`
    // (which ProseMirror routes to the handleDrop prop above). Done with a
    // native listener because editorProps.handleDOMEvents doesn't reliably
    // intercept the external drag.
    useEffect(() => {
      const dom = editor?.view.dom;
      if (!dom) {
        return;
      }
      const onDragOver = (e: DragEvent) => {
        if (!isArtifactDrag(e.dataTransfer)) {
          return;
        }
        e.preventDefault();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = "copy";
        }
      };
      dom.addEventListener("dragover", onDragOver);
      return () => dom.removeEventListener("dragover", onDragOver);
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

// Artifacts dragged in from the Metabot popover arrive as a native drop carrying
// our custom MIME payload — insert them as a smartLink mention of the card.
export const handleArtifactMentionDrop = (
  view: EditorView,
  event: DragEvent,
): boolean => {
  const artifact = readArtifactDragData(event.dataTransfer);
  if (artifact?.model !== "card") {
    return false;
  }

  const coordsPos = view.posAtCoords({
    left: event.clientX,
    top: event.clientY,
  })?.pos;
  const pos = coordsPos ?? view.state.selection.from;

  const { schema } = view.state;
  const mention = schema.nodes.smartLink.create({
    entityId: artifact.id,
    model: "card",
    label: null,
  });

  // insert the mention followed by a trailing space, matching how the
  // @-suggestion command finishes a mention
  const tr = view.state.tr.replaceWith(pos, pos, [mention, schema.text(" ")]);
  tr.setSelection(TextSelection.create(tr.doc, pos + mention.nodeSize + 1));
  view.dispatch(tr);

  event.preventDefault();
  return true;
};

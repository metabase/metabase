import { EditorContent } from "@tiptap/react";
import cx from "classnames";
import { forwardRef, useEffect, useImperativeHandle } from "react";

import type { SuggestionModel } from "metabase-enterprise/rich_text_editing/tiptap/extensions/shared/types";

import {
  parseMetabotMessageToTiptapDoc,
  serializeTiptapToMetabotMessage,
} from "../MetabotChat/MetabotChatEditor/utils";

import S from "./MetabotPromptInput.module.css";
import { usePromptEditor } from "./useTiptapPromptEditor";

export interface MetabotPromptInputRef {
  focus: () => void;
  clear: () => void;
  getValue: () => string;
}

interface Props {
  value: string;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  suggestionModels: readonly SuggestionModel[];
  onChange: (value: string) => void;
  onCancel: () => void;
}

export const MetabotPromptInput = forwardRef<MetabotPromptInputRef, Props>(
  (
    {
      value,
      placeholder,
      autoFocus = false,
      disabled = false,
      suggestionModels,
      onChange,
      onCancel,
    },
    ref,
  ) => {
    const { editor, serializedRef } = usePromptEditor({
      value,
      placeholder,
      autoFocus,
      suggestionModels,
      smartLinkClassName: S.smartLink,
      onChange,
      onCancel,
    });

    useImperativeHandle(
      ref,
      () => ({
        focus: () => editor?.commands.focus("end"),
        clear: () => editor?.commands.clearContent(),
        getValue: () => {
          if (!editor) {
            return "";
          }
          return serializeTiptapToMetabotMessage(editor.getJSON());
        },
      }),
      [editor],
    );

    // Sync external value changes to editor
    useEffect(() => {
      if (value !== serializedRef.current) {
        editor?.commands.setContent(parseMetabotMessageToTiptapDoc(value));
      }
    }, [editor, value, serializedRef]);

    // Sync disabled state to editor
    useEffect(() => {
      editor?.setEditable(!disabled);
    }, [editor, disabled]);

    if (!editor) {
      return null;
    }

    return (
      <EditorContent
        data-testid="metabot-prompt-input"
        editor={editor}
        className={cx(S.content, { [S.disabled]: disabled })}
      />
    );
  },
);

// @ts-expect-error - setting displayName on forwardRef component
MetabotPromptInput.displayName = "MetabotPromptInput";

import { EditorContent } from "@tiptap/react";
import cx from "classnames";
import { forwardRef, useEffect, useImperativeHandle } from "react";
import { t } from "ttag";

import type { MetabotChatInputRef } from "metabase/metabot";
import { Box, Icon, UnstyledButton } from "metabase/ui";
import type { SuggestionModel } from "metabase-enterprise/rich_text_editing/tiptap/extensions/shared/types";

import { usePromptEditor } from "../../MetabotPromptInput/useTiptapPromptEditor";

import S from "./MetabotChatEditor.module.css";
import { parseMetabotMessageToTiptapDoc } from "./utils";

interface Props {
  value: string;
  placeholder?: string;
  autoFocus?: boolean;
  isResponding?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  suggestionModels: SuggestionModel[];
}

export const MetabotChatEditor = forwardRef<MetabotChatInputRef | null, Props>(
  (
    {
      value,
      placeholder = t`Tell me to do something, or ask a question`,
      autoFocus = false,
      isResponding = false,
      suggestionModels,
      onChange,
      onSubmit,
      onStop,
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
      onSubmit,
      onCancel: onStop,
    });

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
    }, [editor, value, serializedRef]);

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
            data-testid="metabot-chat-input"
            editor={editor}
            className={cx(S.content, {
              [S.disabled]: isResponding,
            })}
          />
        </Box>
        <UnstyledButton
          className={cx(
            S.button,
            isResponding && S.buttonResponding,
            value.length === 0 && !isResponding && S.buttonHidden,
          )}
          onClick={isResponding ? onStop : onSubmit}
          data-testid={
            isResponding ? "metabot-stop-response" : "metabot-send-message"
          }
        >
          {isResponding ? (
            <Icon className={S.stopIcon} name="stop" />
          ) : (
            <Icon className={S.sendIcon} name="arrow_up" />
          )}
        </UnstyledButton>
      </Box>
    );
  },
);

// @ts-expect-error - must set a displayName
MetabotChatEditor.displayName = "MetabotChatEditor";

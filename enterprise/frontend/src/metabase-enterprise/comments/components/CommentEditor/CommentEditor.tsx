import Link from "@tiptap/extension-link";
import { Placeholder } from "@tiptap/extension-placeholder";
import {
  type Editor,
  EditorContent,
  type Extension,
  useEditor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import cx from "classnames";
import { type KeyboardEventHandler, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { ActionIcon, Box, Flex, Icon } from "metabase/ui";
import { configureMentionExtension } from "metabase-enterprise/comments/mentions/extension";
import { EditorBubbleMenu } from "metabase-enterprise/documents/components/Editor/EditorBubbleMenu";
import { DisableMetabotSidebar } from "metabase-enterprise/documents/components/Editor/extensions/DisableMetabotSidebar";
import { SmartLink } from "metabase-enterprise/documents/components/Editor/extensions/SmartLink/SmartLinkNode";
import type { DocumentContent } from "metabase-types/api";

import S from "./CommentEditor.module.css";
import { trimTrailingEmptyParagraphsJSON } from "./editor.utils";

const BUBBLE_MENU_DISALLOWED_NODES: string[] = [SmartLink.name];
// TODO: Other formats require to update editor styling.
const ALLOWED_FORMATTING = {
  bold: true,
  italic: true,
  strikethrough: true,
} as const;

interface Props {
  active?: boolean;
  autoFocus?: boolean;
  initialContent?: DocumentContent | null;
  placeholder?: string;
  readonly?: boolean;
  onBlur?: (content: DocumentContent, editor: Editor) => void;
  onChange?: (content: DocumentContent) => void;
  onSubmit?: (content: DocumentContent) => void;
}

export const CommentEditor = ({
  active = true,
  autoFocus = false,
  initialContent,
  placeholder = t`Reply…`,
  readonly = false,
  onBlur,
  onChange,
  onSubmit,
}: Props) => {
  const siteUrl = useSelector((state) => getSetting(state, "site-url"));
  const [content, setContent] = useState<string | null>(null);
  const dispatch = useDispatch();

  const extensions = useMemo(
    () =>
      [
        StarterKit.configure({ link: false }),
        SmartLink.configure({
          HTMLAttributes: { class: "smart-link" },
          siteUrl,
        }),
        Link.configure({
          HTMLAttributes: { class: CS.link },
        }),
        configureMentionExtension({ dispatch }),
        !readonly && Placeholder.configure({ placeholder }),
        !readonly && DisableMetabotSidebar,
      ].filter((extension): extension is Extension => extension != null),
    [siteUrl, dispatch, readonly, placeholder],
  );

  const editor = useEditor(
    {
      extensions,
      content: initialContent || "",
      autofocus: autoFocus,
      editable: !readonly,
      immediatelyRender: true,
      onUpdate: ({ editor }) => {
        const doc = editor.getText();
        setContent(doc);
        if (onChange) {
          onChange(editor.getJSON() as DocumentContent);
        }
      },
      onBlur: ({ editor }) => {
        if (onBlur) {
          onBlur(editor.getJSON() as DocumentContent, editor);
        }
      },
    },
    [readonly, autoFocus],
  );

  useEffect(() => {
    if (editor && initialContent) {
      editor.commands.setContent(initialContent);
    }
  }, [editor, initialContent]);

  if (!editor) {
    return null;
  }

  const submitDoc = () => {
    const content = editor.getJSON() as DocumentContent;
    const isEmpty = editor.isEmpty;
    if (!isEmpty && onSubmit) {
      onSubmit(trimTrailingEmptyParagraphsJSON(content));
      editor.commands.clearContent(true);
    }
  };
  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (readonly) {
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      // see CustomMentionExtension
      const isMentionOpen = (editor.storage as any)?.mention
        ?.isMentionPopupOpen;

      if (!isMentionOpen) {
        event.preventDefault();
        submitDoc();
      }
    }
  };

  return (
    <Flex
      className={cx(S.container, {
        [S.readonly]: readonly,
        [S.active]: active,
      })}
      onKeyDownCapture={handleKeyDown}
    >
      <Box className={S.contentWrapper}>
        <EditorContent editor={editor} className={S.content} />
      </Box>

      {readonly ? null : (
        <ActionIcon
          variant="subtle"
          className={cx(S.submitBtn, { [S.canSubmit]: !!content })}
          onClick={submitDoc}
        >
          <Icon name="arrow_up" />
        </ActionIcon>
      )}
      {!readonly && (
        <EditorBubbleMenu
          editor={editor}
          disallowedNodes={BUBBLE_MENU_DISALLOWED_NODES}
          allowedFormatting={ALLOWED_FORMATTING}
        />
      )}
    </Flex>
  );
};

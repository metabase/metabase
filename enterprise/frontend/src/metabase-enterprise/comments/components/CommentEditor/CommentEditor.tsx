import Link from "@tiptap/extension-link";
import { Placeholder } from "@tiptap/extension-placeholder";
import { EditorContent, type Extension, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import cx from "classnames";
import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { getUser } from "metabase/selectors/user";
import { ActionIcon, Flex, Icon } from "metabase/ui";
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
  readonly?: boolean;
  initialContent?: DocumentContent | null;
  onChange?: (content: DocumentContent) => void;
  onSubmit?: (content: DocumentContent) => void;
}

export const CommentEditor = ({
  readonly = false,
  initialContent,
  onChange,
  onSubmit,
}: Props) => {
  const currentUser = useSelector(getUser);
  const siteUrl = useSelector((state) => getSetting(state, "site-url"));
  const [content, setContent] = useState<string | null>(null);
  const dispatch = useDispatch();

  const extensions = useMemo(
    () =>
      [
        StarterKit,
        SmartLink.configure({
          HTMLAttributes: { class: "smart-link" },
          siteUrl,
        }),
        Link.configure({
          HTMLAttributes: { class: CS.link },
        }),
        configureMentionExtension({ currentUser, dispatch }),
        !readonly &&
          Placeholder.configure({
            placeholder: t`Add a comment…`,
          }),
        !readonly && DisableMetabotSidebar,
      ].filter(Boolean) as Extension[],
    [siteUrl, currentUser, dispatch, readonly],
  );

  const editor = useEditor(
    {
      extensions,
      content: initialContent || "",
      autofocus: true,
      editable: !readonly,
      immediatelyRender: true,
      onUpdate: ({ editor }) => {
        const doc = editor.getText();
        setContent(doc);
        if (onChange) {
          onChange(editor.getJSON() as DocumentContent);
        }
      },
    },
    [readonly],
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
  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (readonly) {
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!onSubmit) {
        return;
      }
      submitDoc();
    }
  };

  return (
    <Flex
      className={cx(S.container, { [S.readonly]: readonly })}
      onKeyDown={handleKeyDown}
    >
      <EditorContent editor={editor} className={S.content} />
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

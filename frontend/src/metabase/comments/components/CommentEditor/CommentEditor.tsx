import { Extension } from "@tiptap/core";
import { Link } from "@tiptap/extension-link";
import { Placeholder } from "@tiptap/extension-placeholder";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import cx from "classnames";
import { type KeyboardEventHandler, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { METAKEY } from "metabase/lib/browser";
import { useSelector } from "metabase/lib/redux";
import { EditorBubbleMenu } from "metabase/rich_text_editing/tiptap/components/EditorBubbleMenu/EditorBubbleMenu";
import type { FormattingOptions } from "metabase/rich_text_editing/tiptap/components/EditorBubbleMenu/types";
import { CustomStarterKit } from "metabase/rich_text_editing/tiptap/extensions/CustomStarterKit/CustomStarterKit";
import { DisableMetabotSidebar } from "metabase/rich_text_editing/tiptap/extensions/DisableMetabotSidebar";
import { EmojiSuggestionExtension } from "metabase/rich_text_editing/tiptap/extensions/Emoji/EmojiSuggestionExtension";
import { MentionExtension } from "metabase/rich_text_editing/tiptap/extensions/Mention/MentionExtension";
import { createMentionSuggestion } from "metabase/rich_text_editing/tiptap/extensions/Mention/MentionSuggestion";
import { SmartLink } from "metabase/rich_text_editing/tiptap/extensions/SmartLink/SmartLinkNode";
import { LINK_SEARCH_MODELS } from "metabase/rich_text_editing/tiptap/extensions/shared/constants";
import { createSuggestionRenderer } from "metabase/rich_text_editing/tiptap/extensions/suggestionRenderer";
import { getSetting } from "metabase/selectors/settings";
import { ActionIcon, Box, Flex, Icon, Tooltip } from "metabase/ui";
import type { DocumentContent } from "metabase-types/api";

import S from "./CommentEditor.module.css";

const BUBBLE_MENU_DISALLOWED_NODES: string[] = [SmartLink.name];

const ALLOWED_FORMATTING: FormattingOptions = {
  bold: true,
  italic: true,
  strikethrough: true,
  inline_code: true,
};

interface Props {
  active?: boolean;
  autoFocus?: boolean;
  "data-testid"?: string;
  initialContent?: DocumentContent | null;
  placeholder?: string;
  readonly?: boolean;
  onBlur?: (content: DocumentContent, editor: Editor) => void;
  onChange?: (content: DocumentContent) => void;
  onSubmit?: (content: DocumentContent, html: string) => void;
  onEscape?: () => void;
}

export const CommentEditor = ({
  active = true,
  autoFocus = false,
  "data-testid": dataTestId,
  initialContent,
  placeholder = t`Reply…`,
  readonly = false,
  onBlur,
  onChange,
  onSubmit,
  onEscape,
}: Props) => {
  const siteUrl = useSelector((state) => getSetting(state, "site-url"));
  const [content, setContent] = useState<string | null>(null);

  const extensions = useMemo(
    () =>
      [
        Extension.create({
          name: "OverrideEscape",
          addKeyboardShortcuts() {
            return {
              Escape: () => {
                if (onEscape) {
                  onEscape();
                  return true;
                }

                return this.editor.commands.blur();
              },
            };
          },
        }),
        CustomStarterKit.configure({
          link: false,
          trailingNode: false,
          heading: false,
          horizontalRule: false,
          paragraph: { editorContext: "comments" },
        }),
        SmartLink.configure({
          HTMLAttributes: { class: "smart-link" },
          siteUrl,
        }),
        Link.configure({
          HTMLAttributes: { class: CS.link },
        }),
        MentionExtension.configure({
          suggestion: {
            render: createSuggestionRenderer(
              createMentionSuggestion({
                searchModels: [...LINK_SEARCH_MODELS, "user"],
              }),
            ),
          },
        }),
        EmojiSuggestionExtension,
        !readonly && Placeholder.configure({ placeholder }),
        !readonly && DisableMetabotSidebar,
      ].filter((extension): extension is Extension => extension != null),
    [siteUrl, readonly, placeholder, onEscape],
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

    const html = stripInternalIds(editor.getHTML());

    if (!isEmpty && onSubmit) {
      onSubmit(content, html);
      editor.commands.clearContent(true);
      editor.commands.blur();
    }
  };
  const handleKeyDownCapture: KeyboardEventHandler<HTMLDivElement> = (
    event,
  ) => {
    if (readonly) {
      return;
    }

    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submitDoc();
    }
  };

  // we have two different handlers and it is fine. handleKeyDownCapture works
  // well with submitting data handleKeyDown is needed to prevent event to
  // bubble to the global listener
  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (event) => {
    // shortcut is used for code block extension, conflicts with global shortcut
    // for opening metabot sidebar we have to stop event propagation as other
    // variants didn't work or uglier that this solution
    if ((event.ctrlKey || event.metaKey) && event.key === "e") {
      event.stopPropagation();
    }
  };

  return (
    <Flex
      align="center"
      className={cx(S.container, {
        [S.readonly]: readonly,
        [S.active]: active,
      })}
      onKeyDownCapture={handleKeyDownCapture}
      onKeyDown={handleKeyDown}
    >
      <Box className={S.contentWrapper}>
        <EditorContent
          data-testid={dataTestId}
          editor={editor}
          className={S.content}
        />
      </Box>

      {!readonly && (
        <Tooltip disabled={!content} label={t`Send (${METAKEY} + Enter)`}>
          <ActionIcon
            aria-label={t`Send`}
            className={cx(S.submitBtn, { [S.canSubmit]: content })}
            disabled={!content}
            variant="subtle"
            size="sm"
            onClick={submitDoc}
          >
            <Icon name="send" />
          </ActionIcon>
        </Tooltip>
      )}

      {!readonly && (
        <EditorBubbleMenu
          className={S.bubbleMenu}
          editor={editor}
          disallowedNodes={BUBBLE_MENU_DISALLOWED_NODES}
          allowedFormatting={ALLOWED_FORMATTING}
          options={{
            placement: "top",
          }}
        />
      )}
    </Flex>
  );
};

function stripInternalIds(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const elements = doc.body.querySelectorAll("[_id]");
  elements.forEach((el) => el.removeAttribute("_id"));
  return doc.body.innerHTML;
}

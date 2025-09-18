/* eslint-disable import/no-unresolved */ // -- this is a valid import for Tiptap's BubbleMenu
import type { BubbleMenuOptions } from "@tiptap/extension-bubble-menu";
import type { EditorState } from "@tiptap/pm/state";
import type { Editor as TiptapEditor } from "@tiptap/react";
// @ts-expect-error - BubbleMenu is a Tiptap extension that is registered through @tiptap/extension-bubble-menu
import { BubbleMenu } from "@tiptap/react/menus";
import type React from "react";
import { useEffect } from "react";
import { t } from "ttag";

import { useForceUpdate } from "metabase/common/hooks/use-force-update";
import { Flex } from "metabase/ui";

import { FormatButton } from "../FormatButton/FormatButton";

import S from "./EditorBubbleMenu.module.css";
import type { FormattingOptions } from "./types";

const DEFAULT_ALLOWED_FORMATTING: FormattingOptions = {
  bold: true,
  italic: true,
  strikethrough: true,
  h1: true,
  h2: true,
  h3: true,
  list: true,
  ordered_list: true,
  quote: true,
  inline_code: true,
  code_block: true,
};

interface EditorBubbleMenuProps {
  editor: TiptapEditor;
  disallowedNodes: string[];
  allowedFormatting?: FormattingOptions;
  options?: BubbleMenuOptions["options"];
  className?: string;
}

export const EditorBubbleMenu: React.FC<EditorBubbleMenuProps> = ({
  editor,
  disallowedNodes,
  allowedFormatting = DEFAULT_ALLOWED_FORMATTING,
  options,
  className,
}) => {
  const forceUpdate = useForceUpdate();

  useEffect(() => {
    editor.on("selectionUpdate", forceUpdate);
    editor.on("update", forceUpdate);

    return () => {
      editor.off("selectionUpdate", forceUpdate);
      editor.off("update", forceUpdate);
    };
  }, [editor, forceUpdate]);
  return (
    <BubbleMenu
      className={className}
      editor={editor}
      options={options}
      shouldShow={({
        editor,
        state,
        from,
        to,
      }: {
        editor: TiptapEditor;
        state: EditorState;
        from: number;
        to: number;
      }) => {
        // Don't show bubble menu if nothing is selected
        const { empty } = state.selection;
        if (empty) {
          return false;
        }

        // Don't show bubble menu for certain node types

        // Check if any disallowed node is active
        for (const nodeName of disallowedNodes) {
          if (editor.isActive(nodeName)) {
            return false;
          }
        }

        // Check if selection contains any disallowed nodes
        let hasDisallowedNode = false;
        state.doc.nodesBetween(from, to, (node) => {
          if (disallowedNodes.includes(node.type.name)) {
            hasDisallowedNode = true;
            return false; // Stop traversing
          }
        });

        return !hasDisallowedNode;
      }}
    >
      <Flex
        gap={4}
        bg="white"
        p="2px"
        className={S.bubbleMenu}
        data-testid="document-formatting-menu"
      >
        {allowedFormatting.bold && (
          <FormatButton
            isActive={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
            tooltip={t`Bold`}
            icon="text_bold"
          />
        )}
        {allowedFormatting.italic && (
          <FormatButton
            isActive={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            tooltip={t`Italic`}
            icon="text_italic"
          />
        )}
        {allowedFormatting.strikethrough && (
          <FormatButton
            isActive={editor.isActive("strike")}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            tooltip={t`Strikethrough`}
            icon="text_strike"
          />
        )}
        {allowedFormatting.inline_code && (
          <FormatButton
            isActive={editor.isActive("code")}
            onClick={() => editor.chain().focus().toggleCode().run()}
            tooltip={t`Inline code`}
            icon="format_code"
          />
        )}
        {allowedFormatting.h1 && (
          <FormatButton
            isActive={editor.isActive("heading", { level: 1 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 1 }).run()
            }
            tooltip={t`Heading 1`}
            text="H1"
          />
        )}
        {allowedFormatting.h2 && (
          <FormatButton
            isActive={editor.isActive("heading", { level: 2 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
            tooltip={t`Heading 2`}
            text="H2"
          />
        )}
        {allowedFormatting.h3 && (
          <FormatButton
            isActive={editor.isActive("heading", { level: 3 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 3 }).run()
            }
            tooltip={t`Heading 3`}
            text="H3"
          />
        )}
        {allowedFormatting.list && (
          <FormatButton
            isActive={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            tooltip={t`Bullet list`}
            icon="list"
          />
        )}
        {allowedFormatting.ordered_list && (
          <FormatButton
            isActive={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            tooltip={t`Numbered list`}
            icon="ordered_list"
          />
        )}
        {allowedFormatting.quote && (
          <FormatButton
            isActive={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            tooltip={t`Quote`}
            icon="quote"
          />
        )}
        {allowedFormatting.code_block && (
          <FormatButton
            isActive={editor.isActive("codeBlock")}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            tooltip={t`Code block`}
            icon="code_block"
          />
        )}
      </Flex>
    </BubbleMenu>
  );
};

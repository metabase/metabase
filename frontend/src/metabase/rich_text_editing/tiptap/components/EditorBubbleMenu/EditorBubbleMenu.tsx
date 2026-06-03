import type { BubbleMenuOptions } from "@tiptap/extension-bubble-menu";
import type { EditorState } from "@tiptap/pm/state";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import type React from "react";
import { useEffect, useState } from "react";
import { t } from "ttag";

import { useForceUpdate } from "metabase/common/hooks/use-force-update";
import { Flex } from "metabase/ui";

import { FormatButton } from "../FormatButton/FormatButton";

import S from "./EditorBubbleMenu.module.css";
import { LinkEditor } from "./LinkEditor";
import type { FormattingOptions } from "./types";

declare module "@tiptap/core" {
  interface EditorEvents {
    openLinkEditor: string; // The href of the link
  }
}

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
  link: true,
};

interface EditorBubbleMenuProps {
  editor: TiptapEditor;
  disallowedNodes: string[];
  disallowedFullySelectedNodes?: string[];
  allowedFormatting?: FormattingOptions;
  options?: BubbleMenuOptions["options"];
  className?: string;
}

export const EditorBubbleMenu: React.FC<EditorBubbleMenuProps> = ({
  editor,
  disallowedNodes,
  disallowedFullySelectedNodes,
  allowedFormatting = DEFAULT_ALLOWED_FORMATTING,
  options,
  className,
}) => {
  const forceUpdate = useForceUpdate();
  const [initialLinkUrl, setInitialLinkUrl] = useState<string | null>(null);

  const handleLinkClick = () => {
    const existingLink = editor.getAttributes("link");
    setInitialLinkUrl(existingLink.href || "");
  };

  const handleLinkSubmit = (url: string) => {
    if (url.trim()) {
      editor.chain().focus().setLink({ href: url.trim() }).run();
    } else {
      editor.chain().focus().unsetLink().run();
    }
    editor.commands.setTextSelection(editor.state.selection.to);
    setInitialLinkUrl(null);
  };

  const handleLinkCancel = () => {
    setInitialLinkUrl(null);
  };

  useEffect(() => {
    editor.on("selectionUpdate", forceUpdate);
    editor.on("update", forceUpdate);
    editor.on("openLinkEditor", setInitialLinkUrl);

    return () => {
      editor.off("selectionUpdate", forceUpdate);
      editor.off("update", forceUpdate);
      editor.off("openLinkEditor", setInitialLinkUrl);
    };
  }, [editor, forceUpdate]);

  return (
    <BubbleMenu
      className={className}
      editor={editor}
      options={{
        onHide: () => setInitialLinkUrl(null),
        ...options,
      }}
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
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (disallowedFullySelectedNodes?.includes(node.type.name)) {
            if (from <= pos && to >= pos + node.nodeSize) {
              hasDisallowedNode = true;
              return false;
            }
          } else if (disallowedNodes.includes(node.type.name)) {
            hasDisallowedNode = true;
            return false; // Stop traversing
          }
        });

        return !hasDisallowedNode;
      }}
    >
      <Flex
        gap={4}
        p="2px"
        className={S.bubbleMenu}
        data-testid="document-formatting-menu"
      >
        {initialLinkUrl != null ? (
          <LinkEditor
            initialUrl={initialLinkUrl}
            onSubmit={handleLinkSubmit}
            onCancel={handleLinkCancel}
          />
        ) : (
          <>
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
            {allowedFormatting.link && (
              <FormatButton
                isActive={initialLinkUrl != null || editor.isActive("link")}
                onClick={handleLinkClick}
                tooltip={t`Link`}
                icon="link"
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
          </>
        )}
      </Flex>
    </BubbleMenu>
  );
};

/* eslint-disable import/no-unresolved */ // -- this is a valid import for Tiptap's BubbleMenu
import type { EditorState } from "@tiptap/pm/state";
import type { Editor as TiptapEditor } from "@tiptap/react";
// @ts-expect-error - BubbleMenu is a Tiptap extension that is registered through @tiptap/extension-bubble-menu
import { BubbleMenu } from "@tiptap/react/menus";
import type React from "react";
import { useEffect } from "react";
import { t } from "ttag";

import { useForceUpdate } from "metabase/common/hooks/use-force-update";
import { Flex } from "metabase/ui";

import { FormatButton } from "./FormatButton";

interface EditorBubbleMenuProps {
  editor: TiptapEditor;
}

export const EditorBubbleMenu: React.FC<EditorBubbleMenuProps> = ({
  editor,
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
      editor={editor}
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

        // Don't show for code blocks
        if (editor.isActive("codeBlock")) {
          return false;
        }

        // Don't show bubble menu for certain node types
        const disallowedNodes = ["cardEmbed", "metabot", "smartLink", "image"];

        // Check if any disallowed node is active
        for (const nodeName of disallowedNodes) {
          if (editor.isActive(nodeName)) {
            return false;
          }
        }

        // Check if selection contains any disallowed nodes
        let hasDisallowedNode = false;
        state.doc.nodesBetween(from, to, (node) => {
          if (
            disallowedNodes.includes(node.type.name) ||
            node.type.name === "codeBlock"
          ) {
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
        style={{
          border: "1px solid var(--mb-color-border)",
          borderRadius: "6px",
          boxShadow: "0 2px 12px var(--mb-color-shadow)",
        }}
        data-testid="document-formatting-menu"
      >
        <FormatButton
          isActive={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          tooltip={t`Bold`}
          icon="text_bold"
        />
        <FormatButton
          isActive={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          tooltip={t`Italic`}
          icon="text_italic"
        />
        <FormatButton
          isActive={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          tooltip={t`Strikethrough`}
          icon="text_strike"
        />
        <FormatButton
          isActive={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
          tooltip={t`Inline code`}
          icon="format_code"
        />
        <FormatButton
          isActive={editor.isActive("heading", { level: 1 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
          tooltip={t`Heading 1`}
          text="H1"
        />
        <FormatButton
          isActive={editor.isActive("heading", { level: 2 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          tooltip={t`Heading 2`}
          text="H2"
        />
        <FormatButton
          isActive={editor.isActive("heading", { level: 3 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
          tooltip={t`Heading 3`}
          text="H3"
        />
        <FormatButton
          isActive={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          tooltip={t`Bullet list`}
          icon="list"
        />
        <FormatButton
          isActive={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          tooltip={t`Numbered list`}
          icon="ordered_list"
        />
        <FormatButton
          isActive={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          tooltip={t`Quote`}
          icon="quote"
        />
        <FormatButton
          isActive={editor.isActive("codeBlock")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          tooltip={t`Code block`}
          icon="code_block"
        />
      </Flex>
    </BubbleMenu>
  );
};

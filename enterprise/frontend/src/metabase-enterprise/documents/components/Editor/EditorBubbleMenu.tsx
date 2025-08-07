import type { Editor as TiptapEditor } from "@tiptap/react";
// eslint-disable-next-line import/no-unresolved
import { BubbleMenu } from "@tiptap/react/menus";
import type React from "react";

import { Group } from "metabase/ui";

import { FormatButton } from "./FormatButton";

interface EditorBubbleMenuProps {
  editor: TiptapEditor;
}

export const EditorBubbleMenu: React.FC<EditorBubbleMenuProps> = ({
  editor,
}) => {
  return (
    <BubbleMenu editor={editor}>
      <Group
        gap={4}
        style={{
          background: "white",
          border: "1px solid var(--mb-color-border)",
          borderRadius: "6px",
          padding: "2px",
          boxShadow: "0 2px 12px var(--mb-color-shadow)",
        }}
      >
        <FormatButton
          isActive={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          tooltip="Bold"
          icon="text_bold"
        />
        <FormatButton
          isActive={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          tooltip="Italic"
          icon="text_italic"
        />
        <FormatButton
          isActive={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          tooltip="Strikethrough"
          icon="text_strike"
        />
        <FormatButton
          isActive={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
          tooltip="Inline code"
          icon="format_code"
        />
        <FormatButton
          isActive={editor.isActive("heading", { level: 1 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
          tooltip="Heading 1"
          text="H1"
        />
        <FormatButton
          isActive={editor.isActive("heading", { level: 2 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          tooltip="Heading 2"
          text="H2"
        />
        <FormatButton
          isActive={editor.isActive("heading", { level: 3 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
          tooltip="Heading 3"
          text="H3"
        />
        <FormatButton
          isActive={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          tooltip="Bullet list"
          icon="list"
        />
        <FormatButton
          isActive={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          tooltip="Numbered list"
          icon="ordered_list"
        />
        <FormatButton
          isActive={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          tooltip="Quote"
          icon="quote"
        />
        <FormatButton
          isActive={editor.isActive("codeBlock")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          tooltip="Code block"
          icon="code_block"
        />
      </Group>
    </BubbleMenu>
  );
};

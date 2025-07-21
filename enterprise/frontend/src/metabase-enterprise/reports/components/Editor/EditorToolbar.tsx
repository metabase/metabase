import type { Editor } from "@tiptap/react";

import {
  ActionIcon,
  Divider,
  Group,
  Icon,
  Paper,
  Stack,
  Tooltip,
} from "metabase/ui";

import styles from "./EditorToolbar.module.css";

interface EditorToolbarProps {
  editor: Editor;
}

export const EditorToolbar = ({ editor }: EditorToolbarProps) => {
  const toggleBold = () => editor.chain().focus().toggleBold().run();
  const toggleItalic = () => editor.chain().focus().toggleItalic().run();
  const toggleCode = () => editor.chain().focus().toggleCode().run();
  const toggleHeading = (level: 1 | 2 | 3 | 4 | 5 | 6) =>
    editor.chain().focus().toggleHeading({ level }).run();
  const toggleBulletList = () =>
    editor.chain().focus().toggleBulletList().run();
  const toggleOrderedList = () =>
    editor.chain().focus().toggleOrderedList().run();
  const toggleBlockquote = () =>
    editor.chain().focus().toggleBlockquote().run();
  const insertHorizontalRule = () =>
    editor.chain().focus().setHorizontalRule().run();

  return (
    <Paper p="sm" className={styles.toolbar}>
      <div className={styles.toolbarContent}>
        <Stack spacing="xs">
          <Group spacing="xs">
            <Group spacing="xs">
              <Tooltip label="Bold (Ctrl+B)">
                <ActionIcon
                  onClick={toggleBold}
                  variant={editor.isActive("bold") ? "filled" : "subtle"}
                >
                  <Icon name="bolt" />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Italic (Ctrl+I)">
                <ActionIcon
                  onClick={toggleItalic}
                  variant={editor.isActive("italic") ? "filled" : "subtle"}
                >
                  <Icon name="pencil" />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Code">
                <ActionIcon
                  onClick={toggleCode}
                  variant={editor.isActive("code") ? "filled" : "subtle"}
                >
                  <Icon name="format_code" />
                </ActionIcon>
              </Tooltip>
            </Group>

            <Divider orientation="vertical" />

            <Group spacing="xs">
              <Tooltip label="Heading 1">
                <ActionIcon
                  onClick={() => toggleHeading(1)}
                  variant={
                    editor.isActive("heading", { level: 1 })
                      ? "filled"
                      : "subtle"
                  }
                >
                  {/* eslint-disable-next-line i18next/no-literal-string */}
                  <span className={styles.headingButton}>H1</span>
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Heading 2">
                <ActionIcon
                  onClick={() => toggleHeading(2)}
                  variant={
                    editor.isActive("heading", { level: 2 })
                      ? "filled"
                      : "subtle"
                  }
                >
                  {/* eslint-disable-next-line i18next/no-literal-string */}
                  <span className={styles.headingButton}>H2</span>
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Heading 3">
                <ActionIcon
                  onClick={() => toggleHeading(3)}
                  variant={
                    editor.isActive("heading", { level: 3 })
                      ? "filled"
                      : "subtle"
                  }
                >
                  {/* eslint-disable-next-line i18next/no-literal-string */}
                  <span className={styles.headingButton}>H3</span>
                </ActionIcon>
              </Tooltip>
            </Group>

            <Divider orientation="vertical" />

            <Group spacing="xs">
              <Tooltip label="Bullet List">
                <ActionIcon
                  onClick={toggleBulletList}
                  variant={editor.isActive("bulletList") ? "filled" : "subtle"}
                >
                  <Icon name="list" />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Numbered List">
                <ActionIcon
                  onClick={toggleOrderedList}
                  variant={editor.isActive("orderedList") ? "filled" : "subtle"}
                >
                  <Icon name="number" />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Blockquote">
                <ActionIcon
                  onClick={toggleBlockquote}
                  variant={editor.isActive("blockquote") ? "filled" : "subtle"}
                >
                  <Icon name="curved" />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Horizontal Rule">
                <ActionIcon onClick={insertHorizontalRule} variant="subtle">
                  <Icon name="dash" />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
        </Stack>
      </div>
    </Paper>
  );
};

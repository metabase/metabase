import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { Placeholder } from "@tiptap/extension-placeholder";
import type { EditorState } from "@tiptap/pm/state";
import type { JSONContent, Editor as TiptapEditor } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import cx from "classnames";
import type React from "react";
import { useEffect, useMemo } from "react";
import { t } from "ttag";

import { DND_IGNORE_CLASS_NAME } from "metabase/common/components/dnd";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { Box, Loader } from "metabase/ui";
import { useDocumentsStore } from "metabase-enterprise/documents/redux-utils";
import { getMentionsCache } from "metabase-enterprise/documents/selectors";
import type { DocumentsStoreState } from "metabase-enterprise/documents/types";
import { getMentionsCacheKey } from "metabase-enterprise/documents/utils/mentionsUtils";

import styles from "./Editor.module.css";
import { EditorBubbleMenu } from "./EditorBubbleMenu";
import { CardEmbed } from "./extensions/CardEmbed";
import { CommandExtension } from "./extensions/Command/CommandExtension";
import { CommandSuggestion } from "./extensions/Command/CommandSuggestion";
import { DisableMetabotSidebar } from "./extensions/DisableMetabotSidebar";
import { MentionExtension } from "./extensions/Mention/MentionExtension";
import { MentionSuggestion } from "./extensions/Mention/MentionSuggestion";
import { MetabotNode, type PromptSerializer } from "./extensions/MetabotEmbed";
import { MetabotMentionExtension } from "./extensions/MetabotMention/MetabotMentionExtension";
import { MetabotMentionSuggestion } from "./extensions/MetabotMention/MetabotSuggestion";
import { SmartLinkEmbed } from "./extensions/SmartLink";
import { Markdown } from "./extensions/markdown/index";
import { createSuggestionRenderer } from "./extensions/suggestionRenderer";
import { useCardEmbedsTracking, useQuestionSelection } from "./hooks";
import type { CardEmbedRef } from "./types";

const getMetabotPromptSerializer =
  (getState: () => DocumentsStoreState): PromptSerializer =>
  (node) => {
    const payload: ReturnType<PromptSerializer> = { instructions: "" };
    return node.content.content.reduce((acc, child) => {
      // Serialize @ mentions in the metabot prompt
      if (child.type.name === SmartLinkEmbed.name) {
        const { model, entityId } = child.attrs;
        const key = getMentionsCacheKey({ model, entityId });
        const value = getMentionsCache(getState())[key];
        if (!value) {
          return acc;
        }
        acc.instructions += `[${value.name}](${key})`;
        if (!acc.references) {
          acc.references = {};
        }
        acc.references[key] = value.name;
      } else {
        acc.instructions += child.textContent;
      }
      return acc;
    }, payload);
  };

const isMetabotBlock = (state: EditorState): boolean =>
  state.selection.$head.parent.type.name === "metabot";

export interface EditorProps {
  onEditorReady?: (editor: TiptapEditor) => void;
  onCardEmbedsChange?: (refs: CardEmbedRef[]) => void;
  initialContent?: JSONContent | null;
  onChange?: (content: JSONContent) => void;
  onContentChanged?: () => void; // Simple dirty flag callback
  onQuestionSelect?: (cardId: number | null) => void;
  editable?: boolean;
  isLoading?: boolean;
}

export const Editor: React.FC<EditorProps> = ({
  onEditorReady,
  onCardEmbedsChange,
  initialContent,
  onChange,
  onContentChanged,
  editable = true,
  onQuestionSelect,
  isLoading = false,
}) => {
  const siteUrl = useSelector((state) => getSetting(state, "site-url"));
  const { getState } = useDocumentsStore();

  const extensions = useMemo(
    () => [
      StarterKit,
      Image.configure({
        inline: false,
        HTMLAttributes: {
          class: styles.img,
        },
      }),
      SmartLinkEmbed.configure({
        HTMLAttributes: {
          class: "smart-link",
        },
        siteUrl,
      }),
      Link.configure({
        HTMLAttributes: {
          class: CS.link,
        },
      }),
      Placeholder.configure({
        placeholder: t`Start writing, press "/" to open command palette, or "@" to insert a link...`,
      }),
      Markdown,
      CardEmbed,
      MetabotNode.configure({
        serializePrompt: getMetabotPromptSerializer(getState),
      }),
      DisableMetabotSidebar,
      MentionExtension.configure({
        suggestion: {
          allow: ({ state }) => !isMetabotBlock(state),
          render: createSuggestionRenderer(MentionSuggestion),
        },
      }),
      CommandExtension.configure({
        suggestion: {
          allow: ({ state }) => !isMetabotBlock(state),
          render: createSuggestionRenderer(CommandSuggestion),
        },
      }),
      MetabotMentionExtension.configure({
        suggestion: {
          allow: ({ state }) => isMetabotBlock(state),
          render: createSuggestionRenderer(MetabotMentionSuggestion),
        },
      }),
    ],
    [siteUrl, getState],
  );

  const editor = useEditor(
    {
      extensions,
      content: initialContent || "",
      autofocus: false,
      immediatelyRender: false,
      onUpdate: ({ editor }) => {
        const currentContent = editor.getJSON();
        onChange?.(currentContent);

        // Simple content changed notification
        if (!editor.isEmpty) {
          onContentChanged?.();
        }
      },
    },
    [],
  );

  // Handle content updates when initialContent changes
  useEffect(() => {
    if (editor && initialContent !== undefined) {
      // Use Promise.resolve() to avoid flushSync warning
      Promise.resolve().then(() => {
        editor.commands.setContent(initialContent || "");
      });
    }
  }, [editor, initialContent]);

  // Notify parent when editor is ready
  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor);
    }
  }, [editor, onEditorReady]);

  // Update editor editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  useCardEmbedsTracking(editor, onCardEmbedsChange);
  useQuestionSelection(editor, onQuestionSelect);

  if (!editor) {
    return null;
  }

  if (isLoading) {
    return (
      <Box className={cx(styles.editor, DND_IGNORE_CLASS_NAME)}>
        <Loader />
      </Box>
    );
  }

  return (
    <Box className={cx(styles.editor, DND_IGNORE_CLASS_NAME)}>
      <Box
        className={styles.editorContent}
        onClick={(e) => {
          // Focus editor when clicking on empty space
          const target = e.target as HTMLElement;
          if (
            target.classList.contains(styles.editorContent) ||
            target.classList.contains("ProseMirror")
          ) {
            const clickY = e.clientY;
            const proseMirrorElement = target.querySelector(".ProseMirror");

            if (proseMirrorElement) {
              const proseMirrorRect =
                proseMirrorElement.getBoundingClientRect();
              const isClickBelowContent = clickY > proseMirrorRect.bottom;

              if (isClickBelowContent) {
                // Only move to end if clicking below the actual content
                editor.commands.focus("end");
              } else {
                // Just focus without changing cursor position for clicks in padding areas
                editor.commands.focus();
              }
            } else {
              // Fallback: just focus without position change
              editor.commands.focus();
            }
          }
        }}
      >
        <EditorContent data-testid="document-content" editor={editor} />
        <EditorBubbleMenu editor={editor} />
      </Box>
    </Box>
  );
};

import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { Placeholder } from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import type { EditorState } from "@tiptap/pm/state";
import type { JSONContent, Editor as TiptapEditor } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import cx from "classnames";
import type React from "react";
import { useEffect, useMemo } from "react";
import { t } from "ttag";

import { DND_IGNORE_CLASS_NAME } from "metabase/common/components/dnd";
import CS from "metabase/css/core/index.css";
import { useSelector, useStore } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { Box, Loader } from "metabase/ui";
import { getMentionsCache } from "metabase-enterprise/documents/selectors";
import type { DocumentsStoreState } from "metabase-enterprise/documents/types";
import { getMentionsCacheKey } from "metabase-enterprise/documents/utils/mentionsUtils";

import S from "./Editor.module.css";
import { EditorBubbleMenu } from "./EditorBubbleMenu";
import { CardEmbed } from "./extensions/CardEmbed/CardEmbedNode";
import { CommandExtension } from "./extensions/Command/CommandExtension";
import { CommandSuggestion } from "./extensions/Command/CommandSuggestion";
import { CustomStarterKit } from "./extensions/CustomStarterKit/CustomStarterKit";
import { DisableMetabotSidebar } from "./extensions/DisableMetabotSidebar";
import { MentionExtension } from "./extensions/Mention/MentionExtension";
import { MentionSuggestion } from "./extensions/Mention/MentionSuggestion";
import { MetabotNode, type PromptSerializer } from "./extensions/MetabotEmbed";
import { MetabotMentionExtension } from "./extensions/MetabotMention/MetabotMentionExtension";
import { MetabotMentionSuggestion } from "./extensions/MetabotMention/MetabotSuggestion";
import { SmartLink } from "./extensions/SmartLink/SmartLinkNode";
import { createSuggestionRenderer } from "./extensions/suggestionRenderer";
import { useCardEmbedsTracking, useQuestionSelection } from "./hooks";
import type { CardEmbedRef } from "./types";

const BUBBLE_MENU_DISALLOWED_NODES: string[] = [
  CardEmbed.name,
  MetabotNode.name,
  SmartLink.name,
  Image.name,
  "codeBlock",
];

const getMetabotPromptSerializer =
  (getState: () => DocumentsStoreState): PromptSerializer =>
  (node) => {
    const payload: ReturnType<PromptSerializer> = { instructions: "" };
    return node.content.content.reduce((acc, child) => {
      // Serialize @ mentions in the metabot prompt
      if (child.type.name === SmartLink.name) {
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
  onQuestionSelect?: (cardId: number | null) => void;
  editable?: boolean;
  isLoading?: boolean;
}

export const Editor: React.FC<EditorProps> = ({
  onEditorReady,
  onCardEmbedsChange,
  initialContent,
  onChange,
  editable = true,
  onQuestionSelect,
  isLoading = false,
}) => {
  const siteUrl = useSelector((state) => getSetting(state, "site-url"));
  const { getState } = useStore();

  const extensions = useMemo(
    () => [
      CustomStarterKit,
      Image.configure({
        inline: false,
        HTMLAttributes: {
          class: S.img,
        },
      }),
      SmartLink.configure({
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
      CardEmbed,
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
      MetabotNode.configure({
        serializePrompt: getMetabotPromptSerializer(getState),
      }),
      DisableMetabotSidebar,
      MetabotMentionExtension.configure({
        suggestion: {
          allow: ({ state }) => isMetabotBlock(state),
          render: createSuggestionRenderer(MetabotMentionSuggestion),
        },
      }),
      TableKit.configure({
        table: { resizable: true },
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
        if (onChange) {
          const currentContent = editor.getJSON();
          onChange(currentContent);
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
        editor
          .chain()
          .setMeta("addToHistory", false)
          .setContent(initialContent || "")
          .run();
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!active || !over || active.id === over.id) {
      return;
    }

    // Handle reordering of CardEmbed nodes
    if (editor && active.id.toString().startsWith("card-embed-")) {
      const sourceId = active.id.toString().replace("card-embed-", "");
      const targetZoneId = over.id.toString().replace("drop-zone-", "");
      const direction = over.id.toString().includes("-left") ? "left" : "right";
      const targetId = targetZoneId.replace("-left", "").replace("-right", "");

      // Don't allow dropping next to itself
      if (sourceId === targetId) {
        return;
      }

      // Find the source and target nodes in the document
      let sourcePos = -1;
      let targetPos = -1;
      let sourceNode: any = null;
      let targetNode: any = null;

      editor.state.doc.descendants((node, pos) => {
        if (
          node.type.name === "cardEmbed" &&
          node.attrs.id?.toString() === sourceId
        ) {
          sourcePos = pos;
          sourceNode = node;
        }
        if (
          node.type.name === "cardEmbed" &&
          node.attrs.id?.toString() === targetId
        ) {
          targetPos = pos;
          targetNode = node;
        }
      });

      if (sourcePos !== -1 && targetPos !== -1 && sourceNode && targetNode) {
        // Create a table with two columns containing the CardEmbeds
        const leftCardEmbed =
          direction === "left" ? sourceNode.toJSON() : targetNode.toJSON();
        const rightCardEmbed =
          direction === "left" ? targetNode.toJSON() : sourceNode.toJSON();

        const tableContent = {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [leftCardEmbed],
                },
                {
                  type: "tableCell",
                  content: [rightCardEmbed],
                },
              ],
            },
          ],
        };

        // Remove both nodes and insert the table at the target position
        const tr = editor.state.tr;

        // Delete nodes in reverse order to maintain positions
        if (sourcePos > targetPos) {
          tr.delete(sourcePos, sourcePos + sourceNode.nodeSize);
          tr.delete(targetPos, targetPos + targetNode.nodeSize);
        } else {
          tr.delete(targetPos, targetPos + targetNode.nodeSize);
          tr.delete(sourcePos, sourcePos + sourceNode.nodeSize);
        }

        // Insert the table at the position of whichever node was first
        const insertPos = Math.min(sourcePos, targetPos);
        tr.insert(insertPos, editor.schema.nodeFromJSON(tableContent));
        editor.view.dispatch(tr);
      }
    }
  };

  if (!editor) {
    return null;
  }

  if (isLoading) {
    return (
      <Box className={cx(S.editor, DND_IGNORE_CLASS_NAME)}>
        <Loader data-testid="editor-loader" />
      </Box>
    );
  }

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <Box className={cx(S.editor, DND_IGNORE_CLASS_NAME)}>
        <Box
          className={S.editorContent}
          onClick={(e) => {
            // Focus editor when clicking on empty space
            const target = e.target as HTMLElement;
            if (
              target.classList.contains(S.editorContent) ||
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
          <EditorBubbleMenu
            editor={editor}
            disallowedNodes={BUBBLE_MENU_DISALLOWED_NODES}
          />
        </Box>
      </Box>
    </DndContext>
  );
};

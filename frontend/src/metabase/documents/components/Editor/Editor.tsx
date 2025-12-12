import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extension-placeholder";
import type { JSONContent, Editor as TiptapEditor } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import cx from "classnames";
import type React from "react";
import { useEffect, useMemo } from "react";
import { useLatest, usePrevious } from "react-use";
import { t } from "ttag";

import { DND_IGNORE_CLASS_NAME } from "metabase/common/components/dnd";
import { getMentionsCache } from "metabase/documents/selectors";
import { isMetabotBlock } from "metabase/documents/utils/editorNodeUtils";
import { getMentionsCacheKey } from "metabase/documents/utils/mentionsUtils";
import { useSelector, useStore } from "metabase/lib/redux";
import { EditorBubbleMenu } from "metabase/rich_text_editing/tiptap/components/EditorBubbleMenu/EditorBubbleMenu";
import { CardEmbed } from "metabase/rich_text_editing/tiptap/extensions/CardEmbed/CardEmbedNode";
import { CommandExtension } from "metabase/rich_text_editing/tiptap/extensions/Command/CommandExtension";
import { CommandSuggestion } from "metabase/rich_text_editing/tiptap/extensions/Command/CommandSuggestion";
import { CustomStarterKit } from "metabase/rich_text_editing/tiptap/extensions/CustomStarterKit/CustomStarterKit";
import { DisableMetabotSidebar } from "metabase/rich_text_editing/tiptap/extensions/DisableMetabotSidebar";
import DropCursorS from "metabase/rich_text_editing/tiptap/extensions/DropCursor/DropCursor.module.css";
import { FlexContainer } from "metabase/rich_text_editing/tiptap/extensions/FlexContainer/FlexContainer";
import { HandleEditorDrop } from "metabase/rich_text_editing/tiptap/extensions/HandleEditorDrop/HandleEditorDrop";
import { LinkHoverMenu } from "metabase/rich_text_editing/tiptap/extensions/LinkHoverMenu/LinkHoverMenu";
import { MentionExtension } from "metabase/rich_text_editing/tiptap/extensions/Mention/MentionExtension";
import { MentionSuggestion } from "metabase/rich_text_editing/tiptap/extensions/Mention/MentionSuggestion";
import {
  MetabotNode,
  type PromptSerializer,
} from "metabase/rich_text_editing/tiptap/extensions/MetabotEmbed";
import { MetabotMentionExtension } from "metabase/rich_text_editing/tiptap/extensions/MetabotMention/MetabotMentionExtension";
import { MetabotMentionSuggestion } from "metabase/rich_text_editing/tiptap/extensions/MetabotMention/MetabotSuggestion";
import { PlainLink } from "metabase/rich_text_editing/tiptap/extensions/PlainLink/PlainLink";
import { ResizeNode } from "metabase/rich_text_editing/tiptap/extensions/ResizeNode/ResizeNode";
import { SmartLink } from "metabase/rich_text_editing/tiptap/extensions/SmartLink/SmartLinkNode";
import { SupportingText } from "metabase/rich_text_editing/tiptap/extensions/SupportingText/SupportingText";
import { DROP_ZONE_COLOR } from "metabase/rich_text_editing/tiptap/extensions/shared/constants";
import { createSuggestionRenderer } from "metabase/rich_text_editing/tiptap/extensions/suggestionRenderer";
import { getSetting } from "metabase/selectors/settings";
import { Box, Loader } from "metabase/ui";
import type { State } from "metabase-types/store";
import type { CardEmbedRef } from "metabase-types/store/documents";

import S from "./Editor.module.css";
import { useCardEmbedsTracking, useQuestionSelection } from "./hooks";

const BUBBLE_MENU_DISALLOWED_NODES: string[] = [
  CardEmbed.name,
  MetabotNode.name,
  SmartLink.name,
  Image.name,
  "codeBlock",
];

const BUBBLE_MENU_DISALLOWED_FULLY_SELECTED_NODES: string[] = [
  SupportingText.name,
];

const getMetabotPromptSerializer =
  (getState: () => State): PromptSerializer =>
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
      CustomStarterKit.configure({
        dropcursor: {
          color: DROP_ZONE_COLOR,
          width: 2,
          class: DropCursorS.dropCursor,
        },
      }),
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
      PlainLink.configure({
        defaultProtocol: "https",
      }),
      Placeholder.configure({
        placeholder: t`Start writing, type "/" to list commands, or "@" to mention an item...`,
      }),
      CardEmbed,
      FlexContainer,
      SupportingText,
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
      ResizeNode,
      HandleEditorDrop,
    ],
    [siteUrl, getState],
  );

  const editor = useEditor(
    {
      extensions,
      content: initialContent || "",
      autofocus: false,
      editable,
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
  const previousContentRef = useLatest(usePrevious(initialContent));
  useEffect(() => {
    const previousContent = previousContentRef.current;
    if (editor && initialContent !== undefined) {
      // Use Promise.resolve() to avoid flushSync warning
      Promise.resolve().then(() => {
        editor
          .chain()
          .setMeta("addToHistory", previousContent != null)
          .setContent(initialContent || "")
          .run();
      });
    }
  }, [editor, initialContent, previousContentRef]);

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
      <Box className={cx(S.editor, DND_IGNORE_CLASS_NAME)}>
        <Loader data-testid="editor-loader" />
      </Box>
    );
  }

  return (
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

        {editable && (
          <EditorBubbleMenu
            editor={editor}
            disallowedNodes={BUBBLE_MENU_DISALLOWED_NODES}
            disallowedFullySelectedNodes={
              BUBBLE_MENU_DISALLOWED_FULLY_SELECTED_NODES
            }
          />
        )}
        <Box pos="absolute" top={0} left={0} w="100%">
          <Box className={S.editorContentInner} pos="relative">
            <LinkHoverMenu editor={editor} editable={editable} />
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

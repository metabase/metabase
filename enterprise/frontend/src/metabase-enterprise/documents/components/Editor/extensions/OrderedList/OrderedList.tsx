import { autoUpdate, useFloating } from "@floating-ui/react";
import {
  Node,
  type NodeViewProps,
  mergeAttributes,
  wrappingInputRule,
} from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import cx from "classnames";
import { useEffect, useMemo, useState } from "react";

import { getTargetChildCommentThreads } from "metabase-enterprise/comments/utils";
import { useDocumentContext } from "metabase-enterprise/documents/components/DocumentContext";
import { isTopLevel } from "metabase-enterprise/documents/utils/editorNodeUtils";

import { CommentsMenu } from "../../CommentsMenu";
import { createIdAttribute, createProseMirrorPlugin } from "../NodeIds";

import S from "./OrderedList.module.css";

const ListItemName = "listItem";
const TextStyleName = "textStyle";

export interface OrderedListOptions {
  /**
   * The node type name for list items.
   * @default 'listItem'
   * @example 'myListItem'
   */
  itemTypeName: string;

  /**
   * The HTML attributes for an ordered list node.
   * @default {}
   * @example { class: 'foo' }
   */
  HTMLAttributes: Record<string, any>;

  /**
   * Keep the marks when splitting a list item.
   * @default false
   * @example true
   */
  keepMarks: boolean;

  /**
   * Keep the attributes when splitting a list item.
   * @default false
   * @example true
   */
  keepAttributes: boolean;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    orderedList: {
      /**
       * Toggle an ordered list
       * @example editor.commands.toggleOrderedList()
       */
      toggleOrderedList: () => ReturnType;
    };
  }
}

/**
 * Matches an ordered list to a 1. on input (or any number followed by a dot).
 */
export const orderedListInputRegex = /^(\d+)\.\s$/;

/**
 * This extension allows you to create ordered lists.
 * This requires the ListItem extension
 * @see https://www.tiptap.dev/api/nodes/ordered-list
 * @see https://www.tiptap.dev/api/nodes/list-item
 */
export const OrderedList = Node.create<OrderedListOptions>({
  name: "orderedList",

  addOptions() {
    return {
      itemTypeName: "listItem",
      HTMLAttributes: {},
      keepMarks: false,
      keepAttributes: false,
    };
  },

  group: "block list",

  content() {
    return `${this.options.itemTypeName}+`;
  },

  addAttributes() {
    return {
      start: {
        default: 1,
        parseHTML: (element) => {
          return element.hasAttribute("start")
            ? parseInt(element.getAttribute("start") || "", 10)
            : 1;
        },
      },
      type: {
        default: null,
        parseHTML: (element) => element.getAttribute("type"),
      },
      ...createIdAttribute(),
    };
  },

  parseHTML() {
    return [
      {
        tag: "ol",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { start, ...attributesWithoutStart } = HTMLAttributes;

    return start === 1
      ? [
          "ol",
          mergeAttributes(this.options.HTMLAttributes, attributesWithoutStart),
          0,
        ]
      : ["ol", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(OrderedListNodeView);
  },

  addProseMirrorPlugins() {
    return [createProseMirrorPlugin("orderedList")];
  },

  addCommands() {
    return {
      toggleOrderedList:
        () =>
        ({ commands, chain }) => {
          if (this.options.keepAttributes) {
            return chain()
              .toggleList(
                this.name,
                this.options.itemTypeName,
                this.options.keepMarks,
              )
              .updateAttributes(
                ListItemName,
                this.editor.getAttributes(TextStyleName),
              )
              .run();
          }
          return commands.toggleList(
            this.name,
            this.options.itemTypeName,
            this.options.keepMarks,
          );
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Shift-7": () => this.editor.commands.toggleOrderedList(),
    };
  },

  addInputRules() {
    let inputRule = wrappingInputRule({
      find: orderedListInputRegex,
      type: this.type,
      getAttributes: (match) => ({ start: +match[1] }),
      joinPredicate: (match, node) =>
        node.childCount + node.attrs.start === +match[1],
    });

    if (this.options.keepMarks || this.options.keepAttributes) {
      inputRule = wrappingInputRule({
        find: orderedListInputRegex,
        type: this.type,
        keepMarks: this.options.keepMarks,
        keepAttributes: this.options.keepAttributes,
        getAttributes: (match) => ({
          start: +match[1],
          ...this.editor.getAttributes(TextStyleName),
        }),
        joinPredicate: (match, node) =>
          node.childCount + node.attrs.start === +match[1],
        editor: this.editor,
      });
    }
    return [inputRule];
  },
});

export const OrderedListNodeView = ({
  node,
  editor,
  getPos,
}: NodeViewProps) => {
  const { childTargetId, comments, document, hasUnsavedChanges } =
    useDocumentContext();
  const [hovered, setHovered] = useState(false);
  const [rendered, setRendered] = useState(false); // floating ui wrongly positions things without this
  const { _id } = node.attrs;
  const isOpen = childTargetId === _id;
  const threads = useMemo(
    () => getTargetChildCommentThreads(comments, _id),
    [comments, _id],
  );
  const { refs, floatingStyles } = useFloating({
    placement: "left-start",
    whileElementsMounted: autoUpdate,
    strategy: "fixed",
    open: rendered,
  });

  useEffect(() => {
    if (!rendered) {
      setRendered(true);
    }
  }, [rendered]);

  return (
    <>
      <NodeViewWrapper
        className={cx(S.orderedList, {
          [S.open]: isOpen,
        })}
        ref={refs.setReference}
        // onMouseEnter/onMouseLeave do not work on list elements living in contentEditable
        onMouseOver={() => setHovered(true)}
        onMouseOut={() => setHovered(false)}
      >
        <ol>
          <NodeViewContent />
        </ol>
      </NodeViewWrapper>

      {document && rendered && isTopLevel({ editor, getPos }) && (
        <CommentsMenu
          active={isOpen}
          disabled={hasUnsavedChanges}
          href={`/document/${document.id}/comments/${_id}`}
          ref={refs.setFloating}
          show={isOpen || hovered}
          threads={threads}
          style={floatingStyles}
        />
      )}
    </>
  );
};

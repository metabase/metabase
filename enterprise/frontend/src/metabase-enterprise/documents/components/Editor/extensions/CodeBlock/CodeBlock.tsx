import { autoUpdate, useFloating } from "@floating-ui/react";
import type { NodeViewProps } from "@tiptap/core";
import { CodeBlock } from "@tiptap/extension-code-block";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import cx from "classnames";
import { useEffect, useMemo, useState } from "react";

import { useSelector } from "metabase/lib/redux";
import { useListCommentsQuery } from "metabase-enterprise/api";
import { getTargetChildCommentThreads } from "metabase-enterprise/comments/utils";
import {
  getChildTargetId,
  getCurrentDocument,
  getHasUnsavedChanges,
} from "metabase-enterprise/documents/selectors";
import { getListCommentsQuery } from "metabase-enterprise/documents/utils/api";

import { CommentsMenu } from "../../CommentsMenu";
import { createIdAttribute, createProseMirrorPlugin } from "../NodeIds";

import S from "./CodeBlock.module.css";

const languageClassPrefix = "language-";

export const CustomCodeBlock = CodeBlock.extend({
  addAttributes() {
    return {
      language: {
        default: this.options.defaultLanguage,
        parseHTML: (element: HTMLElement) => {
          const { languageClassPrefix } = this.options;
          const classNames = [...(element.firstElementChild?.classList || [])];
          const languages = classNames
            .filter((className) => className.startsWith(languageClassPrefix))
            .map((className) => className.replace(languageClassPrefix, ""));
          const language = languages[0];

          if (!language) {
            return null;
          }

          return language;
        },
        rendered: false,
      },
      ...createIdAttribute(),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView);
  },

  addProseMirrorPlugins() {
    return [
      createProseMirrorPlugin(CodeBlock.name), // this plugin creates a code block for pasted content from VS Code
      // we can also detect the copied code language
      new Plugin({
        key: new PluginKey("codeBlockVSCodeHandler"),
        props: {
          handlePaste: (view, event) => {
            if (!event.clipboardData) {
              return false;
            }

            // don’t create a new code block within code blocks
            if (this.editor.isActive(this.type.name)) {
              return false;
            }

            const text = event.clipboardData.getData("text/plain");
            const vscode = event.clipboardData.getData("vscode-editor-data");
            const vscodeData = vscode ? JSON.parse(vscode) : undefined;
            const language = vscodeData?.mode;

            if (!text || !language) {
              return false;
            }

            const { tr, schema } = view.state;

            // prepare a text node
            // strip carriage return chars from text pasted as code
            // see: https://github.com/ProseMirror/prosemirror-view/commit/a50a6bcceb4ce52ac8fcc6162488d8875613aacd
            const textNode = schema.text(text.replace(/\r\n?/g, "\n"));

            // create a code block with the text node
            // replace selection with the code block
            tr.replaceSelectionWith(this.type.create({ language }, textNode));

            if (tr.selection.$from.parent.type !== this.type) {
              // put cursor inside the newly created code block
              tr.setSelection(
                TextSelection.near(
                  tr.doc.resolve(Math.max(0, tr.selection.from - 2)),
                ),
              );
            }

            // store meta information
            // this is useful for other plugins that depends on the paste event
            // like the paste rule plugin
            tr.setMeta("paste", true);

            view.dispatch(tr);

            return true;
          },
        },
      }),
    ];
  },
});

export const CodeBlockNodeView = ({ node }: NodeViewProps) => {
  const childTargetId = useSelector(getChildTargetId);
  const document = useSelector(getCurrentDocument);
  const { data: commentsData } = useListCommentsQuery(
    getListCommentsQuery(document),
  );
  const comments = commentsData?.comments;
  const hasUnsavedChanges = useSelector(getHasUnsavedChanges);
  const [hovered, setHovered] = useState(false);
  const [rendered, setRendered] = useState(false); // floating ui wrongly positions things without this
  const { _id } = node.attrs;
  const isOpen = childTargetId === _id;
  const threads = useMemo(
    () => getTargetChildCommentThreads(comments, _id),
    [comments, _id],
  );
  const { refs, floatingStyles } = useFloating({
    placement: "right-start",
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
        className={cx(S.codeBlock, {
          [S.open]: isOpen,
        })}
        ref={refs.setReference}
        onMouseOver={() => setHovered(true)}
        onMouseOut={() => setHovered(false)}
      >
        <pre>
          <NodeViewContent<"code">
            as="code"
            className={
              node.attrs.language
                ? languageClassPrefix + node.attrs.language
                : undefined
            }
          />
        </pre>
      </NodeViewWrapper>

      {document && rendered && (
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

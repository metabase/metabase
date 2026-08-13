import type { NodeViewProps } from "@tiptap/core";
import { CodeBlock, type CodeBlockOptions } from "@tiptap/extension-code-block";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { NodeViewContent, ReactNodeViewRenderer } from "@tiptap/react";

import { createIdAttribute, createProseMirrorPlugin } from "../NodeIds";
import { type BlockNodeOptions, DefaultBlockShell } from "../shared/BlockShell";

const languageClassPrefix = "language-";

export const CustomCodeBlock = CodeBlock.extend<
  CodeBlockOptions & BlockNodeOptions
>({
  addAttributes() {
    return {
      language: {
        default: this.options.defaultLanguage,
        parseHTML: (element: HTMLElement) => {
          const prefix =
            this.options.languageClassPrefix ?? languageClassPrefix;
          const classNames = [...(element.firstElementChild?.classList || [])];
          const languages = classNames
            .filter((className) => className.startsWith(prefix))
            .map((className) => className.replace(prefix, ""));
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
      createProseMirrorPlugin(CodeBlock.name),
      // this plugin creates a code block for pasted content from VS Code
      // we can also detect the copied code language
      //
      // https://github.com/ueberdosis/tiptap/blob/7b4e6f5/packages/extension-code-block/src/code-block.ts#L266-L314
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

export const CodeBlockNodeView = ({
  node,
  editor,
  getPos,
  extension,
}: NodeViewProps) => {
  const BlockShell = extension.options.blockShell ?? DefaultBlockShell;

  return (
    <BlockShell
      node={node}
      editor={editor}
      getPos={getPos}
      hideMenus={extension.options.editorContext === "comments"}
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
    </BlockShell>
  );
};

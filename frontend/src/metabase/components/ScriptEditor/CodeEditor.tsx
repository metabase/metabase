/* eslint-ignore no-restricted-imports -- for hackathon velocity */

import S from "./ScriptEditor.module.css";
import { RichTextEditor, RichTextEditorProps } from "@mantine/tiptap";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { createLowlight } from "lowlight";
import ts from "highlight.js/lib/languages/typescript";
import { forwardRef } from "react";
import { Script } from "./types";

const lowlight = createLowlight();
lowlight.register({ ts });

export const CodeEditor = forwardRef<
  HTMLDivElement,
  { script: Pick<Script, "code">; onChange: (value: string) => void } & Omit<
    Partial<RichTextEditorProps>,
    "onChange"
  >
>(function CodeEditor({ script, onChange, ...props }, ref) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure(),
      CodeBlockLowlight.configure({ lowlight }),
    ],
    content: "<pre><code>" + script.code + "</code></pre>",
    onUpdate: ({ editor }) => {
      // Remove <pre> and <code> tags
      const html = editor
        .getHTML()
        .replace(/^<pre><code>/, "")
        .replace(/<\/code><\/pre>$/, "");
      onChange(html);
    },
  });

  return (
    <RichTextEditor
      ref={ref}
      editor={editor}
      className={S.CodeBlock}
      style={{ overflowY: "auto" }}
      spellCheck={false}
      mih="5rem"
      {...props}
    >
      <RichTextEditor.Content mih="5rem" w="100%" style={{ display: "flex" }} />
    </RichTextEditor>
  );
});

import { Editor, Node } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";

import { CommandExtension } from "./CommandExtension";

const MetabotBlock = Node.create({
  name: "metabot",
  group: "block",
  content: "inline*",
  renderHTML: () => ["div", 0],
});

const setup = () => {
  const editor = new Editor({
    extensions: [Document, Paragraph, Text, MetabotBlock, CommandExtension],
    content: "<p>/</p>",
  });
  const runCommand = CommandExtension.options.suggestion.command;
  if (!runCommand) {
    throw new Error("CommandExtension has no suggestion command");
  }

  return { editor, runCommand };
};

describe("CommandExtension", () => {
  it("replaces the slash query with a Metabot block for the metabot command", () => {
    const { editor, runCommand } = setup();

    runCommand({
      editor,
      range: { from: 1, to: 2 },
      props: { command: "metabot" },
    });

    expect(editor.getJSON().content).toEqual([
      expect.objectContaining({ type: "metabot" }),
    ]);
    expect(editor.getText()).not.toContain("/");

    editor.destroy();
  });
});

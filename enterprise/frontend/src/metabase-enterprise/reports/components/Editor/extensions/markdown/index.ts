import { Extension } from "@tiptap/core";
import MarkdownIt from "markdown-it";
import {
  MarkdownParser,
  MarkdownSerializer,
  type ParseSpec,
} from "prosemirror-markdown";

import { createParserTokens } from "./markdown-to-prosemirror";
import {
  createMarkSerializers,
  createNodeSerializers,
} from "./prosemirror-to-markdown";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    markdown: {
      getMarkdown: () => string extends ReturnType ? string : ReturnType;
      setMarkdown: (markdown: string) => ReturnType;
    };
  }

  interface Storage {
    markdown: MarkdownStorage;
  }
}

export interface MarkdownStorage {
  getMarkdown: () => string;
  setMarkdown: (markdown: string, emit?: boolean) => void;
  parser: MarkdownParser | null;
  serializer: MarkdownSerializer | null;
}

export const Markdown = Extension.create<
  {
    extraNodeSerializers?: MarkdownSerializer["nodes"];
    extraTokenSpecs?: Record<string, ParseSpec>;
    extraMarkSerializers?: MarkdownSerializer["marks"];
  },
  MarkdownStorage
>({
  name: "markdown",

  addOptions() {
    return {
      extraNodeSerializers: {},
      extraTokenSpecs: {},
      extraMarkSerializers: {},
    };
  },

  addStorage() {
    return {
      parser: null,
      serializer: null,
      getMarkdown: () => "",
      setMarkdown: () => {},
    } as MarkdownStorage;
  },

  onBeforeCreate() {
    const getSerializer = () => {
      if (this.storage.serializer) {
        return this.storage.serializer;
      }

      const schema = this.editor.state.schema;
      const nodeSerializers = createNodeSerializers(
        this.options.extraNodeSerializers,
      );
      const markSerializers = createMarkSerializers(
        this.options.extraMarkSerializers,
      );

      // Validate that all nodes in schema have serializers
      const missingNodeSerializers = Object.keys(schema.nodes).filter(
        (nodeName) => !nodeSerializers[nodeName],
      );
      if (missingNodeSerializers.length > 0) {
        throw new Error(
          `Missing serializers for nodes: ${missingNodeSerializers.join(", ")}`,
        );
      }

      // Validate that all marks in schema have serializers
      const missingMarkSerializers = Object.keys(schema.marks).filter(
        (markName) => !markSerializers[markName],
      );
      if (missingMarkSerializers.length > 0) {
        throw new Error(
          `Missing serializers for marks: ${missingMarkSerializers.join(", ")}`,
        );
      }

      this.storage.serializer = new MarkdownSerializer(
        nodeSerializers,
        markSerializers,
        {
          hardBreakNodeName: "hardBreak",
        },
      );

      return this.storage.serializer;
    };

    const getParser = () => {
      if (this.storage.parser) {
        return this.storage.parser;
      }

      const schema = this.editor.state.schema;
      const md = new MarkdownIt("commonmark", {
        html: false,
        linkify: true,
        breaks: false,
      });

      const tokens = createParserTokens(this.options.extraTokenSpecs);

      this.storage.parser = new MarkdownParser(schema, md, tokens);
      return this.storage.parser;
    };

    this.storage.getMarkdown = () => {
      return getSerializer().serialize(this.editor.state.doc, {
        tightLists: false, // Allow loose lists to preserve spacing
      });
    };

    this.storage.setMarkdown = (markdown: string) => {
      queueMicrotask(() => {
        const doc = getParser().parse(markdown);
        if (doc) {
          this.editor.commands.setContent(doc.toJSON());
        }
      });
    };
  },

  addCommands() {
    return {
      getMarkdown: () => () => {
        // Return the actual markdown string instead of boolean
        // This breaks TipTap's command pattern but matches expected usage
        return this.storage.getMarkdown() as any;
      },

      setMarkdown: (markdown: string) => () => {
        this.storage.setMarkdown(markdown, true);
        return true;
      },
    };
  },
});

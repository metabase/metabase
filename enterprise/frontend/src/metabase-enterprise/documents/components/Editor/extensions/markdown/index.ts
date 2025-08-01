import { Extension } from "@tiptap/core";
import MarkdownIt from "markdown-it";
import {
  MarkdownParser,
  MarkdownSerializer,
  type ParseSpec,
} from "prosemirror-markdown";

import { cardPlugin } from "./cardPlugin";
import { linkPlugin } from "./linkPlugin";
import { createParserTokens } from "./markdown-to-prosemirror";
import {
  createMarkSerializers,
  createNodeSerializers,
} from "./prosemirror-to-markdown";
import { spacerPlugin } from "./spacerPlugin";

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
        console.error(
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

      md.use(spacerPlugin);
      md.use(cardPlugin);
      md.use(linkPlugin);

      // Add a rule to expand spacer tokens to multiple empty paragraphs
      md.core.ruler.after("block", "expand_spacers", (state) => {
        const tokens = state.tokens;
        const newTokens = [];

        for (let i = 0; i < tokens.length; i++) {
          const token = tokens[i];

          if (token.type === "spacer") {
            const lines = parseInt(token.attrGet("lines") ?? "1", 10);

            // Create multiple empty paragraph tokens
            for (let j = 0; j < lines; j++) {
              const pOpen = new state.Token("paragraph_open", "p", 1);
              pOpen.block = true;
              pOpen.map = token.map; // Preserve source mapping

              const inline = new state.Token("inline", "", 0);
              inline.content = "";
              inline.children = [];
              inline.nesting = 0;

              const pClose = new state.Token("paragraph_close", "p", -1);
              pClose.block = true;

              newTokens.push(pOpen, inline, pClose);
            }
          } else {
            newTokens.push(token);
          }
        }

        state.tokens = newTokens;
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
      try {
        if (!markdown || typeof markdown !== "string") {
          console.warn("Invalid markdown content provided:", markdown);
          return;
        }

        const doc = getParser().parse(markdown);
        if (!doc) {
          console.warn("Failed to parse markdown into document");
          return;
        }

        if (!this.editor || this.editor.isDestroyed) {
          console.warn("Editor is not available or destroyed");
          return;
        }

        // Check if the editor is ready and has a valid schema
        if (!this.editor.state || !this.editor.state.schema) {
          console.warn("Editor not ready for content update");
          return;
        }

        // Validate that the document matches the schema
        try {
          const docJSON = doc.toJSON();
          this.editor.chain().setContent(docJSON).run();
        } catch (validationError) {
          console.error("Document validation failed:", validationError);
        }
      } catch (error) {
        console.error("Failed to parse and set markdown content:", error);
      }
    };
  },

  addCommands() {
    return {
      setMarkdown: (markdown: string) => () => {
        this.storage.setMarkdown(markdown);
        return true;
      },
    };
  },
});

import { Extension } from "@tiptap/core";
import MarkdownIt from "markdown-it";
import {
  MarkdownParser,
  MarkdownSerializer as ProseMirrorMarkdownSerializer,
  defaultMarkdownParser,
  defaultMarkdownSerializer,
} from "prosemirror-markdown";

export const MarkdownSerializerExtension = Extension.create<any>({
  name: "markdownSerializer",

  addCommands(): any {
    return {
      getMarkdown:
        () =>
        ({ editor }: any) => {
          const { schema } = editor.state;

          // Log available nodes for debugging if needed
          // console.log("Available nodes in schema for serialization:", Object.keys(schema.nodes));

          // Create serializer nodes based on what's actually in the schema
          const nodes: Record<string, any> = {};

          // Add all default serializers, mapping Tiptap names to prosemirror-markdown serializers
          if (schema.nodes.doc) {
            nodes.doc = defaultMarkdownSerializer.nodes.doc;
          }
          if (schema.nodes.text) {
            nodes.text = defaultMarkdownSerializer.nodes.text;
          }
          if (schema.nodes.paragraph) {
            nodes.paragraph = defaultMarkdownSerializer.nodes.paragraph;
          }
          if (schema.nodes.heading) {
            nodes.heading = defaultMarkdownSerializer.nodes.heading;
          }
          if (schema.nodes.codeBlock) {
            nodes.codeBlock = defaultMarkdownSerializer.nodes.code_block;
          }
          if (schema.nodes.blockquote) {
            nodes.blockquote = defaultMarkdownSerializer.nodes.blockquote;
          }
          if (schema.nodes.horizontalRule) {
            nodes.horizontalRule =
              defaultMarkdownSerializer.nodes.horizontal_rule;
          }
          if (schema.nodes.hardBreak) {
            nodes.hardBreak = defaultMarkdownSerializer.nodes.hard_break;
          }
          if (schema.nodes.image) {
            nodes.image = defaultMarkdownSerializer.nodes.image;
          }

          // Handle list nodes with Tiptap naming
          if (schema.nodes.bulletList) {
            nodes.bulletList =
              defaultMarkdownSerializer.nodes.bullet_list ||
              ((state: any, node: any) => {
                state.renderList(node, "  ", () => "* ");
              });
          }
          if (schema.nodes.orderedList) {
            nodes.orderedList =
              defaultMarkdownSerializer.nodes.ordered_list ||
              ((state: any, node: any) => {
                const start = node.attrs.order || 1;
                const maxW = String(start + node.childCount - 1).length;
                const space = " ".repeat(maxW + 2);
                state.renderList(node, space, (i: number) => {
                  const nStr = String(start + i);
                  return " ".repeat(maxW - nStr.length) + nStr + ". ";
                });
              });
          }
          if (schema.nodes.listItem) {
            nodes.listItem =
              defaultMarkdownSerializer.nodes.list_item ||
              ((state: any, node: any) => {
                state.renderContent(node);
              });
          }

          // Add our custom nodes
          if (schema.nodes.questionEmbed) {
            nodes.questionEmbed = (state: any, node: any) => {
              if (node.attrs.customName) {
                state.write(
                  `{{card:${node.attrs.questionId}:${node.attrs.snapshotId}:${node.attrs.customName}}}`,
                );
              } else {
                state.write(
                  `{{card:${node.attrs.questionId}:${node.attrs.snapshotId}}}`,
                );
              }
              state.ensureNewLine();
            };
          }

          if (schema.nodes.questionStatic) {
            nodes.questionStatic = (state: any, node: any) => {
              state.write(
                `{{static-card:${node.attrs.questionName}:series-${node.attrs.series}:viz-${node.attrs.viz}:display-${node.attrs.display}}}`,
              );
              state.ensureNewLine();
            };
          }

          if (schema.nodes.smartLink) {
            nodes.smartLink = (state: any, node: any) => {
              state.write(
                `{{link:${node.attrs.url}:${node.attrs.text}:${node.attrs.icon}}}`,
              );
            };
          }

          // Handle marks - map Tiptap mark names to prosemirror-markdown marks
          const marks: Record<string, any> = {};

          // Log available marks for debugging if needed
          // console.log("Available marks in schema:", Object.keys(schema.marks));

          // Map common marks
          if (schema.marks.bold) {
            marks.bold = defaultMarkdownSerializer.marks.strong;
          }
          if (schema.marks.strong) {
            marks.strong = defaultMarkdownSerializer.marks.strong;
          }
          if (schema.marks.italic) {
            marks.italic = defaultMarkdownSerializer.marks.em;
          }
          if (schema.marks.em) {
            marks.em = defaultMarkdownSerializer.marks.em;
          }
          if (schema.marks.code) {
            marks.code = defaultMarkdownSerializer.marks.code;
          }
          if (schema.marks.link) {
            marks.link = defaultMarkdownSerializer.marks.link;
          }

          // Log serializer info for debugging if needed
          // console.log("Serializer nodes:", Object.keys(nodes));
          // console.log("Serializer marks:", Object.keys(marks));

          const serializer = new ProseMirrorMarkdownSerializer(nodes, marks);
          return serializer.serialize(editor.state.doc);
        },
      setMarkdown:
        (markdown: string) =>
        ({ editor, commands }: any) => {
          try {
            const parser = createCustomMarkdownParser(editor.state.schema);
            const doc = parser.parse(markdown);
            return commands.setContent(doc.toJSON());
          } catch (error) {
            console.error("Error parsing markdown:", error);
            // Fallback to setting the content as plain text
            return commands.setContent(markdown);
          }
        },
    };
  },

  addStorage() {
    return {
      markdown: {
        getMarkdown: () => "",
      },
    };
  },
});

// Create custom markdown-it plugins for our syntax
function createCustomMarkdownItPlugin(schema: any) {
  return function (md: any) {
    // Plugin for question embeds {{card:id:snapshotId:customName?}}
    if (schema.nodes.questionEmbed) {
      // First try as a block rule (when it's on its own line)
      md.block.ruler.before(
        "paragraph",
        "questionEmbed",
        function (state: any, startLine: number, endLine: number, silent: any) {
          const pos = state.bMarks[startLine] + state.tShift[startLine];
          const max = state.eMarks[startLine];
          const line = state.src.slice(pos, max).trim();

          // Check if line matches {{card:...}}
          const match = line.match(/^{{card:(\d+):(\d+)(?::([^}]+))?}}$/);
          if (!match) {
            return false;
          }

          const [, questionIdStr, snapshotIdStr, customName] = match;
          const questionId = parseInt(questionIdStr);
          const snapshotId = parseInt(snapshotIdStr);

          if (isNaN(questionId) || isNaN(snapshotId)) {
            return false;
          }

          if (silent) {
            return true;
          }

          const token = state.push("questionEmbed", "", 0);
          token.attrSet("questionId", questionId.toString());
          token.attrSet("snapshotId", snapshotId.toString());
          token.attrSet("questionName", customName || ""); // Default to empty string if no custom name
          if (customName) {
            token.attrSet("customName", customName);
          }
          token.attrSet("model", "card");
          token.map = [startLine, state.line];
          token.block = true;

          state.line = startLine + 1;

          return true;
        },
      );
    }

    // Plugin for static cards {{static-card:...}}
    if (schema.nodes.questionStatic) {
      md.block.ruler.before(
        "paragraph",
        "questionStatic",
        function (state: any, startLine: number, endLine: number, silent: any) {
          const pos = state.bMarks[startLine] + state.tShift[startLine];
          const max = state.eMarks[startLine];
          const line = state.src.slice(pos, max).trim();

          // Check if line matches {{static-card:...}}
          const match = line.match(
            /^{{static-card:([^:]+):series-([^:]+):viz-([^:]+):display-([^}]+)}}$/,
          );
          if (!match) {
            return false;
          }

          const [, questionName, series, viz, display] = match;

          if (silent) {
            return true;
          }

          const token = state.push("questionStatic", "", 0);
          token.attrSet("questionName", questionName);
          token.attrSet("series", series);
          token.attrSet("viz", viz);
          token.attrSet("display", display);
          token.map = [startLine, state.line];
          token.block = true;

          state.line = startLine + 1;

          return true;
        },
      );
    }

    // Plugin for smart links {{link:url:text:icon}}
    if (schema.nodes.smartLink) {
      md.inline.ruler.push("smartLink", function (state: any, silent: any) {
        const start = state.pos;
        const max = state.posMax;

        // Check for opening {{link:
        if (start + 7 >= max) {
          return false;
        }
        if (state.src.slice(start, start + 7) !== "{{link:") {
          return false;
        }

        // Find the closing }}
        let pos = start + 7;
        let found = false;
        while (pos < max - 1) {
          if (state.src.slice(pos, pos + 2) === "}}") {
            found = true;
            break;
          }
          pos++;
        }

        if (!found) {
          return false;
        }

        const content = state.src.slice(start + 7, pos);
        const parts = content.split(":");

        if (parts.length !== 3) {
          return false;
        }

        const [url, text, icon] = parts;

        if (!silent) {
          const token = state.push("smartLink", "smartLink", 0);
          token.attrSet("url", url);
          token.attrSet("text", text);
          token.attrSet("icon", icon);
          token.markup = "{{link}}";
          token.content = "";
        }

        state.pos = pos + 2;
        return true;
      });
    }
  };
}

// Create a custom markdown parser that extends the default with our custom tokens
function createCustomMarkdownParser(schema: any): MarkdownParser {
  // Log available nodes for debugging if needed
  // console.log("Available nodes in schema:", Object.keys(schema.nodes));

  // Create a new markdown-it instance with our custom plugin
  const customMarkdownIt = new MarkdownIt("commonmark", {
    html: false,
    breaks: false,
    linkify: false,
  });

  // Add our custom plugin
  customMarkdownIt.use(createCustomMarkdownItPlugin(schema));

  // Start with all default tokens from prosemirror-markdown
  const tokens: Record<string, any> = {};

  // Copy all default tokens first
  Object.keys(defaultMarkdownParser.tokens).forEach((tokenName) => {
    tokens[tokenName] = defaultMarkdownParser.tokens[tokenName];
  });

  // Override with proper mappings for Tiptap node names
  // Basic nodes
  if (schema.nodes.paragraph) {
    tokens.paragraph = { block: "paragraph" };
  }
  if (schema.nodes.heading) {
    tokens.heading = {
      block: "heading",
      getAttrs: (tok: any) => ({ level: +tok.tag.slice(1) }),
    };
  }
  if (schema.nodes.codeBlock) {
    tokens.code_block = {
      block: "codeBlock",
      getAttrs: (tok: any) => ({ language: tok.info || null }),
    };
  }
  if (schema.nodes.blockquote) {
    tokens.blockquote = { block: "blockquote" };
  }
  if (schema.nodes.horizontalRule) {
    tokens.hr = { node: "horizontalRule" };
  }
  if (schema.nodes.hardBreak) {
    tokens.hardbreak = { node: "hardBreak" };
  }
  if (schema.nodes.image) {
    tokens.image = {
      node: "image",
      getAttrs: (tok: any) => ({
        src: tok.attrGet("src"),
        alt: tok.attrGet("alt") || null,
        title: tok.attrGet("title") || null,
      }),
    };
  }

  // List nodes - map to Tiptap naming
  if (schema.nodes.bulletList) {
    tokens.bullet_list = { block: "bulletList" };
  }
  if (schema.nodes.orderedList) {
    tokens.ordered_list = {
      block: "orderedList",
      getAttrs: (tok: any) => ({ order: +tok.attrGet("start") || 1 }),
    };
  }
  if (schema.nodes.listItem) {
    tokens.list_item = { block: "listItem" };
  }

  // Add tokens for our custom nodes
  if (schema.nodes.questionEmbed) {
    tokens.questionEmbed = {
      node: "questionEmbed",
      getAttrs: (tok: any) => ({
        questionId: parseInt(tok.attrGet("questionId")),
        snapshotId: parseInt(tok.attrGet("snapshotId")),
        questionName: tok.attrGet("questionName") || "",
        customName: tok.attrGet("customName") || null,
        model: tok.attrGet("model") || "card",
      }),
    };
  }

  if (schema.nodes.questionStatic) {
    tokens.questionStatic = {
      node: "questionStatic",
      getAttrs: (tok: any) => ({
        questionName: tok.attrGet("questionName"),
        series: tok.attrGet("series"),
        viz: tok.attrGet("viz"),
        display: tok.attrGet("display"),
      }),
    };
  }

  if (schema.nodes.smartLink) {
    tokens.smartLink = {
      node: "smartLink",
      getAttrs: (tok: any) => ({
        url: tok.attrGet("url"),
        text: tok.attrGet("text"),
        icon: tok.attrGet("icon"),
      }),
    };
  }

  // Remove any tokens for nodes that don't exist in the schema
  const filteredTokens: Record<string, any> = {};
  Object.keys(tokens).forEach((tokenName) => {
    const token = tokens[tokenName];
    if (token) {
      const nodeName = token.block || token.node || token.mark;
      if (nodeName && (schema.nodes[nodeName] || schema.marks?.[nodeName])) {
        filteredTokens[tokenName] = token;
      } else if (!nodeName) {
        // Keep tokens that don't specify a node/mark (like text processing tokens)
        filteredTokens[tokenName] = token;
      }
    }
  });

  // Log filtered tokens for debugging if needed
  // console.log("Filtered tokens:", Object.keys(filteredTokens));

  return new MarkdownParser(schema, customMarkdownIt, filteredTokens);
}

// Keep the original export name for backward compatibility
export const MarkdownSerializer = MarkdownSerializerExtension;

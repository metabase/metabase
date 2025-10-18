#!/usr/bin/env node
/**
 * Markdown to ProseMirror parser using prosemirror-markdown
 * 
 * Usage: 
 *   node parse-markdown.mjs <markdown-file>
 *   node parse-markdown.mjs < input.md
 *   echo "# Test" | node parse-markdown.mjs
 *   node parse-markdown.mjs --verbose < input.md
 * 
 * Output: ProseMirror JSON to stdout
 * 
 * Options:
 *   --verbose    Show diagnostic messages on stderr
 */

import { readFileSync } from 'fs';
import MarkdownIt from 'markdown-it';
import { MarkdownParser, defaultMarkdownParser, schema as baseSchema } from 'prosemirror-markdown';
import { Schema } from 'prosemirror-model';

// Extend the base schema with cardEmbed, resizeNode, and flexContainer
const schema = new Schema({
  nodes: baseSchema.spec.nodes
    .addBefore('image', 'cardEmbed', {
      attrs: {
        id: { default: null }, // Can be number or string (ref:foo)
        name: { default: null }
      },
      group: 'block',
      parseDOM: [{
        tag: 'div[data-card-embed]',
        getAttrs: (dom) => {
          const idStr = dom.getAttribute('data-id');
          // Keep ref: as string, parse numeric strings to numbers
          const id = idStr && idStr.startsWith('ref:') ? idStr : parseInt(idStr);
          return {
            id,
            name: dom.getAttribute('data-name')
          };
        }
      }],
      toDOM: (node) => ['div', {
        'data-card-embed': '',
        'data-id': node.attrs.id,
        'data-name': node.attrs.name
      }]
    })
    .addBefore('image', 'flexContainer', {
      attrs: {
        columnWidths: { default: [50, 50] }
      },
      content: 'cardEmbed{2}',
      parseDOM: [{
        tag: 'div[data-flex-container]',
        getAttrs: (dom) => {
          const widths = dom.getAttribute('data-column-widths');
          return {
            columnWidths: widths ? JSON.parse(widths) : [50, 50]
          };
        }
      }],
      toDOM: (node) => ['div', {
        'data-flex-container': '',
        'data-column-widths': JSON.stringify(node.attrs.columnWidths)
      }]
    })
    .addBefore('image', 'resizeNode', {
      attrs: {
        height: { default: 442 },
        minHeight: { default: 280 }
      },
      content: '(cardEmbed | flexContainer)',
      group: 'block',
      parseDOM: [{
        tag: 'div[data-resize-node]',
        getAttrs: (dom) => ({
          height: parseInt(dom.getAttribute('data-height')) || 442,
          minHeight: parseInt(dom.getAttribute('data-min-height')) || 280
        })
      }],
      toDOM: (node) => ['div', {
        'data-resize-node': '',
        'data-height': node.attrs.height,
        'data-min-height': node.attrs.minHeight
      }]
    }),
  marks: baseSchema.spec.marks
});

// Custom markdown-it plugin to parse card embeds
function cardEmbedPlugin(md) {
  md.block.ruler.before('fence', 'card_embed', (state, startLine, endLine, silent) => {
    const pos = state.bMarks[startLine] + state.tShift[startLine];
    const max = state.eMarks[startLine];
    const lineText = state.src.slice(pos, max);
    
    // Match: {% card id=123 %} or {% card id=ref:my-chart %} with optional name
    const match = lineText.match(/^\{%\s*card\s+id=(ref:[a-zA-Z0-9_-]+|\d+)(?:\s+name="([^"]*)")?\s*%\}$/);
    
    if (!match) return false;
    if (silent) return true;
    
    const token = state.push('card_embed', '', 0);
    token.attrs = [
      ['id', match[1]], // Keep as-is (string for ref:, string for numeric)
      ['name', match[2] || null]
    ];
    token.block = true;
    token.map = [startLine, startLine + 1];
    
    state.line = startLine + 1;
    return true;
  });
}

// Custom markdown-it plugin to parse row containers
function rowPlugin(md) {
  md.block.ruler.before('fence', 'row_container', (state, startLine, endLine, silent) => {
    const pos = state.bMarks[startLine] + state.tShift[startLine];
    const max = state.eMarks[startLine];
    const lineText = state.src.slice(pos, max);
    
    // Match: {% row %} or {% row widths="75:25" %}
    const match = lineText.match(/^\{%\s*row(?:\s+widths="([^"]+)")?\s*%\}$/);
    
    if (!match) return false;
    if (silent) return true;
    
    const widths = match[1];
    let nextLine = startLine + 1;
    const cards = [];
    
    // Find all cards until {% endrow %}
    while (nextLine < endLine) {
      const nextPos = state.bMarks[nextLine] + state.tShift[nextLine];
      const nextMax = state.eMarks[nextLine];
      const nextLineText = state.src.slice(nextPos, nextMax);
      
      // Check for endrow
      if (nextLineText.match(/^\{%\s*endrow\s*%\}$/)) {
        break;
      }
      
      // Check for card
      const cardMatch = nextLineText.match(/^\{%\s*card\s+id=(ref:[a-zA-Z0-9_-]+|\d+)(?:\s+name="([^"]*)")?\s*%\}$/);
      if (cardMatch) {
        cards.push({
          id: cardMatch[1], // Keep as-is (string for ref:, string for numeric)
          name: cardMatch[2] || null
        });
      }
      
      nextLine++;
    }
    
    if (cards.length !== 2 || nextLine >= endLine) {
      return false;
    }
    
    // Create resize_node_open token
    const resizeToken = state.push('resize_node_open', '', 1);
    resizeToken.block = true;
    
    // Create flex_container_open token
    const flexToken = state.push('flex_container_open', '', 1);
    flexToken.block = true;
    
    // Parse widths if provided
    if (widths) {
      const parts = widths.split(':').map(w => parseFloat(w.trim()));
      if (parts.length === 2) {
        flexToken.attrs = [['columnWidths', JSON.stringify(parts)]];
      }
    }
    
    // Add card tokens
    for (const card of cards) {
      const cardToken = state.push('card_embed', '', 0);
      cardToken.attrs = [
        ['id', card.id],
        ['name', card.name]
      ];
      cardToken.block = true;
    }
    
    // Close flex_container
    state.push('flex_container_close', '', -1);
    
    // Close resize_node
    state.push('resize_node_close', '', -1);
    
    state.line = nextLine + 1; // Skip past {% endrow %}
    return true;
  });
}

// Post-process tokens to wrap standalone card_embed in resize_node
function wrapStandaloneCards(tokens) {
  const result = [];
  let inFlexContainer = false;
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    
    // Track if we're inside a flex container
    if (token.type === 'flex_container_open') {
      inFlexContainer = true;
      result.push(token);
    } else if (token.type === 'flex_container_close') {
      inFlexContainer = false;
      result.push(token);
    } else if (token.type === 'card_embed' && !inFlexContainer) {
      // Only wrap standalone cards (not inside flex container)
      const resizeOpen = new token.constructor('resize_node_open', '', 1);
      resizeOpen.block = true;
      result.push(resizeOpen);
      
      result.push(token);
      
      const resizeClose = new token.constructor('resize_node_close', '', -1);
      resizeClose.block = true;
      result.push(resizeClose);
    } else {
      result.push(token);
    }
  }
  
  return result;
}

// Create custom markdown-it instance with plugins
const md = new MarkdownIt('commonmark', {
  html: false,
  linkify: false
}).use(rowPlugin).use(cardEmbedPlugin);

// Override parse to post-process tokens
const originalParse = md.parse.bind(md);
md.parse = function(src, env) {
  const tokens = originalParse(src, env);
  return wrapStandaloneCards(tokens);
};

// Create custom parser with token handlers
const customParser = new MarkdownParser(
  schema,
  md,
  {
    ...defaultMarkdownParser.tokens,
    card_embed: {
      node: 'cardEmbed',
      getAttrs: (tok) => {
        const idStr = tok.attrGet('id');
        // Keep ref: as string, parse numeric strings to numbers
        const id = idStr.startsWith('ref:') ? idStr : parseInt(idStr);
        return {
          id,
          name: tok.attrGet('name')
        };
      }
    },
    resize_node: {
      block: 'resizeNode',
      getAttrs: (tok) => ({
        height: 442,
        minHeight: 280
      })
    },
    flex_container: {
      block: 'flexContainer',
      getAttrs: (tok) => {
        const widths = tok.attrGet('columnWidths');
        return {
          columnWidths: widths ? JSON.parse(widths) : [50, 50]
        };
      }
    }
  }
);

// Transform ProseMirror node/mark types to Tiptap naming convention
function transformToTiptapFormat(node) {
  if (!node || typeof node !== 'object') {
    return node;
  }

  // Map node types from ProseMirror defaults to Tiptap names
  const typeMap = {
    'strong': 'bold',
    'em': 'italic',
    'code_block': 'codeBlock',
    'bullet_list': 'bulletList',
    'ordered_list': 'orderedList',
    'list_item': 'listItem',
    'horizontal_rule': 'horizontalRule',
    'hard_break': 'hardBreak'
  };

  const transformedNode = { ...node };

  // Update node type if it needs mapping
  if (transformedNode.type && typeMap[transformedNode.type]) {
    transformedNode.type = typeMap[transformedNode.type];
  }

  // Transform marks
  if (transformedNode.marks) {
    transformedNode.marks = transformedNode.marks.map(mark => ({
      ...mark,
      type: typeMap[mark.type] || mark.type
    }));
  }

  // Recursively transform content
  if (transformedNode.content && Array.isArray(transformedNode.content)) {
    transformedNode.content = transformedNode.content.map(transformToTiptapFormat);
  }

  return transformedNode;
}

export function parseMarkdown(markdownText) {
  // Use the custom parser
  const doc = customParser.parse(markdownText);

  // Convert to JSON
  const pmDoc = doc.toJSON();

  // Transform to Tiptap format
  return transformToTiptapFormat(pmDoc);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const args = process.argv.slice(2);
  let markdownText;
  let verbose = false;
  
  // Check for --verbose flag
  const verboseIndex = args.indexOf('--verbose');
  if (verboseIndex !== -1) {
    verbose = true;
    args.splice(verboseIndex, 1);
  }
  
  try {
    // Read from stdin if no file provided or if '-' is specified
    if (args.length === 0 || args[0] === '-') {
      if (verbose) {
        console.error('Reading from stdin...');
      }
      markdownText = await readStdin();
    } else {
      const filePath = args[0];
      if (verbose) {
        console.error(`Reading from file: ${filePath}`);
      }
      markdownText = readFileSync(filePath, 'utf8');
    }
    
    const pmDoc = parseMarkdown(markdownText);
    
    // Output JSON to stdout (always)
    console.log(JSON.stringify(pmDoc, null, 2));
  } catch (error) {
    console.error('Error parsing markdown:', error.message);
    process.exit(1);
  }
}

// Only run main if this file is being executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

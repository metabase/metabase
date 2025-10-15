#!/usr/bin/env node
/**
 * Markdown to ProseMirror parser using prosemirror-markdown
 * 
 * Usage: node parse-markdown.mjs <markdown-file>
 * Output: ProseMirror JSON to stdout
 */

import { readFileSync } from 'fs';
import MarkdownIt from 'markdown-it';
import { MarkdownParser, defaultMarkdownParser, schema as baseSchema } from 'prosemirror-markdown';
import { Schema } from 'prosemirror-model';

// Extend the base schema with cardEmbed node
const schema = new Schema({
  nodes: baseSchema.spec.nodes.addBefore('image', 'cardEmbed', {
    attrs: {
      id: { default: null },
      name: { default: null }
    },
    group: 'block',
    parseDOM: [{
      tag: 'div[data-card-embed]',
      getAttrs: (dom) => ({
        id: parseInt(dom.getAttribute('data-id')),
        name: dom.getAttribute('data-name')
      })
    }],
    toDOM: (node) => ['div', {
      'data-card-embed': '',
      'data-id': node.attrs.id,
      'data-name': node.attrs.name
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
    
    // Match: {% card id=123 %} or {% card id=123 name="Title" %}
    const match = lineText.match(/^\{%\s*card\s+id=(\d+)(?:\s+name="([^"]*)")?\s*%\}$/);
    
    if (!match) return false;
    if (silent) return true;
    
    const token = state.push('card_embed', '', 0);
    token.attrs = [
      ['id', match[1]],
      ['name', match[2] || null]
    ];
    token.block = true;
    token.map = [startLine, startLine + 1];
    
    state.line = startLine + 1;
    return true;
  });
}

// Create custom markdown-it instance with card embed plugin
const md = new MarkdownIt('commonmark', {
  html: false,
  linkify: false
}).use(cardEmbedPlugin);

// Create custom parser with card embed token handler
const customParser = new MarkdownParser(
  schema,
  md,
  {
    ...defaultMarkdownParser.tokens,
    card_embed: {
      node: 'cardEmbed',
      getAttrs: (tok) => ({
        id: parseInt(tok.attrGet('id')),
        name: tok.attrGet('name')
      })
    }
  }
);

function parseMarkdown(markdownText) {
  // Use the custom parser
  const doc = customParser.parse(markdownText);
  
  // Convert to JSON
  return doc.toJSON();
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node parse-markdown.mjs <markdown-file>');
    process.exit(1);
  }
  
  const filePath = args[0];
  
  try {
    const markdownText = readFileSync(filePath, 'utf8');
    const pmDoc = parseMarkdown(markdownText);
    
    // Output JSON to stdout
    console.log(JSON.stringify(pmDoc, null, 2));
  } catch (error) {
    console.error('Error parsing markdown:', error.message);
    process.exit(1);
  }
}

main();

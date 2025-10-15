#!/usr/bin/env node
/**
 * ProseMirror to Markdown serializer
 * 
 * Usage: 
 *   node serialize-prosemirror.mjs <prosemirror-json-file>
 *   node serialize-prosemirror.mjs < input.json
 *   echo '{"type":"doc","content":[...]}' | node serialize-prosemirror.mjs
 *   node serialize-prosemirror.mjs --verbose < input.json
 * 
 * Output: Markdown to stdout
 * 
 * Options:
 *   --verbose    Show diagnostic messages on stderr
 */

import { readFileSync } from 'fs';
import { MarkdownSerializer, defaultMarkdownSerializer } from 'prosemirror-markdown';
import { Schema, Node as PMNode } from 'prosemirror-model';

// Same schema as parse-markdown.mjs
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM() { return ['p', 0]; }
    },
    heading: {
      attrs: { level: { default: 1 } },
      content: 'inline*',
      group: 'block',
      defining: true,
      parseDOM: [1, 2, 3, 4, 5, 6].map(level => ({
        tag: `h${level}`,
        attrs: { level }
      })),
      toDOM(node) { return [`h${node.attrs.level}`, 0]; }
    },
    blockquote: {
      content: 'block+',
      group: 'block',
      defining: true,
      parseDOM: [{ tag: 'blockquote' }],
      toDOM() { return ['blockquote', 0]; }
    },
    horizontal_rule: {
      group: 'block',
      parseDOM: [{ tag: 'hr' }],
      toDOM() { return ['hr']; }
    },
    code_block: {
      content: 'text*',
      marks: '',
      group: 'block',
      code: true,
      defining: true,
      parseDOM: [{ tag: 'pre', preserveWhitespace: 'full' }],
      toDOM() { return ['pre', ['code', 0]]; }
    },
    text: {
      group: 'inline'
    },
    hard_break: {
      inline: true,
      group: 'inline',
      selectable: false,
      parseDOM: [{ tag: 'br' }],
      toDOM() { return ['br']; }
    },
    ordered_list: {
      content: 'list_item+',
      group: 'block',
      attrs: { order: { default: 1 } },
      parseDOM: [{
        tag: 'ol',
        getAttrs(dom) {
          return { order: dom.hasAttribute('start') ? +dom.getAttribute('start') : 1 };
        }
      }],
      toDOM(node) {
        return node.attrs.order === 1 ? ['ol', 0] : ['ol', { start: node.attrs.order }, 0];
      }
    },
    bullet_list: {
      content: 'list_item+',
      group: 'block',
      parseDOM: [{ tag: 'ul' }],
      toDOM() { return ['ul', 0]; }
    },
    list_item: {
      content: 'paragraph block*',
      parseDOM: [{ tag: 'li' }],
      toDOM() { return ['li', 0]; },
      defining: true
    },
    cardEmbed: {
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
    },
    flexContainer: {
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
    },
    resizeNode: {
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
    }
  },
  marks: {
    link: {
      attrs: {
        href: {},
        title: { default: null }
      },
      inclusive: false,
      parseDOM: [{
        tag: 'a[href]',
        getAttrs(dom) {
          return { href: dom.getAttribute('href'), title: dom.getAttribute('title') };
        }
      }],
      toDOM(node) { return ['a', { href: node.attrs.href, title: node.attrs.title }, 0]; }
    },
    em: {
      parseDOM: [{ tag: 'i' }, { tag: 'em' }, { style: 'font-style=italic' }],
      toDOM() { return ['em', 0]; }
    },
    strong: {
      parseDOM: [
        { tag: 'strong' },
        { tag: 'b', getAttrs: node => node.style.fontWeight !== 'normal' && null },
        { style: 'font-weight', getAttrs: value => /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null }
      ],
      toDOM() { return ['strong', 0]; }
    },
    code: {
      parseDOM: [{ tag: 'code' }],
      toDOM() { return ['code', 0]; }
    }
  }
});

// Custom serializers for Metabase nodes
const customSerializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,
    cardEmbed(state, node) {
      const { id, name } = node.attrs;
      // id can be number or string (ref:foo)
      if (name) {
        state.write(`{% card id=${id} name="${name}" %}`);
      } else {
        state.write(`{% card id=${id} %}`);
      }
      state.closeBlock(node);
    },
    resizeNode(state, node) {
      // Check if it contains a flexContainer
      const child = node.firstChild;
      if (child && child.type.name === 'flexContainer') {
        // Serialize as row
        const { columnWidths } = child.attrs;
        const hasCustomWidths = columnWidths && (columnWidths[0] !== 50 || columnWidths[1] !== 50);
        
        if (hasCustomWidths) {
          const [w1, w2] = columnWidths;
          state.write(`{% row widths="${w1.toFixed(2)}:${w2.toFixed(2)}" %}`);
        } else {
          state.write(`{% row %}`);
        }
        state.ensureNewLine();
        
        // Serialize the two cards inside
        child.forEach(card => {
          const { id, name } = card.attrs;
          if (name) {
            state.write(`{% card id=${id} name="${name}" %}`);
          } else {
            state.write(`{% card id=${id} %}`);
          }
          state.ensureNewLine();
        });
        
        state.write(`{% endrow %}`);
        state.closeBlock(node);
      } else {
        // Serialize as standalone card
        state.render(child, node, 0);
      }
    },
    flexContainer(state, node) {
      // This shouldn't be called directly since resizeNode handles it
      // But just in case, render cards
      node.forEach(card => {
        state.render(card, node, node.childCount);
      });
    }
  },
  defaultMarkdownSerializer.marks
);

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function serializeProseMirror(jsonText) {
  const pmJson = JSON.parse(jsonText);
  const doc = PMNode.fromJSON(schema, pmJson);
  return customSerializer.serialize(doc);
}

async function main() {
  const args = process.argv.slice(2);
  let jsonText;
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
      jsonText = await readStdin();
    } else {
      const filePath = args[0];
      if (verbose) {
        console.error(`Reading from file: ${filePath}`);
      }
      jsonText = readFileSync(filePath, 'utf8');
    }
    
    const markdown = serializeProseMirror(jsonText);
    
    // Output markdown to stdout
    console.log(markdown);
  } catch (error) {
    console.error('Error serializing ProseMirror:', error.message);
    if (verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();

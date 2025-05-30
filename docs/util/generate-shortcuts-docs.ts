import fs from 'fs';
import path from 'path';
import prettier from 'prettier';

// Import all shortcut modules
import { shortcuts } from '../../frontend/src/metabase/palette/shortcuts';

interface Shortcut {
  name: string;
  shortcut: string[];
  shortcutDisplay?: string[];
  shortcutGroup: string;
}

function generateMarkdownTable(shortcuts: Record<string, Shortcut>, group: string): string {
  const groupShortcuts = Object.entries(shortcuts)
    .filter(([_, shortcut]) => shortcut.shortcutGroup === group)
    .map(([_, shortcut]) => ({
      name: shortcut.name,
      shortcut: (shortcut.shortcutDisplay || shortcut.shortcut)
        .map(key => key.replace('$mod', 'Ctrl/Cmd'))
        .join(', ')
    }));

  if (groupShortcuts.length === 0) return '';

  let markdown = `## ${group.charAt(0).toUpperCase() + group.slice(1)}\n\n`;
  markdown += '| Action | Shortcut |\n';
  markdown += '| ------ | -------- |\n';

  groupShortcuts.forEach(({ name, shortcut }) => {
    markdown += `| ${name} | ${shortcut} |\n`;
  });

  return markdown + '\n';
}

async function generateShortcutsDocs() {
  const groups = ['global', 'dashboard', 'collection', 'question', 'admin'];
  
  // Get the frontmatter and intro
  const introPath = path.join(__dirname, 'resources/introduction.md');
  const introContent = fs.readFileSync(introPath, 'utf8');
  
  let markdown = introContent + '\n\n';

  groups.forEach(group => {
    markdown += generateMarkdownTable(shortcuts, group);
  });

  // Write to docs file
  const docsPath = path.join(__dirname, '../exploration-and-organization/keyboard-shortcuts.md');
  
  // Format the markdown with Prettier
  const formattedMarkdown = await prettier.format(markdown, {
    parser: 'markdown',
    proseWrap: 'always',
  });
  
  fs.writeFileSync(docsPath, formattedMarkdown);
  console.log('Shortcuts documentation generated.');
  console.log(`File at ${docsPath}`);
}

generateShortcutsDocs(); 
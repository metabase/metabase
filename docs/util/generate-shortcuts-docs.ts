import fs from 'fs';
import path from 'path';
import prettier from 'prettier';

import { shortcuts } from '../../frontend/src/metabase/palette/shortcuts';

interface Shortcut {
  name: string;
  shortcut: string[];
  shortcutDisplay?: string[];
  shortcutGroup: string;
}

interface DocsConfig {
  groups: string[];
  introPath: string;
  outputPath: string;
}

function formatShortcutKey(key: string): string {
  if (key.length === 3) {
    key = key.replace(" ", " > ")
  }
  return key.replace('$mod', 'Ctrl/Cmd');
}

function formatShortcutDisplay(shortcut: Shortcut): string {
  const keys = shortcut.shortcutDisplay || shortcut.shortcut;
  return keys.map(formatShortcutKey).join(', ');
}

function generateMarkdownTable(shortcuts: Record<string, Shortcut>, group: string): string {
  const groupShortcuts = Object.entries(shortcuts)
    .filter(([_, shortcut]) => shortcut.shortcutGroup === group)
    .map(([_, shortcut]) => ({
      name: shortcut.name,
      shortcut: formatShortcutDisplay(shortcut)
    }));

  if (groupShortcuts.length === 0) return '';

  const groupTitle = group.charAt(0).toUpperCase() + group.slice(1);
  
  const tableRows = groupShortcuts
    .map(({ name, shortcut }) => `| ${name} | ${shortcut} |`)
    .join('\n');

  return `## ${groupTitle}\n\n| Action | Shortcut |\n| ------ | -------- |\n${tableRows}\n\n`;
}

function readIntroduction(introPath: string): string {
  try {
    return fs.readFileSync(introPath, 'utf8');
  } catch (error) {
    throw new Error(`Failed to read introduction file: ${error.message}`);
  }
}

async function writeDocumentation(content: string, outputPath: string): Promise<void> {
  try {
    const formattedContent = await prettier.format(content, {
      parser: 'markdown',
      proseWrap: 'always',
    });
    
    fs.writeFileSync(outputPath, formattedContent);
  } catch (error) {
    throw new Error(`Failed to write documentation: ${error.message}`);
  }
}

async function generateShortcutsDocs(): Promise<void> {
  const config: DocsConfig = {
    groups: ['global', 'dashboard', 'collection', 'question', 'admin'],
    introPath: path.join(__dirname, 'resources/introduction.md'),
    outputPath: path.join(__dirname, '../exploration-and-organization/keyboard-shortcuts.md')
  };

  try {
    // Get the frontmatter and intro
    const introContent = readIntroduction(config.introPath);
    
    // Generate markdown content
    const markdownContent = config.groups.reduce(
      (content, group) => content + generateMarkdownTable(shortcuts, group),
      introContent + '\n\n'
    );

    // Write to docs file
    await writeDocumentation(markdownContent, config.outputPath);
    
    console.log('Shortcuts documentation generated successfully.');
    console.log(`File written to: ${config.outputPath}`);
  } catch (error) {
    console.error('Failed to generate shortcuts documentation:', error.message);
    process.exit(1);
  }
}

generateShortcutsDocs(); 
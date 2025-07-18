# Report Editor

A rich text editor for creating reports in Metabase with @ mention functionality for referencing charts, tables, and dashboards.

## Features

- **Rich Text Editing**: Full markdown support with a toolbar for formatting
- **@ Mentions**: Type `@` to mention charts, tables, dashboards, and collections
- **Keyboard Shortcuts**:
  - `Cmd/Ctrl + B`: Bold
  - `Cmd/Ctrl + I`: Italic
  - `Cmd/Ctrl + K`: Strikethrough
  - `Cmd/Ctrl + 1/2/3`: Headings
  - `Cmd/Ctrl + L`: Bullet list
  - `Cmd/Ctrl + O`: Ordered list
  - `Cmd/Ctrl + Q`: Blockquote
  - `Cmd/Ctrl + `` `: Code block

## Usage

The report editor is accessible via the `/reports/new` route and can be accessed from the "New" menu in the app bar.

### @ Mention Functionality

1. Type `@` in the editor
2. Start typing to search for entities (minimum 2 characters)
3. Use arrow keys to navigate suggestions
4. Press Enter to select an item
5. Press Escape to cancel

### Supported Entity Types

- **Cards**: Saved questions and charts
- **Dashboards**: Dashboard collections
- **Tables**: Database tables
- **Collections**: Content collections

## Technical Implementation

The editor is built using:
- **TipTap**: Rich text editor framework
- **Metabase Search API**: For @ mention suggestions
- **React**: Component framework
- **Mantine UI**: UI components

## Files

- `ReportEditor.tsx`: Main editor component
- `MentionSuggestions.tsx`: @ mention suggestions dropdown
- `ReportEditor.styled.tsx`: Styled components and CSS
- `index.ts`: Module exports

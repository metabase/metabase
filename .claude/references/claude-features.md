# Claude Code Features

## Memory Files (CLAUDE.md)

- **Project Memory** (./CLAUDE.md)
  - Team-shared conventions and project knowledge
  - Committed to version control
  - Used for coding standards, architectural patterns, and project-specific instructions

- **Local Project Memory** (./CLAUDE.local.md)
  - Personal project-specific preferences
  - Not committed to version control
  - Used for individual working preferences within a project

- **User Memory** (~/.claude/CLAUDE.md)
  - Global personal preferences
  - Applied across all projects
  - Used for personal formatting preferences and working styles

- **Best Practices**
  - Be specific with instructions
  - Memory files are automatically loaded into context
  - Can be quickly accessed using `/memory` command
  - Can add quick memories using the `#` shortcut

## Custom Slash Commands

- **Project Commands** (.claude/commands/*)
  - Shared with team members
  - Committed to version control
  - Used for project-specific automation

- **Personal Commands** (~/.claude/commands/*)
  - Work across all projects
  - Used for personal productivity workflows

- **Capabilities**
  - Support arguments using $ARGUMENTS placeholder
  - Can include detailed instructions for Claude
  - Can leverage any tools available to Claude
  - Accessed using `/command-name` syntax

## MCP Servers (Model Context Protocol)

- **General MCP Capabilities**
  - Connect Claude to external tools and data sources
  - Support different server scopes: local, project, and user
  - Can be added via CLI with `claude mcp add` command
  - Support both Stdio and SSE server types
  - Allow setting environment variables and configuring timeouts

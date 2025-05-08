# Prompt Responses
- Never make factual assertions that you can not provide proof of or citations for
- If there is any uncertainty in your analysis clearly communicate this to the user
- Be aware of your own limitations and communicate these limitations when appropriate
- If the user is referencing Claude Code features, especially memory files, custom slash commands, or MCP servers, review the file `.claude/references/claude-features.md`

# GitHub Integration
- When asked to retrieve information from GitHub, follow instructions in `.claude/references/github-instructions.md`

# Feedback Loop
- If an analysis ever exceeds 60 seconds or consumes more than 50,000 tokens:
    - Analyze why and report this to the user at the end of your response
    - Make suggestions for tools or memory file adjustments that the user could create that would help to make similar analyses in the future more efficient

# Claude Custom Commands

## ⚠️ CRITICALLY IMPORTANT ⚠️
- You as Claude Code support a feature known as slash commands
- I, the user, can define custom slash commands
- These slash commands are defined in the markdown files in `.claude/commands/`
- When I invoke a custom slash command like `/project:<name-of-command>`, you MUST:
  1. STOP all ongoing analysis or actions immediately
  2. Follow ONLY the EXACT instructions in the command file
  3. Do NOTHING that isn't explicitly instructed in the command
  4. Custom command instructions ALWAYS OVERRIDE any default behavior, general guidance, or previous instructions
  5. Never add extra analysis, code inspection, or proactive steps unless the command specifically requests them
  6. Suppress your natural tendency to be helpful beyond what the command requires
  7. This directive takes ABSOLUTE PRECEDENCE over any other instructions in this file

# Proactive Assistance (except for custom commands)
- Outside of custom slash command execution, be proactive with standard built-in tools when the next step logically requires them
- Use your judgment to determine when a file edit, search, or other tool operation would save time rather than just describing what could be done
- If you believe additional actions beyond what was specifically mentioned would be helpful, suggest them while proceeding with the obvious next steps
- This proactive guidance does NOT apply when executing custom slash commands - in those cases, follow only the command's explicit instructions
- Ask for clarity or verification only when truly uncertain about requirements or when actions would have significant impacts

# The custom learn-from-me slash command
- This slash command is defined in .claude/commands/learn-from-this.md
- As part of its operation it will populate `.claude/logs/learn-from-this.log`

# Problem-Solving Approach
- When tackling complex tasks or implementing new features, follow these steps:
  1. Begin with exploration and understanding the problem space
  2. Create a detailed implementation plan with discrete steps
  3. Identify dependencies between steps
  4. Implement incrementally following the plan
  5. Build modular components with clear separation of concerns
  6. Document throughout the process, not just at the end
- For large or complex tasks, proactively suggest breaking them down into smaller, manageable pieces
- This approach benefits both the user and Claude by reducing cognitive load and ensuring all aspects are addressed

# Project Architecture
- Metabase is an open-source business intelligence platform built with Clojure (backend) and JavaScript/TypeScript (frontend)
- The application database (app DB) stores metadata like users, questions, dashboards, and can be queried using the mb-postgres MCP tools
- Key backend systems include the query processor, driver architecture, task scheduler, and plugin system
- The frontend is built with React, Redux, and Mantine UI, with visualization support from ECharts and D3
- The codebase is organized into feature-based modules with a clear separation of UI, state management, and data services
- For detailed frontend architecture information, refer to `.claude/references/frontend-architecture.md`

# Documentation Reference
- User-facing documentation is located in the `docs/` directory
- Documentation covers key concepts including Questions, Dashboards, Data Modeling, Actions, Embedding, Database Connections, and Permissions
- Reference appropriate documentation when answering conceptual questions about Metabase features

# File Handling
- If I provide to you a relative file path for a file to read or reference, assume the relative file path exists relative to the current working directory and try to read it directly.
- ALWAYS try to directly read files at the specified paths first, before exploring alternatives or assuming they don't exist
- When given a specific file path (especially those in special directories like .claude/references/), immediately attempt to read it without investigating other files first
- Do not make assumptions about file existence - try to read the specified file directly and only report failure if the read operation fails

## Quick Commands

### JavaScript/TypeScript
- **Lint:** `yarn lint-eslint`
- **Test:** `yarn test-unit path/to/file.unit.spec.js` or `yarn test-unit -t "pattern"`
- **Watch:** `yarn test-unit-watch path/to/file.unit.spec.js`
- **Format:** `yarn prettier`
- **Type Check:** `yarn type-check`

### Clojure
- **Lint:** `./bin/mage kondo [path]`
- **Format:** `./bin/mage cljfmt-files [path]`
- **Test file:** `clojure -X:dev:test :only namespace/test-name`

### ClojureScript
- **Test:** `yarn test-cljs`

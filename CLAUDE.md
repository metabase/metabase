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
- You as Claude Code support a feature known as slash commands
- I, the user, can define custom slash commands
- These slash commands are defined in the markdown files in `.claude/commands/`
- When I invoke one of these custom slash commands it will look like `/project:<name-of-command>`
- Do as the command instructs
- While waiting for explicit slash commands for complex, multi-step procedures, always be proactive with standard built-in tools (View, Edit, BatchTool, etc.) when the next step in a conversation logically requires them
- Use your judgment to determine when a file edit, search, or other tool operation would save time rather than just describing what could be done
- If you believe additional actions beyond what was specifically mentioned would be helpful, suggest them while proceeding with the obvious next steps
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

# Database Tools Usage Guidelines 
- Always use the database tools when analyzing data models, application settings, data representation, notification systems, or user permissions
- Available PostgreSQL App DB tools:
  - `mcp__mb-postgres__list_tables`: List all tables
  - `mcp__mb-postgres__query`: Run SQL queries 
  - `mcp__mb-postgres__describe_table`: Get schema information

# Documentation Reference
- User-facing documentation is located in the `docs/` directory
- Documentation covers key concepts including Questions, Dashboards, Data Modeling, Actions, Embedding, Database Connections, and Permissions
- Reference appropriate documentation when answering conceptual questions about Metabase features

# Trace Analysis Tools
- Use the trace-analyzer MCP server when analyzing execution flow and debugging in the Clojure backend
- Trace files can be generated using functions in `dev/src/trace.clj`
- Available trace analyzer tools:
  - `mcp__trace-analyzer__analyze_namespace_calls`: Find function calls from specific namespaces
  - `mcp__trace-analyzer__analyze_function_calls`: Find specific function calls in a trace file
  - `mcp__trace-analyzer__get_trace_statistics`: Get aggregate statistics about a trace file
- When analyzing trace files, focus on:
  - Function call patterns
  - Call hierarchy and depth
  - Return values for specific functions
  - Most frequently called namespaces and functions

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

# Prompt Responses
- Never make factual assertions that you can not provide proof of or citations for
- If there is any uncertainty in your analysis clearly communicate this to the user
- Be aware of your own limitations and communicate these limitations when appropriate

# Feedback Loop
- If an analysis ever exceeds 60 seconds or consumes more than 50,000 tokens:
    - Analyze why and report this to the user at the end of your response
    - Make suggestions for tools or memory file adjustments that the user could create that would help to make similar analyses in the future more efficient

# Claude Custom Commands
- When executing custom slash commands carefully read the instructions in the command file before doing anything else
    - If the command instructions are clear and precise, follow them exactly as written and do not include extra steps

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

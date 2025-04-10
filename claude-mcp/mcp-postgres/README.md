# Metabase PostgreSQL MCP Server

This directory contains a Claue Code Stdio MCP (Model Context Provider) server that connects to Metabase's PostgreSQL application database. The server allows Claude to query the database directly, providing insights into the database schema and data for better assistance with Metabase development.

If you just want to use this you can skip to step 5. Steps 1 - 4 in cluded incase you want to build one yourself.

Helpful links:
[Claude Code MCP docs](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/tutorials?q=mcp+server#set-up-model-context-protocol-mcp)
[MCP Standard docs](https://modelcontextprotocol.io/tutorials/building-mcp-with-llms)
[Postgres MCP Server example](https://github.com/modelcontextprotocol/servers/tree/main/src/postgres)

## Steps involved for creating this

1. Create the directory structure:
   ```
   mkdir -p claude-mcp/mcp-postgres
   cd claude-mcp/mcp-postgres
   ```

2. Initialize the npm project:
   ```
   npm init -y
   ```

3. Install necessary dependencies:
   ```
   npm install @modelcontextprotocol/sdk pg
   ```

4. Create the server.ts file:
   ```
   touch server.ts
   ```
   Then edit this file to implement the PostgreSQL connection and MCP server. This `server.ts` was copied from the existing postgres mcp server [here](https://github.com/modelcontextprotocol/servers/tree/main/src/postgres) and then modified by claude code (mostly because claude code doesnt support resources I think).

5. Add the MCP server to Claude:
   ```
   claude mcp add mb-postgres -- npx tsx /path/to/server.ts "postgresql://user:pass@localhost:5432/mydb"
   ```
   
   Note: Replace the PostgreSQL connection string with your actual database credentials and connection information.

## Usage

After adding the MCP server to Claude, you can use the `/mcp` command to check connectivity:

```
/mcp
```

This should show:
```
MCP Server Status (Debug Mode)
• mb-postgres: connected
```

Then use the `/query` command to interact with the database through Claude. For example:

```
/query
```

This allows you to:
- List available tables
- Explore table structures
- Run SQL queries against the Metabase application database

## Benefits

Having access to the database schema and data through the MCP server enables Claude to:
- Understand the actual database schema rather than inferring it from code
- See real relationships between data entities
- Provide concrete examples of data formats
- Better reason about SQL queries and data flow in the Clojure backend
- Discover missing context or implied relationships

This approach is particularly valuable for understanding how Metabase's backend Clojure code interacts with the application database.

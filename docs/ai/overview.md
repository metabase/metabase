---
title: AI in Metabase
summary: Overview of all the ways you can use AI with Metabase.
---

# AI in Metabase

There are three main ways you can use AI with your Metabase:

- [Metabot](#metabot)
- [MCP server](#mcp-server)
- [Agent-driven file-based development workflow](#agent-driven-development-workflow)


## Metabot

> See [full docs for Metabot](metabot.md).

**Best for: daily tasks in Metabase; granular control over people's AI usage.**

**Functionality:** Metabot is Metabase's built-in AI agent. Metabot can help you with most daily tasks around Metabase, like answering questions about your data, creating queries, generating SQL code, explaining charts, or creating Documents. See [non-exhaustive list of things Metabot can do](metabot.md#what-metabot-can-do), as well as its [limitations](metabot.md#current-limitations).

**Controls:** Metabot will only see what the person using it can see. Metabot also comes with additional permission controls and usage limits so that you control who can use which Metabot tools (e.g. chat vs SQL generation) and how many tokens they can spend.

**Provider**:  Choose from:

- Metabase's own AI Service (available as an add-on exclusively for Metabase Cloud)
- Third-party models via an API key (Anthropic models only for now).

**Plans**: available on all plans. You can only use Metabase's AI Service on Metabase Cloud.

## MCP server

> See [full docs for MCP server](mcp.md).

**Best for: askng ad-hoc, ephemeral questions; combining data from Metabase with data from other tools.**

**Functionality**: Connect your favorite third-party AI tool - like Claude or Codex - to the Metabase MCP server. MCP server's main functionality is designed to for answering in-the-moment questions like "hey btw what's our q3 revenue?". It's also useful when combined with other MCP servers - for example, you can ask Claude a question about your customer that combines data from Metabase, Salesforce, and Zendesk.

Compared to the built-in Metabot, MCP server has somewhat restricted functionality (for example, it can't generate code or built transforms for now). See [the ever-expanding list of MCP server tools](mcp.md#available-tools).

**Controls**: Metabase MCP server requires people to authenticate into Metabase, and all the responses it provides will be scoped to their permissions. However, Unlike built-in Metabot, MCP server doesn't come with granular control over which _tools_ people can use.

**Provider**: Requests to Metabase MCP server are handled by the provider you choose connect to the MCP server (e.g. Claude, Cursor, etc).

**Plans**: MCP server is available on all plans.

## Agent-driven development workflow

> See [full docs for agent-driven workflow](./file-based-development.md)

Best for: developers creating stuff that other people will use.

**Functionality** Use a coding agent like Claude Code to understand your database's metadata, generate Metabase content as YAML files locally, verify the schema, then sync and import the generated into your production Metabase. Sky's the limit on what you can accomplish.

**Controls**: Only admins can sync content to Metabase instances.

**Provider**: Everything is handled by your coding agent of choice.

**Plans**: Agent-driven workflows require a Pro/Enterprise plan.

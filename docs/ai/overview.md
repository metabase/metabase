---
title: AI in Metabase
summary: Overview of all the ways you can use AI with Metabase.
---

# AI in Metabase

AI in Metabase is optional. You can use Metabase without AI at all. But if you do want to use AI to interact with Metabase, we have you covered.

Here are the different ways to use AI with Metabase:

- [Metabot](#metabot)
- [MCP server](#mcp-server)
- [Agent-driven file-based development workflow](#agent-driven-development-workflow)

## Metabot

**Best for: daily tasks in Metabase; granular control over people's AI usage.**

Metabot is Metabase's built-in AI agent. Metabot can help you with most daily tasks around Metabase, like answering questions about your data, creating queries, generating SQL code, explaining charts, or creating Documents. If you're embedding Metabase into your product, you can get the Metabot agent through the [AI chat component](../embedding/components.md#ai-chat). See [non-exhaustive list of things Metabot can do](metabot.md#what-metabot-can-do), as well as its [limitations](metabot.md#current-limitations).

**Controls:** Metabot will only see what the person using it can see. Metabot also comes with additional permission controls and usage limits so that you control who can use which Metabot tools (e.g. chat vs SQL generation) and how many tokens they can spend.

**Provider**: Choose from:

- Metabase's own AI Service (available as an add-on exclusively for Metabase Cloud)
- Third-party models via an API key (Anthropic models only for now).

**Plans**: available on all plans. You can only use Metabase's AI Service on Metabase Cloud.

See [full docs for Metabot](metabot.md) and [embedded AI chat](../embedding/components.md#ai-chat).

## MCP server

**Best for: asking ad-hoc, ephemeral questions; combining data from Metabase with data from other tools.**

Connect your favorite third-party AI tool - like Claude or Codex - to the Metabase MCP server. MCP servers are designed for answering in-the-moment questions like "hey btw what's our q3 revenue?" Metabase's MCP server is also useful when combined with other MCP servers. For example, you can ask Claude a question about your customers that combines data from Metabase, your CRM, and your support ticket platform.

Compared to the built-in Metabot, MCP server has somewhat restricted functionality (for example, it can't generate code or build transforms for now). See [the ever-expanding list of MCP server tools](mcp.md#available-tools).

**Controls**: Metabase MCP server requires people to authenticate into Metabase, and all the responses it provides will be scoped to their permissions. However, unlike built-in Metabot, MCP server doesn't come with granular control over which _tools_ people can use, or disable MCP server altogether.

**Provider**: Requests to Metabase's MCP server are handled by the provider you choose to connect to the MCP server (e.g. Claude, Cursor, etc).

**Plans**: MCP server is available on all plans.

See [full docs for MCP server](mcp.md).

## Agent-driven development workflow

**Best for: developers creating stuff that other people will use.**

Use a coding agent like Claude Code to understand your database's metadata, generate Metabase content as YAML files locally, verify the schema, then sync and import the generated content into your production Metabase. Sky's the limit on what you can accomplish.

**Controls**: Only admins can sync content to Metabase instances.

**Provider**: Everything is handled by your coding agent of choice.

**Plans**: Agent-driven workflows require a Pro/Enterprise plan.

See [full docs for agent-driven workflow](./file-based-development.md)

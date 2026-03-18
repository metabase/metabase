---
title: AI agent resources for embedding
summary: LLM.txt and agent skills to help AI coding agents with Metabase embedding.
---

# AI agent resources for embedding

If you use an AI coding agent, you can give the agent Metabase-specific context to help with embedding setup, upgrades, and migrations.

## llms.txt

Agents can read the docs you're reading now (and many agents have already read our docs), but we also publish llms.txts to that you can give your AI agent:

- [Summary of docs, with links](https://www.metabase.com/docs/llms.txt).
- [The full docs](https://www.metabase.com/docs/llms-embedding-full.txt).

## Agent skills

The [Metabase agent skills pack](https://github.com/metabase/agent-skills) gives your AI agent step-by-step playbooks for specific embedding tasks.

### Available skills

| Skill                           | Description                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| SDK version upgrade             | Upgrade your modular embedding SDK, including changelog checks and breaking change handling. |
| Full app → modular embedding    | Migrate from full app embedding to modular embedding.                                        |
| Modular embedding → SDK (React) | Migrate from script-based modular embedding to the React SDK.                                |
| Static → guest embeds           | Migrate from static (signed) embeds to guest embeds.                                         |
| SSO for embeds                  | Set up SSO authentication for embedded Metabase. _(In development.)_                         |

Browse all skills on the [Skills Marketplace](https://skillsmp.com/skills/metabase-agent-skills-skills-metabase-modular-embedding-version-upgrade-skill-md).

## Agents are not magic

Always review and validate the changes made by a skill. Check that your application builds, tests pass, and the embedding works as expected before committing.

## Further reading

- [Embedding introduction](./introduction.md)
- [Modular embedding SDK](./sdk/introduction.md)
- [Upgrading the modular embedding SDK](./sdk/upgrade.md)

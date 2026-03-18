---
title: AI agent resources for embedding
summary: LLM.txt and agent skills to help AI coding agents with Metabase embedding.
---

# AI agent resources for embedding

If you use an AI coding agent, you can give the agent Metabase-specific context to help with embedding setup, upgrades, and migrations.

## llms.txt

Agents can read the docs you're reading now (and many agents have already read our docs), but we also publish llms.txts so that you can give your AI agent:

- [Summary of embedding docs, with links](https://www.metabase.com/docs/llms.txt).
- [The full embedding docs](https://www.metabase.com/docs/llms-embedding-full.txt).

## Agent skills

We've developed some [agent skills](https://github.com/metabase/agent-skills) to give your AI agents step-by-step playbooks for specific embedding tasks.

### Available skills

| Skill                           | Description                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| [SDK version upgrade](https://skillsmp.com/skills/metabase-agent-skills-skills-metabase-modular-embedding-version-upgrade-skill-md) | Upgrade your modular embedding SDK, including changelog checks and breaking change handling. |
| [Full app → modular embedding](https://skillsmp.com/skills/metabase-agent-skills-skills-metabase-full-app-to-modular-embedding-upgrade-skill-md) | Migrate from full app embedding to modular embedding. |
| [Modular embedding → SDK (React)](https://skillsmp.com/skills/metabase-agent-skills-skills-metabase-modular-embedding-to-modular-embedding-sdk-upgrade-skill-md) | Migrate from script-based modular embedding to the React SDK. |
| [Static → guest embeds](https://skillsmp.com/skills/metabase-agent-skills-skills-metabase-static-embedding-to-guest-embedding-upgrade-skill-md) | Migrate from static (signed) embeds to guest embeds. |
| [SSO for embeds](https://skillsmp.com/skills/metabase-agent-skills-skills-metabase-embedding-sso-implementation-skill-md) | Set up SSO authentication for embedded Metabase. _(In development.)_ |

Browse all skills on the [agent skills repo](https://github.com/metabase/agent-skills).

## Agents are not magic

Always review and validate the changes made by agents. Check that your application builds, tests pass, and the embedding works as expected before committing.

## Further reading

- [Embedding introduction](./introduction.md)
- [Modular embedding SDK](./sdk/introduction.md)
- [Upgrading the modular embedding SDK](./sdk/upgrade.md)
- [Agent skills repo](https://github.com/metabase/agent-skills)

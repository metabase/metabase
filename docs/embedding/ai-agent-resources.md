---
title: AI agent resources for embedding
summary: Agent skills and llms.txt to help AI coding agents embed Metabase in your app.
---

# AI agent resources for embedding

If you use an AI coding agent, you can give the agent Metabase-specific context to help with embedding setup, upgrades, and migrations.

## Agent skills

We've developed some [agent skills](https://github.com/metabase/agent-skills) to give your AI agents step-by-step playbooks for specific embedding tasks.

### Available skills

| Skill                           | Description                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| [SDK version upgrade](https://skillsmp.com/skills/metabase-agent-skills-skills-metabase-modular-embedding-version-upgrade-skill-md) | Upgrade your modular embedding SDK, including changelog checks and breaking change handling. |
| [Full app → modular embedding](https://skillsmp.com/skills/metabase-agent-skills-skills-metabase-full-app-to-modular-embedding-upgrade-skill-md) | Migrate from full app embedding to modular embedding. |
| [Modular embedding → SDK (React)](https://skillsmp.com/skills/metabase-agent-skills-skills-metabase-modular-embedding-to-modular-embedding-sdk-upgrade-skill-md) | Migrate from script-based modular embedding to the React SDK. |
| [Static → guest embeds](https://skillsmp.com/skills/metabase-agent-skills-skills-metabase-static-embedding-to-guest-embedding-upgrade-skill-md) | Migrate from static (signed) embeds to guest embeds. |
| [SSO for embeds](https://skillsmp.com/skills/metabase-agent-skills-skills-metabase-embedding-sso-implementation-skill-md) | Set up SSO authentication for embedded Metabase.|

Browse all skills on the [agent skills repo](https://github.com/metabase/agent-skills).

## llms.txt

Agents can read the docs you're reading now (and many agents have already read our docs), but we also publish llms.txts so that you can give your AI agent:

- [Summary of embedding docs, with links](https://www.metabase.com/docs/llms.txt).
- [The full embedding docs](https://www.metabase.com/docs/llms-embedding-full.txt).

If you're on a specific version (e.g., v0.58), you can use versioned llms.txt files scoped to that version's docs:

- `https://www.metabase.com/docs/v0.58/llms.txt`
- `https://www.metabase.com/docs/v0.58/llms-embedding-full.txt`

## Agents are not magic

Always review and validate the changes made by agents. Check that your application builds, tests pass, and the embedding works as expected before committing anything.

## Further reading

- [Embedding introduction](./introduction.md)
- [Modular embedding SDK](./sdk/introduction.md)
- [Upgrading the modular embedding SDK](./sdk/upgrade.md)
- [Agent skills repo](https://github.com/metabase/agent-skills)

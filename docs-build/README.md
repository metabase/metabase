# docs-build

Astro renderer for [`../docs/`](../docs). The markdown lives next door; this
directory is everything that turns it into a static site.

See [`../docs/developers-guide/docs.md`](../docs/developers-guide/docs.md) for
the full guide: previewing, building, generators, multi-version builds, and
where each piece lives.

For most things you don't need to be in this directory — the build is
orchestrated from the repo root via mage:

```
bun run docs:help         # list every docs command with a one-line description
bun run docs:dev          # hot-reload preview (skips auto-generated content)
bun run docs:preview      # full preview with lazy regen of generated artifacts
bun run docs:build        # production build (what CI runs)
bun run docs:check        # type check + nav.yml validation
bun run docs:test         # unit tests for the custom remark/rehype plugins
```

For agents working in this area, see
[`.claude/skills/docs-build/SKILL.md`](../.claude/skills/docs-build/SKILL.md).

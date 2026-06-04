# Working with frontend code

## Structure

```
frontend/src/
├── metabase/              # Main application — components, pages, and features
├── metabase-lib/          # Query building & data modeling (MLv2 JS bindings)
├── metabase-types/        # TypeScript type definitions (API responses, analytics)
├── metabase-shared/       # Thin shared helpers reused across bundles
├── embedding-sdk-bundle/  # Embedding SDK public API and component exports
├── embedding-sdk-shared/  # Shared utilities/types for the embedding SDK
└── types/                 # Global / ambient type declarations

enterprise/frontend/src/
├── metabase-enterprise/   # Enterprise feature modules (loaded via the plugin system)
├── embedding/             # Embedded analytics customization and extensions
├── embedding-sdk-ee/      # Enterprise-only embedding SDK features
└── embedding-sdk-package/ # Embedding SDK npm package build tooling and exports

frontend/test/             # Jest unit tests
```

## Technology Stack

- **Framework**: React 18 with TypeScript
- **State**: Redux Toolkit
- **Styling**: Mantine style props (preferred) > CSS Modules
- **UI**: `metabase/ui` components built with Mantine v8
- **Package manager**: Bun
- **Build**: Rspack (primary), Webpack (legacy)
- **Testing**: Jest + React Testing Library, Cypress

## Coding Standards

@../docs/developers-guide/frontend.md

Read `docs/developers-guide/frontend.md` before frontend work — it's the detailed guide imported above.

### Load the right skill first

Before starting a frontend task, load the matching skill from `.claude/skills/` — the
skills hold the authoritative, detailed rules. The guide above and the notes below are a
summary; when they disagree, follow the skill.

- Writing / refactoring TypeScript or React → **typescript-write**
- Reviewing a TypeScript/React diff → **typescript-review**
- Writing Cypress E2E specs → **e2e-test-create**, **typescript-write**
- Running / debugging Cypress E2E → **e2e-test**
- Replacing Emotion styled-components with Mantine → **emotion-migrate**
- Adding product analytics events → **analytics-events**

### Enterprise Features

Enterprise functionality MUST use the plugin system. It is very important to not expose enterprise code in the OSS version.

### Scripts

@../.claude/skills/_shared/typescript-commands.md

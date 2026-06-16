# Working with frontend code

## Where frontend code lives

This is a high-level guide. Use available search tools to discover the current structure. Update the guide if new high-level modules have been added/discovered.

- Main app UI: `frontend/src/metabase`
- Query builder, notebook, and visualization flow: `frontend/src/metabase/query_builder`
- Dashboard runtime and editing: `frontend/src/metabase/dashboard`
- Admin screens: `frontend/src/metabase/admin`
- Shared app components: `frontend/src/metabase/common/components`
- API clients: `frontend/src/metabase/api`
- Query building and data modeling: `frontend/src/metabase-lib`
- Shared TypeScript types: `frontend/src/metabase-types`
- Thin helpers reused across bundles: `frontend/src/metabase-shared`
- Global and ambient type declarations: `frontend/src/types`
- Embedding SDK OSS code: `frontend/src/embedding-sdk-bundle` and `frontend/src/embedding-sdk-shared`
- Enterprise-only features: `enterprise/frontend/src/metabase-enterprise`
- Enterprise embedding code: `enterprise/frontend/src/embedding`, `enterprise/frontend/src/embedding-sdk-ee`, and `enterprise/frontend/src/embedding-sdk-package`
- Custom visualization enterprise code: `enterprise/frontend/src/custom-viz`
- Jest unit tests: colocated next to the files they test
- Jest test support and mocks: `frontend/test`
- Cypress E2E scenarios: `e2e/test/scenarios`
- Cypress component test scenarios: `e2e/test-component/scenarios`

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
- Restyling / implementing a `metabase/ui` component from a Figma spec → **metabase-ui-component-from-figma**

### Enterprise Features

Enterprise functionality MUST use the plugin system. It is very important to not expose enterprise code in the OSS version.

### Scripts

@../.claude/skills/_shared/typescript-commands.md

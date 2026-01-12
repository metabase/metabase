# Working in /frontend

## Structure

```
frontend/src/
├── metabase/           # Main application components and pages
├── metabase-lib/       # Query building and data modeling utilities
├── metabase-types/     # TypeScript type definitions
└── metabase/ui/        # Design system components

frontend/test/          # Jest unit tests
```

## Technology Stack

- **Framework**: React 18 with TypeScript
- **State**: Redux Toolkit
- **Styling**: CSS Modules (preferred) > Emotion styled-components
- **UI**: `metabase/ui` components built with Mantine v8
- **Build**: Rspack (primary), Webpack (legacy)
- **Testing**: Jest + React Testing Library, Cypress

## Coding Standards

### Component Preferences

- Prefer `metabase/ui`components over `metabase/common/components`
- Use `.tsx` for components, `.ts` for utilities

### Styling

ALWAYS prefer Mantine style props,then CSS modules. DO NOT suggest styled components, they are deprecated.

### TypeScript Migration

When heavily editing `.js`/`.jsx` files, create a separate PR to convert to TypeScript first, then implement changes.

### Enterprise Features

Enterprise functionality MUST use the plugin system. It is very important to not expose enterprise code in the OSS version.

### Testing Requirements

All PRs should include tests. Prefer Unit tests over E2E tests.

### Localization

All user-facing strings MUST be localized using the ttag library. Localized strings should be complete phrases, do not concatenate a few separately localized strings. You should add context to strings where the meaning of the string might not be obvious in isolation: e.g. "Home" might have different words in some languages depending on whether you're talking about a dwelling or the landing page for a website.

## Linting and Formatting

- **Lint:** `bun run lint-eslint-pure`
  - Run ESLint on the codebase
- **Format:** `bun run prettier`
  - Format code using Prettier
- **Type Check:** `bun run type-check-pure`
  - Run TypeScript type checking

## Testing

### JavaScript/TypeScript Tests

- **Test a specific file:** `bun run test-unit-keep-cljs path/to/file.unit.spec.js`
- **Test by pattern:** `bun run test-unit-keep-cljs -t "pattern"`
  - Runs tests matching the given pattern

### ClojureScript Tests

- **Test ClojureScript:** `bun run test-cljs`
  - Run ClojureScript tests

## Linting and Formatting

- **Lint:** `pnpm lint-eslint-pure`
  - Run ESLint on the codebase
- **Format:** `pnpm prettier`
  - Format code using Prettier
- **Type Check:** `pnpm type-check-pure`
  - Run TypeScript type checking

## Testing

### JavaScript/TypeScript Tests

- **Test a specific file:** `pnpm test-unit-keep-cljs path/to/file.unit.spec.js`
- **Test by pattern:** `pnpm test-unit-keep-cljs -t "pattern"`
  - Runs tests matching the given pattern

### ClojureScript Tests

- **Test ClojureScript:** `pnpm test-cljs`
  - Run ClojureScript tests

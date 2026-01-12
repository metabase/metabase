## Linting and Formatting

- **Lint:** `bun lint-eslint-pure`
  - Run ESLint on the codebase
- **Format:** `bun prettier`
  - Format code using Prettier
- **Type Check:** `bun type-check-pure`
  - Run TypeScript type checking

## Testing

### JavaScript/TypeScript Tests

- **Test a specific file:** `bun test-unit-keep-cljs path/to/file.unit.spec.js`
- **Test by pattern:** `bun test-unit-keep-cljs -t "pattern"`
  - Runs tests matching the given pattern

### ClojureScript Tests

- **Test ClojureScript:** `bun test-cljs`
  - Run ClojureScript tests

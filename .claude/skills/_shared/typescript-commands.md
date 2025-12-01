## Linting and Formatting

- **Lint:** `yarn lint-eslint-pure`
  - Run ESLint on the codebase
- **Format:** `yarn prettier`
  - Format code using Prettier
- **Type Check:** `yarn type-check-pure`
  - Run TypeScript type checking

## Testing

### JavaScript/TypeScript Tests

- **Test a specific file:** `yarn test-unit-keep-cljs path/to/file.unit.spec.js`
- **Test by pattern:** `yarn test-unit-keep-cljs -t "pattern"`
  - Runs tests matching the given pattern

### ClojureScript Tests

- **Test ClojureScript:** `yarn test-cljs`
  - Run ClojureScript tests

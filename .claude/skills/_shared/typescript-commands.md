## Linting and Formatting

- **Lint:** `bun run lint-oxlint`
  - Run oxlint on the codebase
- **Format:** `bun run format`
  - Format code with oxfmt (`oxfmt --write`); use `bun run lint-format-pure` to check without writing
- **Type Check:** `bun run type-check-pure`
  - Run TypeScript type checking

`type-check` and `test-unit` rebuild ClojureScript first, and `lint-format` runs `bun install` first. When you only need the check, use `type-check-pure`, `lint-format-pure`, or `test-unit-keep-cljs`.

## Testing

### JavaScript/TypeScript Tests

These reuse existing compiled ClojureScript output:

- **Test specific files:** `bun run test-unit-keep-cljs --runInBand --runTestsByPath path/to/file.unit.spec.tsx`
  - Use explicit Jest path flags. A bare positional path can be consumed by `--ignoreProjects` in this script and launch an unintended broad run.
- **Test by name within specific files:** `bun run test-unit-keep-cljs --runInBand --runTestsByPath path/to/file.unit.spec.tsx -t "pattern"`
  - Runs matching test names only within the specified files.

### ClojureScript Tests

- **Test ClojureScript:** `bun run test-cljs`
  - Run ClojureScript tests

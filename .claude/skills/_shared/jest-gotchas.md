### Jest gotchas

- **fetch-mock uses the first route that matches.** A second `fetchMock.get` for the same path does not replace the first one. To override a route that a `setup*Endpoints` helper registers, register your route before you call the helper.
- **Many dynamic `import()` targets.** `jest.mock` takes one literal path. To mock a template import such as ``import(`docs/${name}.md`)``, call `jest.doMock(path, factory)` in a loop at the top of the spec. The dynamic import runs during the test, after the loop. Each path must exist on disk, or the suite does not load.
- **Mantine `Tabs`** removes inactive panels from the DOM. Use `queryBy...` with `not.toBeInTheDocument()`, not `not.toBeVisible()`.
- **Mantine `Collapse`** keeps closed content in the DOM. Use `not.toBeVisible()` before it opens, and `await waitFor(() => expect(...).toBeVisible())` after it opens. `NavLink` and `Collapse` children stay `display: none` for a short time after they expand: use `findBy...`, not `getBy...`.

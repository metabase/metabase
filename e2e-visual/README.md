# Storybook visual tests

Playwright screenshots of Storybook stories, compared against the baselines in `__screenshots__/`.
There is one test per story, named `<title> / <story name> [<story id>]`, and one baseline per story, named `<story id>.png`.

## Running locally

The tests read `storybook-static/`, so build Storybook first:

```sh
NODE_ENV=development bun run build-pure:cljs
bun run build-storybook:test
bun run test-visual
```

`build-storybook:test` runs `storybook build --test`, which leaves out the docs pages, prop tables, and source maps that the tests don't use, so it's faster than `build-storybook`.
`bun run test-visual:ci` builds Storybook the same way and then runs the tests.
To test against a Storybook that's already running, such as `bun run storybook`, set `STORYBOOK_URL=http://localhost:6006`.

The HTML report is written to `e2e-visual/report/`. Open it with `bunx playwright show-report e2e-visual/report`.
`e2e-visual/test-results/` has `results.json`, with per-step timings, and `captured/`, with every screenshot the run took.

## Choosing stories

By default, the tests cover the stories that match `STORY_FILTERS` in `stories.config.ts`. Each filter is a case-insensitive regex tested against `"<title> <story name>"`.

You can narrow that set in three ways. They combine, so a story has to pass every filter you set.

- `VISUAL_FILES`: comma-separated story files, relative to the repo root.

  ```sh
  VISUAL_FILES=frontend/src/metabase/ui/components/buttons/Button/Button.stories.tsx,frontend/src/metabase/palette/components/Palette.stories.tsx bun run test-visual
  ```

- `VISUAL_GREP`: a case-insensitive regex tested against `"<title> <story name>"`.

  ```sh
  VISUAL_GREP="^Components/Feedback/Alert" bun run test-visual
  ```

- Playwright's `--grep`, which matches the test title, including the story id.

  ```sh
  bun run test-visual --grep "Tooltip / "
  ```

To leave a story out, tag it (or its component meta) with `no-visual`:

```ts
export const Interactive = {
  tags: ["no-visual"],
};
```

On a pull request, CI builds Storybook with only the story files that Loki would run for the change, and passes them to the tests as `VISUAL_FILES`.
A change inside `e2e-visual/`, or to anything that makes Loki run every story, runs every story here too.

## Baselines

Baselines come from Linux, so screenshots taken on macOS won't match them. There are two ways to get Linux screenshots:

- Add the `ci:update-visual-snapshots` label to a pull request. CI updates the baselines, removes the ones for deleted stories, and pushes a commit to the branch.
- Run `bun run test-visual:docker`, which runs the tests in the official `linux/amd64` Playwright image for the installed `@playwright/test` version. It takes the same arguments as `bun run test-visual`, for example `bun run test-visual:docker --update-snapshots`. It needs a built `storybook-static/`, and only the repo is mounted into the container, so `VISUAL_SNAPSHOT_DIR` has to point inside it.

To experiment on macOS without touching the committed baselines, point `VISUAL_SNAPSHOT_DIR` at a scratch directory:

```sh
VISUAL_SNAPSHOT_DIR=e2e-visual/scratch bun run test-visual --update-snapshots
VISUAL_SNAPSHOT_DIR=e2e-visual/scratch bun run test-visual
```

`bun run test-visual:prune` deletes baselines for stories that are no longer in the default set.

## What a test does

1. Opens the story in `iframe.html` at 1366×768.
2. Waits for Storybook to finish rendering, including the play function.
3. Waits for network requests to finish. The test fails if a request gets a 4xx or 5xx response or fails to load.
4. Waits for promises registered with `@loki/create-async-callback`.
5. Screenshots the area covered by the visible elements under `#storybook-root`, or under the parent of `parameters.loki.chromeSelector` when a story sets it. When the content is taller than the viewport, the viewport grows to fit it.

## Other settings

- `VISUAL_WORKERS` sets the number of workers. The default is 4 on CI and half the CPU cores locally.
- The comparison `threshold` and `maxDiffPixelRatio` in `playwright.config.ts` are starting values. Tune them from a stress run on CI.

---
title: Visual Tests
---

# Visual Tests

We use [Percy](https://percy.io/) via Github actions to run visual regression tests. Percy provides pull-request-based workflow, handles diff review and approval flow conveniently. In addition to that, It integrates with Cypress, which allows us to use all power of our custom helpers and commands. We run

## How to run visual tests on CI

When your PR is ready for review, you can run visual tests (handled by Percy) in one of two ways:

- Add a `visual` label to the pull request.
- Comment on the pull request with `@metabase-bot run visual tests`

**Only run these visual tests when your pull request is ready for review**. Percy charges by the screenshot, so running the visual tests on every commit gets expensive.

By default, Cypress tests will run to ensure that the underlying tests are valid, but Cypress won't submit screenshots to the Percy servers. When the PR is labeled or commented to run the visual tests, the Cypress run command is prefixed by `percy exec --` and a valid `PERCY_TOKEN` environment variable, and Cypress will submit the screenshots to the Percy servers.

To recap:

**1. Add `visual` label to your pull request**

**2. If there are some visual changes, it shows a failed Percy check in the PR**

![Screenshot from the "Checks" section of a pull request showing that the Percy check has failed.](https://user-images.githubusercontent.com/14301985/126795943-50ebbe5e-ed36-48fe-ab69-642555a1bc1d.png)

**3. Once you review and approve the changes, the PR check becomes green**

![Screenshot from Percy highlighting the visual changes to a chart in red. There is a green button that says "Approve build" in the top left.](https://user-images.githubusercontent.com/14301985/126796075-31d5ed5d-6926-4e98-99d2-4aef20738b56.png)

![Screenshot from the "Checks" section of a pull request showing that the Percy check has passed.](https://user-images.githubusercontent.com/14301985/126796104-c533bbea-006c-47ef-83fa-0c07fcf5393b.png)

## How to create a visual test

We use Cypress to write Percy tests so we can fully use all existing helpers and custom commands.

Visual regression tests live inside the `e2e/test/visual` directory. Writing a Percy test consists of creating a desired page state and executing `cy.createPercySnapshot()` command.

### Goal

Each visual test should cover as many as possible different elements, variants on the same screenshot. For instance, when we are writing E2E test that checks a chart on a dashboard we add just one card and run assertions. In opposite to that, a visual test can contain every type of chart on the same dashboard because it significantly reduces the number of screenshots we produce which reduces the cost of using Percy.

### Workflow

1. Run Metabase in the dev mode locally (`yarn dev` or similar commands).
2. Run `yarn test-visual-open` to open Cypress locally. You do not need to export any `PERCY_TOKEN`.
3. Create a spec inside `e2e/test/visual` and run it via Cypress runner.

At this step, if you added `percySnapshot` command somewhere in your test, you will see `percyHealthCheck` step in your test:

![Cypress test results showing the `percyHealthCheck` task.](./images/visual-tests/percy-healthcheck-step.png)

Consider the page state at `percyHealthCheck` step as the one that will be captured.

### Notes

- You don't need to export `PERCY_TOKEN` for running tests. If a token is exported Percy will send snapshots from your local machine to their servers so that you will be able to see your local run in their interface.
- When the application code uses `Date.now()`, you can [freeze](https://docs.percy.io/docs/freezing-dynamic-data#freezing-datetime-in-cypress) date/time in Cypress.
- [Stub](https://github.com/metabase/metabase/pull/17380/files#diff-4e8ebaf75969143a5eee6bfb8adcd4b72d4330d18d77319e3434d11cf6c75e40R15) `Math.random` when you deal with randomization.
- When testing a page that renders any dates coming from the server, in order to avoid unwanted visual changes, add `data-server-date` attribute to all DOM nodes that render dates. The custom `createPercySnapshot` command replaces content with a constant placeholder before capturing a snapshot.

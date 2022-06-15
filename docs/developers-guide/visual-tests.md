---
title: Visual Tests
---

# Visual Tests

We use [Percy](https://percy.io/) via Github actions to run visual regression tests. Percy provides pull-request-based workflow, handles diff review and approval flow conveniently. In addition to that, It integrates with Cypress, which allows us to use all power of our custom helpers and commands. We run

## How to run visual tests on CI

Percy tests are supposed to be run on CI since every run is attached to a pull request. Only when a cypress tests run command is prefixed by `percy exec --` and there is a valid `PERCY_TOKEN` environment variable specified, Percy CLI will submit pages snapshots to Percy servers, and we will be charged for every screenshot. To make use of Percy more cost-efficient, we manually trigger visual tests by assigning `visual` pull request label. It will also run the tests on every subsequent commit. If you plan to perform a lot of commits while the PR is work-in-progress and you don't need to run tests on all of them, then just temporarily remove the label. It is important because we pay for every screenshot and it saves screenshot credits. Alternatively, you can trigger visual tests manually by posting a PR comment with a `@metabase-bot run visual tests` command.
In addition to that, we need to ensure that underlying Cypress tests are valid, so we run them without submitting screenshots to Percy on every commit.

**1. Add `visual` label to your pull request**

**2. If there are some visual changes, it shows a failed Percy check in the PR**

![https://user-images.githubusercontent.com/14301985/126795943-50ebbe5e-ed36-48fe-ab69-642555a1bc1d.png](https://user-images.githubusercontent.com/14301985/126795943-50ebbe5e-ed36-48fe-ab69-642555a1bc1d.png)

**3. Once you review and approve the changes, the PR check becomes green**

![https://user-images.githubusercontent.com/14301985/126796075-31d5ed5d-6926-4e98-99d2-4aef20738b56.png](https://user-images.githubusercontent.com/14301985/126796075-31d5ed5d-6926-4e98-99d2-4aef20738b56.png)

![https://user-images.githubusercontent.com/14301985/126796104-c533bbea-006c-47ef-83fa-0c07fcf5393b.png](https://user-images.githubusercontent.com/14301985/126796104-c533bbea-006c-47ef-83fa-0c07fcf5393b.png)

## How to create a visual test

We use Cypress to write Percy tests so we can fully use all existing helpers and custom commands.

Visual regression tests live inside the `frontend/test/metabase-visual` directory. Writing a Percy test consists of creating a desired page state and executing `cy.percySnapshot()` command.

### Goal

Each visual test should cover as many as possible different elements, variants on the same screenshot. For instance, when we are writing E2E test that checks a chart on a dashboard we add just one card and run assertions. In opposite to that, a visual test can contain every type of chart on the same dashboard because it significantly reduces the number of screenshots we produce which reduces the cost of using Percy.

### Workflow

1. Run Metabase in the dev mode locally (`yarn dev` or similar commands).
2. Run `yarn test-visual-open` to open Cypress locally. You do not need to export any `PERCY_TOKEN`.
3. Create a spec inside `frontend/test/metabase-visual` and run it via Cypress runner.

At this step, if you added `percySnapshot` command somewhere in your test, you will see `percyHealthCheck` step in your test:

![Learn about your data in the SQL editor](./images/visual-tests/percy-healthcheck-step.png)

Consider the page state at `percyHealthCheck` step as the one that will be captured.

### Notes

- You don't need to export `PERCY_TOKEN` for running tests. If a token is exported Percy will send snapshots from your local machine to their servers so that you will be able to see your local run in their interface.
- When the application code uses `Date.now()`, you can [freeze](https://docs.percy.io/docs/freezing-dynamic-data#freezing-datetime-in-cypress) date/time in Cypress.
- [Stub](https://github.com/metabase/metabase/pull/17380/files#diff-4e8ebaf75969143a5eee6bfb8adcd4b72d4330d18d77319e3434d11cf6c75e40R15) `Math.random` when to deal with randomization.
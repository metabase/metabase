---
title: Visual Tests
---

# Visual Tests

We use [Loki](https://loki.js.org/) with Storybook for visual tests. Loki captures snapshots from selected stories and creates PNG references in `./loki/references` folder.

## Local machine

Before running Loki tests locally, ensure that both Storybook and Docker are running.

### Commands

- Run Visual Tests: `yarn test-visual:loki`
- Update Snapshots: `yarn test-visual:loki-update`
- Generate an HTML Report: `yarn test-visual:loki-report`
- Generate and Open Report: `yarn test-visual:loki-report-open`

## CI

Visual tests are automatically triggered on pull requests. The Loki CI job builds the Storybook, captures new snapshots, and compares them with the references. If there are differences, the "Loki Visual Regression Testing" check will fail.

To view the visual diff report, open the failed job page, go to the Summary section, and download the `loki-report` artifact.

If the differences are intentional or caused by a flake, update the reference snapshots by adding the `loki-update` label to the pull request.

## Adding new tests

Adding new test is as simple as adding new stories. As of today, we use visual tests only for charts, however, you can use it for any other stories. Make sure the `storiesFilter` value in `loki.config.js` includes the stories you want to have as visual tests.

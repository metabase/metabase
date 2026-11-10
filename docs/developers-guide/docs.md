---
title: Developing Metabase documentation
summary: Preview docs as you write them, draft docs changes with Docrunner, check for broken links, and regenerate the pages that are built from source.
---

# Developing Metabase documentation

Notes on writing docs for Metabase.

## Linting markdown links

You can check for broken links in the [docs](../) directory by running:

```
bun run docs-lint-links
```

This command uses [Markdown link check](https://github.com/tcort/markdown-link-check) to vet links in all of the markdown files in the [docs](../) directory. We recommend writing the command's output to a file. E.g.,

```
touch ~/links-to-fix.txt && bun run docs-lint-links > ~/links-to-fix.txt
```

Alternatively, if you just want to check the in-product links (the pages passed to `useDocsUrl` and `getDocsUrl`) to make sure they link to actual documents and headings:

```
bun run lint-docs-links
```

You can view both commands in the [package.json](https://github.com/metabase/metabase/blob/master/package.json) file under `scripts`.

## Preview docs as you write them

You'll need [Bun](https://bun.sh) and a checkout of the private `metabase-dot-com` repo at `~/metabase-dot-com`. Then run:

```
./bin/mage docs-preview
```

Your browser opens `http://localhost:4000/docs/latest/`, and your edits show up as you save them. Only `/docs/latest/` pages work.

To preview a worktree or another checkout, pass its path. If `metabase-dot-com` is somewhere else, pass `--site DIR` or set `METABASE_DOT_COM_DIR`.

## Draft docs changes with Docrunner

People with write access to Metabase can add the `Docrunner` label to an open issue.

Docrunner reads the issue, its comments, and the PRs that the issue links to (only PRs from people with write access). It reads only what was there when you added the label: it ignores later comments, and it stops if someone edits the issue body after that. Docrunner changes only Markdown files in `docs/`. If a change belongs in a generated page, Docrunner tells you where the page's source is.

When Docrunner finishes, it removes the label and comments on the issue. If it made a change, the comment links to a draft PR that's assigned to you. The PR description lists what changed and the facts to check against the code. If Docrunner didn't make a change, the comment says why and asks questions. Answer them in the issue, then add the label again.

If the change needs images, a second job takes the screenshots in a Metabase Enterprise Edition built from `master`, with the Sample Database and a license token, so it can take screenshots of paid features. The job pushes the images to the PR in a second commit, and comments on the PR with a note for each image. Check the state and the crop of each image.

GitHub doesn't ask the tech writers to review a draft PR, so mark the PR ready for review when you're done with it. Docrunner adds the `single-backport` label. For a feature that's only on `master`, change it to `no-backport`.

Docrunner won't run if the issue already has an open Docrunner PR. To start over, close that PR, then add the label again.

### Test prompt changes with a dry run

The agent prompts are in `dev/bot/docrunner-agent.md` and `dev/bot/docrunner-screenshots-agent.md`. To test a change to them, push your branch to the `metabase/metabase` repo. Then go to **Actions** > **Docrunner** > **Run workflow**, pick your branch, enter the issue number, and check **Dry run**. A run from a branch uses the prompts on that branch.

Each run uploads its results as workflow artifacts: the docs change, the PR description, the screenshots, and the agent transcripts. A dry run does only that. It doesn't open a PR, push commits, or comment.

## Regenerate docs built from source

Some docs pages are generated from the source code. A scheduled GitHub workflow regenerates them every weekday and opens a PR with any changes.

To regenerate them yourself, first install the [prerequisites for building Metabase](./build.md#install-the-prerequisites): Java, the Clojure CLI, Node.js, and Bun. You don't need to install Babashka, since `./bin/mage` installs it for you. Then install the frontend dependencies:

```
bun install
```

Then run:

```
./bin/mage docs-generate
```

To regenerate one group of pages, pass its suite name. For example:

```
./bin/mage docs-generate backend
```

To list the suites, run `./bin/mage docs-generate -h`. If any suite fails, the last line of output lists it.

## Updating API docs

To update an API endpoint description, you'll need to edit the comment in the [source code for that endpoint](https://github.com/metabase/metabase/tree/master/src/metabase/api).

To bring your changes into `docs/latest/api-documentation`, you'll need to open a separate PR. Check out a new branch from the current release branch, and run:

```
clojure -M:ee:doc api-documentation
```

## Style guide

Ancient [style guide](<https://github.com/metabase/metabase/wiki/Writing-style-guide-for-documentation-and-blog-posts-(WIP)>) that needs an update.

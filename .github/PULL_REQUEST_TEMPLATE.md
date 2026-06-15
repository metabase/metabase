> [!IMPORTANT]
> For those employed by Metabase: if you are fixing a P0 or P1 issue, add a `backport` label to this PR. No action is needed otherwise. Refer to the [Backporting](https://app.notion.com/p/metabase/Branching-Strategy-and-Backports-6eb577d5f61142aa960a626d6bbdfeb3?source=copy_link#e71f6e7de2f945d99fbb2d6b764e6f36) section in the Metabase Branching Strategy document for more details. If you're not employed by Metabase, this section does not apply to you, and the label will be taken care of by your reviewer.

> **Warning**
>
> If that is your first contribution to Metabase, please sign the [Contributor License Agreement](https://docs.google.com/a/metabase.com/forms/d/1oV38o7b9ONFSwuzwmERRMi9SYrhYeOrkbmNaq9pOJ_E/viewform). Also, if you're attempting to fix a translation issue, please submit your changes to our [Crowdin project](https://crowdin.com/project/metabase-i18n) instead of opening a PR.

Closes https://github.com/metabase/metabase/issues/[issue_number]

### Description

Describe the overall approach and the problem being solved.

### How to verify

Describe the steps to verify that the changes are working as expected.

1. New question -> Sample Dataset -> ...
2. ...

### Demo

_Upload a demo video or before/after screenshots if sensible or remove the section_

### Checklist

- [ ] Tests have been added/updated to cover changes in this PR
- [ ] If adding new Loki tests: they pass [stress testing](https://github.com/metabase/metabase/actions/workflows/loki-stress-test-flake-fix.yml)

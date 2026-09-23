---
title: A PR GitHub still counts as part of a stack (even after its base was retargeted to master) cannot be merged with `gh pr merge` or `PUT /pulls/{n}/merge`; only the `/merge-async` endpoint works, and it merges every PR below it in the stack
slug: stacked-pr-merge-needs-merge-async
kind: tool-quirk
impact: wasted-time
severity: medium
status: open
area: gh pr merge; GitHub REST PUT /repos/{o}/{r}/pulls/{n}/merge and /merge-async; stacked PRs
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/fbd9d67a-1fb0-4afe-973d-ba7d8c5d19d1.jsonl
    lines: 1797-1827
    date: 2026-09-17
    jev: {any_papercut: 0.80, env_toolchain: 0.59, stale_state: 0.17, verify_mismatch: 0.43, misleading_code: 0.32, hidden_coupling: 0.51, stale_docs: 0.30, tool_footgun: 0.77, flaky: 0.93, agent_bug: 0.41, wasted_effort: 0.23, user_correction: 0.08}
---
## Summary
A PR that had once been based on another PR's branch was later retargeted to master, approved and green. `gh pr merge --squash` failed with 'This pull request is part of a stack and must be merged using the asynchronous merge REST API', and `gh api -X PUT .../merge` returned 403 'Merging stacked PRs via this endpoint is not supported'. The agent looked up `/merge-async`, checked the PR below was already merged (the endpoint merges every PR in the stack up to the one requested), and merged through it. Three days earlier another session had worked out the same thing from scratch on a two-PR stack.

## Symptom
L1798 GraphQL 'part of a stack and must be merged using the asynchronous merge REST API'; L1804 HTTP 403; L1816 403 'Merging stacked PRs via this endpoint is not supported. Use the asynchronous merge endpoint instead.'

## Timeline
- L1797-L1798: `gh pr merge` refused.
- L1802-L1816: the REST merge refused twice with 403.
- L1819-L1821: WebFetch of the merge-async docs.
- L1825-L1827: `PUT .../merge-async` returns 202 and the PR merges.
- Cost: about 1.5 minutes and four extra calls, repeating a lookup already done in an earlier session.

## Root cause
GitHub's stacked PRs keep stack membership after a base retarget and block the classic merge paths; gh has no option for the async endpoint.

## Why agents fall for it
The PR shows `base=master` and `MERGEABLE/CLEAN`; nothing in `gh pr view` output says it belongs to a stack.

## Current state
not checked (GitHub behaviour).

## Suggested fix
- On 'part of a stack', confirm the lower PRs are merged, then `gh api -X PUT repos/{o}/{r}/pulls/{n}/merge-async -f merge_method=squash -f sha=<head>`.
- When moving a PR off a stack, remove it from the stack rather than only retargeting its base.

## Detection signal
`part of a stack and must be merged using the asynchronous merge REST API`; `Merging stacked PRs via this endpoint is not supported`.

## Raw excerpts
```
L1797 [CALL] Bash: gh pr merge 80083 -R metabase/metabase --squash --subject "<title> (#80083)" --body "" --match-head-commit e6df290082e984ffe61e10a89fc452d5d5b11098 && gh pr v
L1798 [RESULT (ERROR)] Exit code 1
    GraphQL: This pull request is part of a stack and must be merged using the asynchronous merge REST API. For more information, see https://docs.github.com/rest/pulls/pulls#merge-a-pull-request-asynchronously (mergePullRequest)
L1816 [RESULT] {"message":"Merging stacked PRs via this endpoint is not supported. Use the asynchronous merge endpoint instead.","documentation_url":"https://docs.github.com/rest/pulls/pulls#merge-a-pull-request-asynchronously","s
    OPEN base=master head=<branch>
L1827 [RESULT] HTTP/2.0 202 Accepted
    {"status":"pending","details":{"message":"Merge request enqueued.","uuid":"97abeccf-1089-491a-9ef8-40bf470a941c","merge_method":"squash","merge_action":"default","expected_head_sha":"e6df290082e984ffe61e10a89fc452d5d5b11098"}}
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/6bc1800e-c3b5-4388-9868-f321f7266cce.jsonl
  lines: 570-643
  date: 2026-09-14
  jev: {any_papercut: 0.79, env_toolchain: 0.25, stale_state: 0.40, verify_mismatch: 0.77, misleading_code: 0.17, hidden_coupling: 0.49, stale_docs: 0.23, tool_footgun: 0.77, flaky: 0.95, agent_bug: 0.26, wasted_effort: 0.32, user_correction: 0.08}

L575: GraphQL 'part of a stack and must be merged using the asynchronous merge REST API (mergePullRequest)'; L584: HTTP 403 'Merging stacked PRs via this endpoint is not supported'; L620: `{"status":"merged","details":{"message":"Pull request is already merged."...}}`.

- L573-L575: `gh pr merge` refused.
- L582-L584: REST merge 403.
- L603-L605: WebFetch of the merge-async docs.
- L618-L620: `merge-async` returns 'already merged'.
- L636-L643: both PRs show as merged.
- Cost: about 2 minutes and four calls, and the planned base retarget step was skipped.

```
L573 [CALL] Bash: gh pr merge <n> --repo <other-repo> --squash --subject "<title> (#<n>)" --body "" && sleep 3 && gh pr view <n> ... && gh pr edit <m> --repo <other-repo> --base main && ...
L575 [RESULT (ERROR)] Exit code 1
    GraphQL: This pull request is part of a stack and must be merged using the asynchronous merge REST API. For more information, see https://docs.github.com/rest/pulls/pulls#merge-a-pull-request-asynchronously (mergePullRequest)
L584 [RESULT] HTTP/2.0 403 Forbidden
    {"message":"Merging stacked PRs via this endpoint is not supported. Use the asynchronous merge endpoint instead.","documentation_url":"https://docs.github.com/rest/pulls/pulls#merge-a-pull-request-asynchronously","status":"403
L618 [CALL] Bash: gh api -X PUT repos/<other-repo>/pulls/<n>/merge-async -H "X-GitHub-Api-Version: 2026-03-10" -f merge_method=squash -f commit_title="<title> (#<n>)" -f commit_message="" -i ...
L620 [RESULT] HTTP/2.0 200 OK
    {"status":"merged","details":{"message":"Pull request is already merged.","sha":"<sha>"}}
L643 [RESULT] #<m> MERGED 2026-09-14T19:15:04Z
    #<n> MERGED 2026-09-14T19:14:17Z
```

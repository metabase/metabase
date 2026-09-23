---
title: "Validating data-stack terraform with the hashicorp/terraform Docker image: the entrypoint is terraform (so `sh -c` fails), 1.9 is below the modules' required_version, and init in the repo rewrites tracked lock files"
slug: terraform-docker-image-quirks
kind: env-friction
impact: wasted-time
severity: low
status: open
area: metabase/data-stack terraform/modules/* (versions.tf required_version >= 1.10, .terraform.lock.hcl tracked); local validation with Docker
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-data-stack/80fed4ae-938d-467a-bdb8-9082728a54de.jsonl
    lines: 1215-1285
    date: 2026-08-29
    jev: {self_inflicted_bug: 0.97, tool_misuse: 0.95, misleading_signal: 0.65, user_correction: 0.09, codebase_trap: 0.87, flailing: 0.44, env_friction: 0.89}
---
## Summary
There was no local terraform binary, so the agent validated its terraform changes with Docker. It
took five attempts:
1. `docker run hashicorp/terraform:1.9 sh -c '...'`. The image's entrypoint is `terraform`, so it ran `terraform sh -c ...` and printed `Terraform has no command named "sh"` and the help text. This looked like a validation result at a glance (L1218).
2. With `--entrypoint sh`, `terraform init` ran *in the repo mount*. It deleted or rewrote the tracked `terraform/modules/{observability,runtime}/.terraform.lock.hcl` (`git status`: ` D ...lock.hcl`), and validate failed with `no package for registry.terraform.io/hashicorp/aws 6.58.0 cached` (L1236). The agent restored the lock files with `git checkout` (L1250).
3. A copy to scratch with `-upgrade`: same provider error (L1255).
4. `rm -rf .terraform .terraform.lock.hcl` in the copy: `Unsupported Terraform Core version ... required_version = ">= 1.10"`; `terraform test` 0 passed, 2 failed (L1274).
5. `hashicorp/terraform:1.12` in a scratch copy: validate OK, `terraform test` 8 passed (L1285).

## Symptom
See Summary; key lines in Raw excerpts.

## Timeline
L1215 → L1218 → L1232/L1236 → L1250 → L1253/L1255 → L1263/L1274 → L1283 ("Terraform run used 1.9 but the module requires ≥ 1.10") → L1284/L1285 green.

## Root cause
The official image uses `ENTRYPOINT ["terraform"]`. The repo pins `required_version >= 1.10` and tracks
lock files. Running init against a bind mount of the working tree mutates it. None of this is written
down next to the modules for someone validating without a local install.

## Why agents fall for it
`docker run image sh -c` works for most images. Old image tags are the default choice. The error
output looks like help text, not a failure.

## Current state
Not checked in detail. data-stack CLAUDE.md was not searched for a terraform validation recipe during
this drill. Status unknown beyond the transcript.

## Suggested fix
A `mise run tf:validate` (or a script) that copies `terraform/` to a temp dir and runs
`docker run --rm --entrypoint sh -v ...:/tf hashicorp/terraform:<pinned ≥1.10> -c 'terraform init -backend=false && terraform validate && terraform test'`.

## Detection signal
`Terraform has no command named "sh"`; ` D terraform/**/.terraform.lock.hcl` in git status after a docker run; `Unsupported Terraform Core version`.

## Raw excerpts
```
L1218 [RESULT] == modules/secrets
To see all of Terraform's top-level commands, run:
  terraform -help
== runtime module tests
Terraform has no command named "sh". Did you mean "push"?
L1236 [RESULT] ... Error: registry.terraform.io/hashicorp/aws: there is no package for registry.terraform.io/hashicorp/aws 6.58.0 cached in .terraform/providers
 D terraform/modules/observability/.terraform.lock.hcl
 D terraform/modules/runtime/.terraform.lock.hcl
L1274 [RESULT] Error: Unsupported Terraform Core version
  on versions.tf line 2, in terraform:
   2:   required_version = ">= 1.10"
This configuration does not support Terraform version 1.9.8.
L1285 [RESULT] ... Success! 8 passed, 0 failed.
```

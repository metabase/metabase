---
name: name-module-cycle
description: Suggest a space-themed name for a cyclic cluster of backend modules when metabase.core.module-cycles-test reports a cluster without a name, usually after a split. Use when someone needs to name a module cycle or add a line to .clj-kondo/config/modules/cycle-clusters.edn.
allowed-tools: Read, Grep, Glob, Bash
---

# Name a module cycle

`.clj-kondo/config/modules/cycle-clusters.edn` maps each cyclic cluster of the module require graph to an anchor
module. When a change splits a cluster, the new half has no name, and the person who split it gets to choose one.
Help them choose; do not pick for them.

## 1. See the cluster

The test failure lists the cluster's modules and, for a small cluster, the requires between them that make it a
cycle. For the full picture, including teams, run:

```bash
clojure -X:dev dev.module-cycles/print-clusters
```

Unnamed clusters print first.

## 2. Split, or a new cycle?

Look at everything the branch changes, committed or not: `git diff $(git merge-base origin/master HEAD)`, plus new
files from `git ls-files --others --exclude-standard`.
If it removed requires and these modules were part of a named cluster on master, the cluster split: name the new
half. If it added a require between these modules, it created a new cycle: help break it instead, and stop here.

## 3. Learn what the cluster does

A module's namespaces are `metabase.<module>.*`, with dashes as underscores in the path, so `cloud-migration` lives
in `src/metabase/cloud_migration/`, and `enterprise/foo` in `enterprise/backend/src/metabase_enterprise/foo/`. Some
modules declare an `:ns-prefix` in `.clj-kondo/config/modules/config.edn` instead: `core.cmd` lives in
`src/metabase/cmd/`, and `mcp.oauth-server` in `src/metabase/oauth_server/`.

`core.clj` is often a bare facade. The `ns` docstrings of `api.clj`, `models/` and any `README.md` usually say more,
and so do the requires that close the cycle: they show what each module needs from the others.

## 4. Suggest names

Offer three to five names, each with one line on why it fits. A good name:

- comes from space: astronomy, spaceflight, or science fiction about space;
- has some link to what the cluster does, its role in the codebase, or how it came to be;
- is a lowercase kebab-case simple symbol, not already in the file;
- stays true as the cluster changes, so avoid sizes and counts (`binary-star` stops fitting when a third module joins).

The current names show the range:

| Name | Anchor | Why it fits |
|---|---|---|
| `galactic-center` | `query-processor` | The dense core everything orbits |
| `foundation` | `app-db` | The base layer, and Asimov's Foundation |
| `tardis` | `lib` | A plain box from the outside; internally complex, and it can take you places |
| `stargate` | `api-routes` | The gateway every request comes through |
| `first-contact` | `mcp` | The protocol outside agents use to talk to Metabase |
| `deep-thought` | `metabot` | The computer built to answer the big question |

The `<anchor>-knot` placeholder from the test failure is a valid fallback when nothing better comes up.

## 5. Pick the anchor

The anchor can be any module in the cluster, and the name follows it. Prefer one that is central and unlikely to
leave the cluster or be renamed. The test proposes the member with the most requires to and from the rest of the
cluster, ties broken alphabetically; in a small cluster everything often ties, and then the proposal carries no
signal.

## 6. Record it

Add `<name> <anchor>` to the map in `.clj-kondo/config/modules/cycle-clusters.edn`, keeping the entries sorted and
the anchors aligned one space past the longest name, then run:

```bash
./bin/test-agent :only '[metabase.core.module-cycles-test]'
```

Mention the new name in the PR, so reviewers see the split.

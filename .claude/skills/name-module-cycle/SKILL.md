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

The test failure lists the cluster's modules. For the full list, its teams and the clusters around it, run:

```bash
clojure -X:dev dev.module-cycles/print-clusters
```

Find out what the cluster does. Read the `ns` docstrings of its modules' main namespaces (`src/metabase/<module>/core.clj`
or `enterprise/backend/src/metabase_enterprise/<module>/`), and check whether it split off a named cluster: the
modules it shares a team or a prefix with usually tell you.

## 2. Suggest names

Offer three to five names, each with one line on why it fits. A good name:

- comes from space: astronomy, spaceflight, or science fiction about space;
- has some link to what the cluster does, its role in the codebase, or how it came to be;
- is a lowercase kebab-case simple symbol, not already in the file;
- stays true as the cluster changes, so avoid sizes and counts.

The current names show the range:

| Name | Anchor | Why it fits |
|---|---|---|
| `galactic-center` | `query-processor` | The dense core everything orbits |
| `foundation` | `app-db` | The base layer, and Asimov's Foundation |
| `rosetta` | `lib` | The query library, which translates legacy MBQL; also ESA's comet mission |
| `stargate` | `api-routes` | The gateway every request comes through |
| `first-contact` | `mcp` | The protocol outside agents use to talk to Metabase |

The `<anchor>-knot` placeholder from the test failure is a valid fallback when nothing better comes up.

## 3. Pick the anchor

The anchor can be any module in the cluster. Prefer one that is central to it and unlikely to move out or be
renamed, since the name follows the anchor. The test failure proposes the module with the most requires inside
the cluster, which is usually a good choice.

## 4. Record it

Add `<name> <anchor>` to the map in `.clj-kondo/config/modules/cycle-clusters.edn`, keeping the entries sorted
and aligned, then run:

```bash
./bin/test-agent :only '[metabase.core.module-cycles-test]'
```

Mention the new name in the PR, so reviewers see the split.

# Nested modules make the real dependency graph visible

## The pitch

Metabase's backend modules are too coarse to describe the architecture accurately. Most modules currently participate in one giant cyclic closure, but most namespaces do not. A cycle between two large modules can be caused by one namespace-level edge in each direction even when the rest of both modules are unrelated.

Making every namespace a module would expose the real graph, but the config and mental overhead would be unmanageable. Nested modules give Metabase the missing middle: finer dependency vertices with explicit organization, ownership, and encapsulation.

## What nesting adds

Each declared module owns the namespaces under its effective `:ns-prefix`. Resolution uses the longest matching prefix, so a child such as `lib.schema` can own `metabase.lib.schema.*` while `lib` continues to own the rest of `metabase.lib.*`. An explicit prefix can preserve an existing source layout during migration.

Nesting does not make dependency edges implicit. Every child declares its own exact `:uses`, and cross-module calls still go through the target's `:api`. This keeps the graph truthful: splitting a coarse module reveals edges rather than hiding them behind a parent.

Nested children are private to their top-level subtree by default. A parent's `:module-exports` controls whether outside modules may name a child. Exporting a child does not merge it into the parent or erase its graph vertex; it only makes the child an externally referenceable component.

A descendant may use its ancestor's internal namespaces when it declares the dependency. This models the child as part of the ancestor's implementation. The reverse direction remains strict: a parent consumes its child through the child's API.

## Why finer granularity changes SCCs

Suppose namespace `a.x` depends on `b.api`, while `b.y` depends on `a.api`. With coarse modules `a` and `b`, the module graph contains a cycle even if `a.x`, `a.api`, `b.y`, and `b.api` are otherwise independent.

Carving `a.x` or `b.y` into a coherent child can separate those edges into different vertices. The resulting graph may no longer contain a strongly connected component at that boundary. This is not a cosmetic reparenting: it is a more accurate partition of source ownership.

Nesting cannot remove a genuine namespace-level cycle. Those still need dependency inversion, events, protocols, data-only seams, or source movement. The SCC tooling on this branch distinguishes the two cases and ranks possible cuts.

## What the current carvings demonstrate

The `lib` subtree now separates schema, metadata, backend extensions, agent helpers, and source swapping. This gives each area an independent API and dependency set while reducing `lib` to one remaining friend edge.

REST packages are represented as `.rest` children instead of unrelated top-level `-rest` modules. This removes naming special cases and records the architectural relationship without granting sibling access.

Query processor cache backend and driver API code are independent children. Metabot's agent API and Slackbot integration are likewise represented as children with explicit boundaries.

EE companions retain the disjoint `metabase-enterprise.*` namespace and source root required for licensing and classpath isolation. When an OSS counterpart exists, the logical module hierarchy treats `enterprise/X` as its child without moving or renaming source.

## Ownership follows the tree

Nested modules inherit `:team` from the closest ancestor that declares one. A child declares `:team` only when ownership genuinely differs. Validation rejects a redundant child declaration, so ownership cannot silently drift through copy-pasted config.

Run:

```text
./bin/mage modules-expanded-config
```

The command prints effective teams, namespace prefixes, APIs, dependencies, friends, and exports. It expands `:uses :any` according to name visibility and expands `:api :any` from the namespaces found in source.

## Guardrails keep the graph moving in one direction

The config tests validate hierarchy, direct-child exports, prefix uniqueness, value types, team inheritance, and source-derived boundaries. Ratchets prevent increases in wildcard permissions, friend edges, exported children, and API surface without an explicit decision.

Run all module validation with:

```text
./bin/mage modules-validate
```

The Mage task delegates to the same test namespace used by CI, so local and CI semantics cannot drift.

## The strategic goal

Module count is not the success metric. The useful outcomes are:

- smaller strongly connected components;
- fewer namespaces reachable from an unrelated change;
- smaller affected-test closures;
- narrower APIs and fewer privileged internal access paths; and
- ownership boundaries that match cohesive source areas.

Nested modules make finer partitioning sustainable. The resulting graph measurements then show where real dependency inversion will pay off next.

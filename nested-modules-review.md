# Nested module system review

## Executive view

The branch establishes a coherent, enforceable nested-module model. Its strongest choices are longest-prefix ownership, exact per-module `:uses`, a separate namespace-level `:api`, and default-private child naming. Together these make the config describe real dependency edges without accidentally granting descendants whatever their parent can use.

I would merge the mechanism incrementally. Nesting does not erase dependency edges by itself: exported children remain independently named dependency vertices, and exact `:uses` preserves truthful edges. Its important graph benefit is different: it makes substantially finer module granularity manageable. Today's coarse modules turn any pair of namespace-level dependencies in opposite directions into a module-level cycle, even when most namespaces are not mutually reachable. Carving coherent children can therefore remove false coarse-grained cycles and reveal the real SCC structure without degenerating into an unmanageable one-module-per-namespace config. Remaining genuine cycles will still require dependency inversion and source-level seams.

## Semantics as implemented

A module has four distinct concerns:

1. **Ownership:** a namespace belongs to the declared module with the longest matching effective `:ns-prefix`.
2. **Dependency permission:** the resolved target must appear exactly in the caller's `:uses` (except `:any`). Parents do not lend dependencies to children.
3. **Namespace visibility:** ordinary cross-module access must use the target's `:api`, unless the target grants `:friends` access.
4. **Name visibility:** a nested module can be named outside its top-level subtree only when every parent in its chain exports it through `:module-exports`.

There is one structural trust rule: a descendant may access an ancestor's non-API namespaces, while the reverse direction still goes through the child's API. This is a defensible composite-module interpretation: a child is inside its parent, but the parent consumes the child as a component with its own contract.

`enterprise/X` is also treated as a child of declared OSS module `X` and is automatically exported. This is convenient for the EE loader, but it is an implicit policy exception rather than a consequence of the general dotted-name model.

## What is working well

- Longest-prefix matching is the right ownership algorithm. Segment-boundary matching avoids prefix accidents, and `:ns-prefix` lets the logical tree evolve without moving source files.
- Exact `:uses` is intentionally verbose but valuable. It keeps the graph truthful and prevents a parent from becoming an unbounded capability bundle for descendants.
- Separating `:module-exports` from `:api` is conceptually clean. One answers “may I refer to this component?” and the other “which namespaces may I call?”
- Default-private nested children make encapsulation opt-out rather than aspirational.
- The asymmetric descendant-to-ancestor trust rule is much safer than general family or sibling trust.
- The consistency and behavioral tests cover the three resolution environments, dotted test paths, explicit prefixes, visibility chains, and EE shorthand. That is important because clj-kondo, dev tooling, and Mage cannot currently share a runtime implementation.
- The config changes demonstrate concrete value: `lib.schema`, `lib.metadata`, `lib.be`, `lib.agent-lib`, query-processor children, and the REST children now have explicit ownership. The current config has 182 modules, 22 explicit prefixes, 22 exported-child entries, and only one remaining `:friends` entry.

## Concerns and feedback

### Semantics

The word “export” may suggest that callers depend on the parent's public face. They do not: an exported child is still named directly in `:uses` and remains a separate graph vertex. This should be explicit in user documentation and in any strategic pitch. The feature does not collapse dependency edges by itself; it provides the organization and encapsulation needed to split coarse vertices safely. That finer graph can absolutely shrink SCCs when the old cycle existed only because unrelated namespaces were bundled into the same modules.

Subtree trust creates a wide implicit internal surface from ancestor to descendant. That is probably the right default for practical adoption, but it means a parent cannot treat its internal namespaces as refactor-safe relative to its children. Metrics should therefore distinguish public API, friend-exposed internals, and descendant-privileged internals.

The `enterprise/X` auto-parent and auto-export behavior is useful but surprising. It makes declaration presence change hierarchy, and it bypasses explicit `:module-exports`. The disjoint `metabase-enterprise.*` namespace and filesystem convention should remain: it protects separate licensing and classpaths, avoids namespace collisions, and prevents a costly source move that would make backports painful. My suggested change is limited to making the _logical parent/export relation_ explicit in config, or documenting the expansion as a permanent compatibility rule; it is not a recommendation to rename EE namespaces or move EE files.

`:uses :any` and `:api :any` weaken the model disproportionately. The four `:uses :any` entries and one `:api :any` entry should be treated as migration debt with owners, not permanent ordinary values.

### Infrastructure

The resolution algorithm exists in three implementations. The branch adds useful behavioral tripwires, but comments and tests do not eliminate maintenance cost. A small dependency-free shared EDN/data library, generated resolver artifact, or common pure source file loaded into each environment would be preferable if classpath constraints can be solved. If duplication remains, behavioral fixture tests should remain the authority; source-regex comparison is a weaker secondary check.

The clj-kondo hook builds a prefix map and linearly scans its keys for each resolution. With roughly 182 modules this is acceptable today, but linting resolves many requires. The next worthwhile performance change would be to build a resolver once per config (for example, prefixes ordered by descending segment count) and reuse it across hook calls. I would only do this with a benchmark because cache invalidation and hook lifecycle complexity can cost more than the scan saves.

Config validity is enforced partly through repository tests rather than when the hook consumes config. This branch now validates unique prefixes, declared parents, direct-child-only exports, exported-child declarations, boundary value types, inherited team ownership, and non-degenerate team overrides. The remaining architectural opportunity is to expose one structured validator to CI, Mage, metrics, and local tooling instead of leaving validation embedded in tests.

The new metrics and SCC tooling are useful, but they are a separate concern from enforcement. Keeping their APIs and commits separable would make the core mechanism easier to review and backport. Generated CSV snapshots should have a documented regeneration command and a clear decision about whether they are durable baselines or disposable analysis artifacts.

### Module config

The `lib` carving is the strongest part of the config change. Schema and metadata have recognizable cohesion and meaningful APIs. Reducing `lib` to one `:friends` edge is a concrete improvement.

The REST conversions mostly formalize an existing architectural relationship. Because those children are exported, the immediate gain is ownership and removal of special cases, not encapsulation from outside callers. A follow-up should inspect external callers and decide which REST children actually need export.

Some child APIs remain large, especially `lib.schema`. Moving a long API list from the parent to a child improves attribution but does not reduce the callable surface. Track API size and external use at the child level and consolidate facade namespaces where it improves comprehension.

Explicit `:ns-prefix` is an effective bridge between logical module structure and physical namespace structure. Prefer aligned names for new OSS modules where there is no competing constraint, but treat EE as a deliberate exception: its disjoint prefix and source root support licensing and classpath isolation and should not be “cleaned up” through code movement. Overrides are also reasonable for stable legacy packages when a move would create disproportionate backport or merge cost.

Empty APIs are meaningfully different from omitted APIs because omission supplies `.api`, `.core`, and `.init` defaults. That distinction is easy to miss during review. A schema or comment convention should make deliberate `:api #{}` entries obvious.

Team ownership should follow the module tree. A child inherits the closest ancestor's `:team` unless the child declares a real override; repeating the inherited team is invalid. `dev.deps-graph/expanded-kondo-config` makes the effective ownership and other inferred values visible from the REPL. Run `clojure -X:dev dev.deps-graph/print-expanded-kondo-config` for stable, fully expanded EDN, including source-aware expansion of `:api :any` and name-visibility-aware expansion of `:uses :any`.

Run `./bin/mage modules-validate` for the complete config validation locally. The Mage task delegates to the authoritative module test namespace, so local and CI validation can't drift into separate implementations.

## What I would do differently

At a high level:

1. Define nesting as **ownership, name visibility, and an enabler of finer graph granularity**. Measure whether each carve removes coarse-grained false cycles; do not infer that merely reparenting a vertex removes edges.
2. Make exceptional hierarchy explicit. Replace the implicit EE shorthand eventually with declarative parentage or a generated config expansion while retaining the disjoint EE namespace, directory, licence, and classpath boundary.
3. Centralize resolver behavior or generate the three adapters from one fixture/specification. Keep end-to-end behavior tests across all environments.
4. Add a first-class config validator with actionable errors and use it in CI, Mage, metrics, and local lint setup.
5. Budget wildcard permissions and exported children. Record counts over time and require justification for increases.
6. Optimize the graph strategically around SCC cuts, not raw module count. Prioritize seams that remove back-edges from high-churn or high-fan-out modules: event publication, narrow protocols, data-only DTO namespaces, and dependency inversion around app-db/settings/util-style chokepoints.
7. Use nested modules to reveal coherent extraction candidates, then make source-level changes that turn those candidates into leaves or upstream foundations. The desired outcome is smaller SCCs and smaller change-triggered test closures, not merely a prettier taxonomy.

## Suggested rollout gates

- Resolution agrees in clj-kondo, dev graph tooling, and Mage for every declared prefix and representative source/test paths.
- Every effective prefix is unique and every export is a declared direct child.
- No new `:uses :any`, `:api :any`, or `:friends` without an owner and rationale.
- Each carving reports before/after API surface, privileged internal access, SCC membership, and affected-test closure.
- Exported children are reviewed after migration; exports that have no outside callers are removed.
- Generated metrics have a reproducible command and are compared against a named baseline.

The central strategic recommendation is to keep this system strict and modest: use it to make ownership and contracts truthful, then use the resulting measurements to guide the harder dependency inversions that actually simplify the graph.

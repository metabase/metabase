# Metabase Clojure Style Guide

This guide covers Clojure and ClojureScript coding conventions for Metabase. See also: `CLOJURE_STYLE_GUIDE.adoc` for the Community Clojure Style Guide.

## Naming Conventions

**General Naming:**

- Acceptable abbreviations: `acc`, `i`, `pred`, `coll`, `n`, `s`, `k`, `f`
- Use `kebab-case` for all variables, functions, and constants

**Function Naming:**

- Pure functions should be nouns describing the value they return (e.g., `age` not `calculate-age` or `get-age`)
- Functions with side effects must end with `!`
- Don't repeat namespace alias in function names

**Destructuring:**

- Map destructuring should use kebab-case local bindings even if the map uses `snake_case` keys

## Documentation Standards

**Docstrings:**

- Every public var in `src` or `enterprise/backend/src` must have docstring
- Format using Markdown conventions
- Reference other vars with `[[other-var]]` not backticks

**Comments:**

- `TODO` format: `;; TODO (Name YYYY-MM-DD) -- description`

## Code Organization

**Visibility:**

- Make everything `^:private` unless it is used elsewhere
- Try to organize namespaces to avoid `declare` (put public functions near the end)

**Size and Structure:**

- Break up functions > 20 lines
- Lines ≤ 120 characters
- No blank non-comment lines within definition forms (except pairwise `let`/`cond`)

**Java interop: type-hint parameters in the arglist; prefer `ex-*` helpers:**

```clojure
;; bad — reflection warning, calls Throwable methods directly
(defn root-cause [e]
  (if-let [cause (.getCause e)] (recur cause) e))

;; good
(defn- root-cause [^Throwable e]
  (if-let [cause (ex-cause e)]
    (recur cause)
    e))
```

Use `ex-cause`/`ex-message`/`ex-data`/`ex-info` rather than `.getCause`/`.getMessage`/`(.getData ^ExceptionInfo …)` where possible.

## Style Conventions

**Keywords and Metadata:**

- Prefer namespaced keywords for internal use: `:query-type/normal` not `:normal`
- Tag variables with `:arglists` metadata if they're functions but wouldn't otherwise have it

**Time/date: `java-time.api :as t` and `u.date`, not `java.time.*` direct interop:**

```clojure
;; bad — Claude default, requires java.time interop
(:import (java.time LocalDate))
... (LocalDate/now) ...

;; good
(:require
 [java-time.api :as t]
 [metabase.util.date-2 :as u.date])
... (t/local-date) ...
... (u.date/parse "2024-01-01") ...
```

Only `(:import java.time.X)` when interop with a Java method genuinely needs the class.

**Check non-emptiness with `seq`, not `count`:**

```clojure
;; bad — `count` realizes the whole seq into memory just to test emptiness
(let [prompts (map build-prompt items)]
  (when (pos? (count prompts))
    (t2/insert! :model/Prompt prompts)))

;; good — `seq` realizes one cell; `insert!` streams the rest
(let [prompts (map build-prompt items)]
  (when (seq prompts)
    (t2/insert! :model/Prompt prompts)))
```

## Tests

**Organization:**

- Break large tests into separate `deftest` forms for logically separate test cases
- Test names should end in `-test` or `-test-<number>`

**Performance:**

- Mark pure function tests `^:parallel`

**Redefining `defn`-vars under test:**

Use `mt/with-dynamic-fn-redefs` instead of `with-redefs` when stubbing `defn`/`defn-` vars — plain `with-redefs` is not parallel-test-safe and a clj-kondo hook (`:metabase/prefer-with-dynamic-fn-redefs`, see `.clj-kondo/config.edn`) will warn. `with-redefs` is still fine for `def` / dynamic var rebinding.

```clojure
;; bad — flagged by the linter, not safe under :parallel tests
(with-redefs [my.ns/some-fn (fn [_] :stub)] (do-test))

;; good
(mt/with-dynamic-fn-redefs [my.ns/some-fn (fn [_] :stub)] (do-test))
```

**Async tests: no bare `Thread/sleep` — use `deref` with a timeout sentinel:**

A fixed sleep is the #1 source of CI flake. Tests should fail fast and loud when a contract is violated, not hang or sleep through the bug.

```clojure
;; bad — flaky on slow CI, silent on actual failure
(Thread/sleep 300)
(is (= :expected @seen))

;; good — fails fast with a clear message
(let [v (deref some-promise 1000 ::timeout)]
  (is (not= ::timeout v) "promise never delivered")
  (is (= :expected v)))
```

## Modules

**OSS Modules:**

- Follow `metabase.<module>.*` pattern
- Source in `src/metabase/<module>/`

**Enterprise Modules:**

- Follow `metabase-enterprise.<module>.*` pattern
- Source in `enterprise/backend/src/metabase_enterprise/<module>/`

**Module Structure:**

- REST API endpoints go in `<module>.api` or `<module>.api.*` namespaces
- Put module public API in `<module>.core` using Potemkin imports
- Put Toucan models in `<module>.models.*`
- Put settings in `<module>.settings`
- Put schemas in `<module>.schema`

**Module Linters:**

- Do not cheat module linters with `:clj-kondo/ignore [:metabase/modules]`

**Enterprise/OSS split: use `defenterprise`, not protocols or runtime feature checks:**

The OSS namespace defines the fallback body and names the EE namespace; the EE namespace overrides with the same fn name and a `:feature` clause naming the premium-features flag that gates the override. Both files use the same docstring shape — describe behavior on both sides.

```clojure
;; src/metabase/remote_sync/core.clj  (OSS)
(defenterprise collection-editable?
  "Returns whether remote-synced collections are editable.
   Always true on OSS; EE consults the remote-sync settings."
  metabase-enterprise.remote-sync.core
  [_collection]
  true)

;; enterprise/backend/src/metabase_enterprise/remote_sync/core.clj  (EE)
(defenterprise collection-editable?
  "EE override — respects the synced-collections-editable? setting."
  :feature :remote-sync
  [collection]
  (or (synced-collections-editable?) (not (synced? collection))))
```

`defenterprise-schema` is the malli-schema variant. Required from `[metabase.premium-features.core :refer [defenterprise defenterprise-schema]]`. The OSS body is what runs when the feature flag is off — never write `(when (premium/has-feature? ...) ...)` in user code; let `defenterprise` route.

**Security gates fail *open* under `:feature` — use `:feature :none` and check manually.** The router (`dynamic-ee-oss-fn`) calls the EE body only when both the EE namespace is loaded *and* the token currently grants the feature; otherwise it falls back to the OSS body. For a permissive default (`collection-editable?` → `true`) that's fine. But for a *restriction* — sandboxing, impersonation, row-level filtering — the OSS fallback is the unrestricted answer, so a temporarily lost/expired token silently downgrades a sandboxed user to full access. **Fail open.** When the EE override is what *decides whether to restrict*, gate it with `:feature :none` (which always routes to the EE body once EE code is loaded) and check the feature explicitly inside, so token loss fails *closed*:

```clojure
;; enterprise/.../sandbox/api/util.clj — the gate that detects whether a user is sandboxed
(defenterprise enforced-sandboxes-for-user
  "..."
  ;; :none so we can decide whether sandboxing is *configured* even when the feature
  ;; isn't currently available — letting us BLOCK requests that would otherwise be
  ;; sandboxed, instead of returning the permissive OSS fallback. Fail closed.
  :feature :none
  [user-id]
  ...)
```

Reach for this only for the detection/enforcement decision point. Downstream functions that merely *act* on an already-made decision can keep their normal `:feature :sandboxes` gate.

## REST API Endpoints

**Required Elements:**

- All new endpoints must have response schemas (`:- <schema>` after route string)
- All endpoints need Malli schemas for parameters (detailed and complete)
- All new REST API endpoints MUST HAVE TESTS

**Endpoint shape: `api.macros/defendpoint`, four positional arglist:**

```clojure
(api.macros/defendpoint :get "/:key/callback"
  "OIDC callback for a specific provider."
  [{provider-key :key} :- [:map [:key ProviderKey]]
   _query-params
   _body
   request]
  (oidc-integration/sso-callback provider-key request))
```

The arglist is **always 4 positional bindings** in this order: `route-params`, `query-params`, `body`, `request`. Use `_`-prefixed names for unused ones. Each one gets a Malli schema via `:- <schema>` (omit when `_`). The HTTP verb is a keyword (`:get`/`:post`/`:put`/`:delete`), not a symbol. Required as `[metabase.api.macros :as api.macros]`.

**Naming Conventions:**

- Query parameters use kebab-case
- Request bodies use `snake_case`
- Routes use singular nouns (e.g., `/api/dashboard/:id`)

**Behavior:**

- `GET` endpoints should not have side effects (except analytics)
- `defendpoint` forms should be small wrappers around Toucan model code

**Closed response maps:**

Tag response Malli `:map` schemas with `{:closed true}` so the generated OpenAPI / TypeScript types reject extra keys. Open maps emit `additionalProperties: true`, which produces weak frontend types and makes discriminated unions ineffective. Tighten domain types in the same pass (`pos-int?` rather than `:int` when zero branches elsewhere).

```clojure
;; weak
{:status 200 :body [:map [:status [:= :generated]] [:prompt_count :int]]}

;; tight
{:status 200 :body [:map {:closed true}
                    [:status [:= :generated]]
                    [:prompt_count pos-int?]]}
```

## MBQL (Metabase Query Language)

**Restrictions:**

- No raw MBQL introspection outside of `lib`, `lib-be`, or `query-processor` modules
- Use Lib and MBQL 5 in new source code; avoid legacy MBQL

## Database and Models

**Naming:**

- Model names and table names should be singular nouns
- Application database uses `snake_case` identifiers

**Best Practices:**

- Use `t2/select-one-fn` instead of fetching entire rows for one column
- Put correct behavior in Toucan methods, not separate helper functions

## Drivers

**Documentation:**

- New driver multimethods must be mentioned in `docs/developers-guide/driver-changelog.md`

**Implementation:**

- Driver implementations should pass `driver` argument to other driver multimethods
- Don't hardcode driver names in implementations
- Minimize logic inside `read-column-thunk` in JDBC-based drivers

## Miscellaneous

**Examples:**

- Example data should be bird-themed if possible

**Linter Suppressions:**

The right shape is a **reader-discard map** placed directly above the form being silenced, listing the rule keywords explicitly:

```clojure
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/api_key" ...)
```

For a single require entry, hang it as metadata on that entry:

```clojure
(:require
 ^{:clj-kondo/ignore [:deprecated-namespace :discouraged-namespace]}
 [metabase.query-processor.store :as qp.store])
```

Common Metabase-specific rules you'll see: `:metabase/modules`, `:metabase/validate-defendpoint-route-uses-kebab-case`, `:metabase/validate-defendpoint-has-response-schema`, `:metabase/prefer-with-dynamic-fn-redefs`, `:deprecated-namespace`, `:discouraged-namespace`. Don't use the keyword form (`#_:clj-kondo/ignore`); always the map form so it's grep-able by which rule(s) are suppressed.

**Configurable Options:**

- Don't define configurable options that can only be set with environment variables
- Use `:internal` `defsetting` instead


## Metabase Helpers — Quick Reference

Metabase and its libraries have **many** helper functions to make code more readable. Don't hand-roll things that already exist! Reach for the right helper *the first time*.

Organized by **problem you're solving**, not by namespace.

## "I wrote this — use that instead" cheat sheet

*Authors: prefer the right column. Reviewers: flag the left column in PRs.*

| You wrote                                                            | Reach for                            | When NOT to                                                       |
| -------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------- |
| `(vec (keep f xs))`                                                  | `(u/keepv f xs)`                     | —                                                                 |
| `(let [x (...)] (side-effect!) x)`                                   | `(u/prog1 (...) (side-effect!))`     | — (`<>` anaphor binds the result)                                 |
| `(into {} (map (juxt k identity)) xs)`                               | `(u/index-by k xs)`                  | —                                                                 |
| `(into {} (map (juxt k vf)) xs)`                                     | `(u/index-by k vf xs)`               | —                                                                 |
| `#(compare %2 %1)`                                                   | `u/reverse-compare`                  | —                                                                 |
| `(:col (t2/select-one [Model :col] …))`                              | `(t2/select-one-fn :col Model …)`    | —                                                                 |
| `(or (:k m) default)`                                                | `(:k m default)`                     | **The value can be present-but-nil** (hydrated DB null, etc.)     |
| `(let [x (...)] (if x then else))`                                   | `(if-let [x (...)] then else)`       | —                                                                 |
| `(filter #(= :a (:type %)) coll)` + same for `:b` …                  | `(group-by :type coll)` then dispatch | —                                                                 |
| `(->> xs (map f) (remove g) (mapv h))`                               | `(into [] (comp (map f) (remove g) (map h)) xs)` | when readability of the threading wins                  |
| nested `let` / `if` / `if-let`                                       | `b/cond` with `:let`                 | a 2-level nest may be clearer as-is                               |
| `(let [{:keys [k]} arg] …)` as first form of body                    | destructure in the arg list           | when the destructure also references something computed in `let` |
| `(or (:k m) (get m (name k)))` per field                             | normalize once: `(update-keys m keyword)` then plain `:k` | when you genuinely need both shapes per-field             |

## `metabase.util` (commonly aliased `[metabase.util :as u]`)

Sequences / collections:
- `(u/keepv f coll)` — like `keep` but returns a vector (eager).
- `(u/index-by kf coll)` / `(u/index-by kf vf coll)` — `{(kf x) (vf x)}` map.

Strings (locale-safe):
- `(u/lower-case-en s)`, `(u/upper-case-en s)` — DO use these instead of `clojure.string/lower-case`/`upper-case` whenever the result feeds into matching/comparison; the locale-default versions break on Turkish `i`.
- `(u/qualified-name x)` — keyword → `"ns/name"` or `"name"`; symbol → `(name x)`; string → identity.

Control flow:
- `(u/prog1 first-form & body)` — anaphoric. Result of `first-form` is bound to `<>`. Returns first-form's value. Use for "do a thing, side-effect using its result, return the thing."
- `(u/the-id x)` — get an entity id from an int or an instance.

Comparators:
- `(u/reverse-compare x y)` — `(compare y x)`. Pass as a sort comparator: `(sort-by f u/reverse-compare coll)`.

Other:
- `(u/conflicting-keys m1 m2)` — keys present in both with different values.

The full `metabase.util.cljc` is ~1300 lines — when in doubt, grep it.

## `metabase.util.namespaces` (aliased `shared.ns`)

- `(shared.ns/import-fns [other-ns f1 f2] [another-ns f3])` — re-export defns from another ns through the current ns. The `:require [other-ns :as other-ns]` alias **must stay** — clj-kondo may flag it as unused but it's needed at macro expansion. Add a `;; needed for import-fns` comment so it doesn't get auto-stripped.

## Toucan 2 (aliased `[toucan2.core :as t2]`)

Single-field reads (avoids fetching whole rows):
- `(t2/select-one-fn :col Model :id 123)` — projection-friendly: when `f` is a keyword, only that column is fetched. Use instead of `(:col (t2/select-one [Model :col] …))`.
- `(t2/select-fn-set f Model & conditions)` — set of `(f row)` values.
- `(t2/select-fn-vec f Model & conditions)` — vector of `(f row)` values.
- `(t2/select-pks-set Model & conditions)` — set of PKs.

Existence / counts:
- `(t2/exists? Model & conditions)` → boolean.
- `(t2/count Model & conditions)` → long.

Writes:
- `(t2/insert-returning-instances! Model row-or-rows)` — returns the rows with PKs set.
- `(t2/insert-returning-pks! Model row-or-rows)` — just the PKs.
- `(t2/update! Model id-or-conditions changes)`.
- `(t2/delete! Model id-or-conditions)`.

Transactions:
- `(t2/with-transaction [t-conn] body…)` — opens a txn on the app DB conn.

Hydration:
- `(t2/hydrate instances :key1 :key2)` — invokes `:batched-hydrate` methods.
- Define via `(methodical/defmethod t2/batched-hydrate [:model/Foo :the-key] [_ k rows] …)`.

Define a model:
- `(methodical/defmethod t2/table-name :model/Foo [_] :foo_table)`
- `(t2/deftransforms :model/Foo {:col mi/transform-json})` — common: `transform-json`, `transform-secret-value` (encrypts), `transform-keyword`.

## Better-cond (`[better-cond.core :as b]`)

`(b/cond …)` like `cond` but supports interleaved `:let [bindings]` and `:when` clauses. Lets you flatten cascading `let`/`if`/`if-let`/`let` into a linear spine.

```clojure
(b/cond
  :let [thread (load-thread id)]
  (nil? thread) :not-found

  :let [exploration (load-exploration (:exploration-id thread))
        reason      (gate-check exploration)]
  reason
  (skip! reason)

  :let [pool (build-pool thread)]
  (empty? pool) :skip-no-data

  :else
  (run! thread pool))
```

Use it when a function would otherwise be a staircase of nested forms. Don't reach for it for a single `if`/`let`.

## Schemas — `mr/def` for shared, inline for single-use

When a schema is used in 2+ places or has a name worth documenting, extract it into the registry via `mr/def`:

```clojure
(:require [metabase.util.malli.registry :as mr])

(mr/def ::options
  "Options for Pulse channel rendering."
  [:map
   [:channel.render/include-buttons? {:description "default: false" :optional true} :boolean]])
```

`mr/def` keys are always `::namespaced` keywords; downstream callers reference via the fully-qualified keyword. Single-use schemas stay inline in the `mu/defn`'s `:-` annotation — no need to extract.

## Malli — `metabase.util.malli`

- `(mu/defn my-fn :- :string [x :- :int, y :- [:maybe :string]] …)` — inline schemas; runtime validation in dev, no-op in prod by default.
- `(mu/disable-enforcement & body)` — wrap test/perf-sensitive blocks.
- Common malli schemas: `:int`, `:string`, `:boolean`, `:keyword`, `:map`, `[:maybe T]`, `[:sequential T]`, `[:enum :a :b]`, `[:map [:k T]]`, `pos-int?`, `nat-int?`.

## i18n — `[metabase.util.i18n :refer [tru deferred-tru]]`

- `(tru "Hello {0}" name)` — translate at call time. Use in request-handling code.
- `(deferred-tru "…")` — translate at read time. Use in static contexts: `defsetting :description`, `defn` metadata `:description`, top-level `def`s of user-visible labels.
- ICU MessageFormat: doubled apostrophe for a literal: `(tru "it''s ready")`. Numbered placeholders: `{0}`, `{1}`.
- **Don't translate** developer-only debug strings (REPL helper text, internal logs).

## Logging — `[metabase.util.log :as log]`

- Levels: `trace`, `debug`, `info`, `warn`, `error`.
- Two flavors per level:
    - `(log/warn "msg")` or `(log/warn e "msg")` — exception first if present.
    - `(log/warnf "fmt %s" arg)` or `(log/warnf e "fmt %s" arg)` — printf-style.
- Don't `(log/warn (format "fmt %s" arg))` — use `warnf`.

## Map / key normalization

When parsing loosely-typed external data (LLM JSON, request bodies) that may have **either** string or keyword keys:

- `(update-keys m keyword)` — top-level keys → keywords (Clojure 1.11+, in `clojure.core`).
- `(clojure.walk/keywordize-keys m)` — recursive (use sparingly; can over-keywordize value strings if they happen to be in nested maps).
- After normalizing once, downstream code uses plain `(:k m)` — don't write `(or (:k m) (get m (name k)))` at every use site.

Other useful map ops:
- `(update-vals m f)` — Clojure 1.11+, in `clojure.core`.
- `(medley.core/map-vals f m)`, `(m/map-keys f m)` — older alternatives. Medley pinned at **1.4** in this repo — `m/index-of` and some other newer fns are NOT available.

## Comparators & sorting

- `(sort-by f u/reverse-compare coll)` — descending.
- Vector comparator: `(sort-by (juxt :primary :secondary) coll)`.
- Use `(- x)` on a primary numeric key to invert: `(sort-by (juxt #(- (:score %)) :id) coll)` (handles ties on ascending `:id`).

## Anti-patterns to avoid

- **`(let [x (do-thing!)] (other-thing! x) x)`** — use `u/prog1`.
- **`(vec (keep …))`, `(vec (map …))`** — use `u/keepv` or a transducer `(into [] (comp …) coll)`.
- **Multiple `filter` passes over the same coll for different `:type`s** — one `(group-by :type coll)`.
- **Per-field string/keyword dual-lookup** — normalize once with `update-keys keyword`.
- **Reaching into another module's tables via raw `:left-join` SQL** — expose a function on the owning model namespace and call that.
- **Snake-case keys on a massaged in-memory map** — appdb-row only. Convert at the parse boundary (e.g., when a json response becomes an internal record).
- **`(double (:k m 0.0))` on a hydrated DB column** — present-but-nil NPEs. Use `(double (or (:k m) 0.0))`.
- **`defmulti` with every impl on one page** — extension story is a fiction. Use a private lookup map + a private fn.
- **`(pos? (count xs))` to test a lazy `xs` for non-emptiness** — `count` forces the whole seq into memory. Use `(seq xs)`. (Rebuilding the seq — `(map f xs)` twice — is the only thing that recomputes; a bound seq caches.)
- **Plain `with-redefs` on a `defn` var in a test** — not parallel-safe; the kondo hook will warn. Use `mt/with-dynamic-fn-redefs`.
- **`(Thread/sleep N)` in an async test** — flake source #1. `(deref p timeout-ms ::timeout)` and assert `not= ::timeout`.
- **Hand-rolled `(str/split host #":")` for origin/host comparison** — mis-handles IPv6. Use `mw.security/parse-url` (or `try-parse-url` for client-controlled input).
- **`(subs (pr-str huge) 0 N)` on a log path** — the multi-MB string is already allocated. Bind `*print-length*`/`*print-level*` around `pr-str` instead.
- **New retry loop / new "find this column" helper / new transform-source-type predicate** — search first. `metabase.util.retry/with-retry`, `metabase.lib.equality/find-matching-column`, and `metabase.transforms.feature-gating/any-transforms-enabled?` already exist (along with many others). Reviewers ask "isn't there already an X for this?" more than any single idiom.
- **Plain `defn` when the function has any real contract** — `mu/defn` (or `mu/defn-`) with `:- schema` on the return and each param is the house default; reserve plain `defn` for trivial dev/helper code.
- **`(:import (java.time …))` + `(LocalDate/now)`** in new code — use `[java-time.api :as t]` + `[metabase.util.date-2 :as u.date]`. Direct `java.time` interop only when a Java API genuinely needs the class.
- **Vanilla `defmethod`** — use `methodical/defmethod` (it takes a docstring; the codebase uses it uniformly).
- **`(when (premium/has-feature? :flag) …)` in code** — gate via `defenterprise` so OSS/EE bodies live in their respective namespaces; never sprinkle runtime feature checks.
- **No `(set! *warn-on-reflection* true)` after the `ns` form** in a new `.clj` file — every `.clj` source file in this repo has it (not `.cljc`).
- **`(ns … (:require [a :as a] [b :as b]))` on one line; `(:import java.io.File java.net.URI)` bare** — both wrong shapes. Requires one per line under `:require`, imports as `(Package Class)` lists.
- **Inventing a fresh `:as` alias for `metabase.util`, `metabase.util.malli`, `metabase.util.log`, `java-time.api`, etc.** — use the canonical alias (see the table in Style Conventions). Mixing aliases makes `grep`-based discovery worse.

## When in doubt

- Run `grep -n "defn " src/metabase/util.cljc | head -80` to scan helpers.
- Run `grep -rn "defmacro\|defn-? [a-z-]*\?\b" src/metabase/util.cljc | head` for predicates.
- Check `medley.core/` if it looks "collection-y" — but **Medley is pinned at 1.4** here; new fns aren't available.
- Search the codebase for an existing use of the pattern you're about to write — if no one else does it, there's usually a helper.

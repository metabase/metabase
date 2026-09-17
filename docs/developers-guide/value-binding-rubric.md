# Value binding: the rubric

Convert one `db.clj` so the values it passes to the app DB bind as SQL parameters rather than
compiling into the statement text. One namespace per branch, one PR.

**Every choice below is decided.** Where a rule says "leave it", leaving it is the finished state,
not a deferral. If a site does not fit a rule, that is a finding to record, not a puzzle to force.

**Supersedes** the earlier playbook and the first rubric. Both told you to rewrite kv-arg calls as
query maps; that advice is withdrawn. See [Call style](#call-style-do-not-convert).

## The problem

HoneySQL resolves a map in a value slot toward SQL *structure*, not data. A value that arrives from
a request and happens to be a map becomes part of the statement:

```clojure
{:where [:= :id {:raw "(SELECT password FROM core_user)"}]}
;; => WHERE id = ((SELECT password FROM core_user))     <- executed
```

A plain string was never the danger; HoneySQL binds those. The danger is a value that is not a
string.

## The marker

`[:auto/param v]` forces `v` to bind as a parameter:

```clojure
(t2/select :model/ContentTranslation {:where [:= :locale [:auto/param locale]]})
;; => ["SELECT * FROM content_translation WHERE locale = ?"  "de"]

(t2/select :model/ContentTranslation {:where [:= :locale locale]})
;; => ["SELECT * FROM content_translation WHERE locale = de"]
```

It is ours, not Toucan's or HoneySQL's — `metabase.app-db.value-guard`, merged in
[#82373](https://github.com/metabase/metabase/pull/82373). The name is `:auto/param` rather than
`:param` so it greps cleanly.

The lint that keeps a converted namespace converted is `:metabase/unsafe-app-db-query`. A namespace
opts in by an entry in `:config-in-ns` in `.clj-kondo/config.edn`:

```clojure
metabase.search.db
{:linters {:metabase/unsafe-app-db-query {:level :warning}}}
```

Namespace names use dashes. Enterprise modules are `metabase-enterprise.<module>.db`.

---

## The rubric

For each value the lint flags, in order. The first rule that matches wins.

### 1. Written rather than filtered on -> leave it

An `insert!` row value, or the changes map of an `update!`.

```clojure
;; settings/db.clj -- left alone
(t2/insert-returning-instances! :model/Setting :key setting-key :value value)

;; search/db.clj -- the changes map is bare
(t2/update! :model/SearchIndexMetadata
            {:engine engine :status :active}   ; conditions
            {:status :retired})                ; changes -- never marked
```

Nothing here becomes SQL structure: it is not a where-clause value. A `define-before-insert` hook
may also read it before the query compiles — `:model/Setting` encrypts `:value` that way — so a
marker breaks the write. The lint no longer flags these.

The same is true from the other direction: a marker inside an `update!` changes map is eaten by the
column transform before compile. `[:lift "huh"]` on a `:json` column is stored as the string
`"[\"lift\",\"huh\"]"`, the marker destroyed.

### 2. A column rather than a value -> leave it

A join ON condition compares two columns, and so does `[:= :a.id :b.id]`.

```clojure
;; dependencies/db.clj -- `id-field` holds a column, not a value
:left-join [:dependency_status [:and
                                [:= :dependency_status.entity_id id-field]
                                ...]]
```

Binding a column reference emits the generated key as an identifier and drops the comparison. The
lint still flags some of these; it cannot tell the difference. Record it and move on.

### 3. A literal -> leave it

A string, number, or keyword written in the source.

```clojure
;; correct
[:= :status "pending"]
[:= :active true]

;; wrong -- do not do this
[:= :status [:auto/param "pending"]]
```

A literal cannot carry a request value, so there is nothing to bind away. Marking one also dilutes
the marker: its job is to say *this value came from outside*, and a reader scanning for markers
should find exactly the sites worth auditing. In step 2 a marked literal becomes a HugSQL hole every
caller must fill with the same constant — a fake parameter.

The lint already implements this rule: `lint-unmarked-values!` only reports symbols.

### 4. An id -> coerce it

```clojure
(long id)                 ; one
(mapv long ids)           ; a collection
(some-> id long)          ; one that may be nil
```

`long` throws on anything that is not a number, so the value is provably numeric by the time it
reaches a value slot. Use `mapv`, not `map`, so a bad element throws at the call site rather than
part way through the query.

Use `some->` when the parameter's schema admits nil (`[:maybe ::lib.schema.id/user]`), or when the
call site guards with `when`. `long` throws on nil, and a nil id usually means `IS NULL` rather than
an error:

```clojure
(mu/defn user-permissions
  [user-id :- [:maybe ::lib.schema.id/user]]
  (t2/select :model/DataPermissions :user_id (some-> user-id long)))
;; nil -> IS NULL      5 -> = ?  [5]
```

### 5. A collection that can be empty -> leave it unmarked

```clojure
;; `perm-types` may be empty -- left unmarked deliberately
(t2/select :model/DataPermissions
           {:where [:and [:= :db_id (long database-id)]
                    [:in :perm_type perm-types]]})
```

Toucan rewrites `[:in col []]` to `false`, because `IN ()` is invalid SQL, and that rewrite runs
inside the compile step the marker wraps. A marked empty collection hides the rewrite and leaves
`IN ()`, which Postgres rejects and H2 quietly accepts.

The guard refuses this rather than guessing, so you will see it as a thrown
`::marked-empty-collection`, not a silent bug. If a collection is provably non-empty (a literal, or
guarded by `(seq ...)`), marking it is fine.

### 6. Already constrained by the schema -> coerce anyway if it is an id

The enclosing `mu/defn` types it `ms/PositiveInt`, `::lib.schema.id/card`, or a closed `:enum`. A
validated integer cannot become SQL either way, so the coercion is for the lint's benefit rather
than the query's — but apply it, so the namespace reaches zero findings.

```clojure
(mu/defn glossary-entry
  [id :- ms/PositiveInt]
  (t2/select-one :model/Glossary :id (long id)))
```

Note `mu/defn` schemas are compiled out of production builds, so the schema is not itself a runtime
guarantee. The coercion is.

### 7. Anything else from outside -> mark it

A string, enum, uuid, path, cron, locale.

```clojure
;; settings/db.clj -- same `setting-key` as the insert in rule 1, but filtered on
(t2/select-one-fn :value :model/Setting :key [:auto/param setting-key])
```

One function often needs two rules at once:

```clojure
;; dependencies/db.clj -- id coerced, strings marked
(t2/select-one-fn :id :model/Table
                  :db_id  (long db-id)
                  :schema [:auto/param schema]
                  :name   [:auto/param table-name])
```

---

## Call style: do not convert

**Leave every call in the style it is already written.** Do not rewrite kv-args as query maps.

The earlier guidance said a query map is "the shape HugSQL extraction reads off, so it is the first
half of step 2." That is not true, and both spikes show it:

| spike | input style | what extraction still needed |
|---|---|---|
| [#82530 glossary](https://github.com/metabase/metabase/pull/82530) | kv-args (`:id id`) | trivial for the simple queries; a flag-gated rewrite plus a Postgres typing workaround for the one with a conditional `:where` |
| [#82587 sso](https://github.com/metabase/metabase/pull/82587) | already query maps | `SELECT 1 ... LIMIT 1` rewrite, empty-collection sentinels for `IN`/`NOT IN` |

Extraction is semantic. It rewrites conditional clauses into flags, handles empty collections, picks
cross-database-portable SQL, and discards the HoneySQL shape entirely — `h2x/like-substring`'s
`[:escape ...]` form becomes plain `ESCAPE '!'` text. A query map is not closer to the target; it is
a different thing to throw away.

Converting also introduces a bug class that is invisible at the call site and statically
uncheckable. See [Type transforms](#type-transforms-the-trap-that-bit-us) below.

The `lint-kv-args!` check that asked for the conversion is removed, so nothing requests it.

### These rules are temporary

Everything in this section, and the [type transform trap](#type-transforms-the-trap-that-bit-us)
below, exists because a Toucan query fn accepts kv-args and a query map in almost any mix, so
"which style is this, and does that change the semantics?" is a question you have to ask per call.

Step 2 retires the question rather than answering it. A HugSQL query function takes one map and has
no override surface:

```clojure
(card.db/card-by-id {:id 3})
(sso.queries/auth-identity-exists {:user-id 5 :provider "google"})
```

There is no call style to choose, so there is no transform-position trap: the value goes into a
`:value:x` hole and binds, and any transform the model needs runs explicitly in the wrapper. A
namespace that has been extracted does not need this section at all.

So read these rules as scaffolding for the sweep, not as house style. They retire per namespace as
extraction lands (GHY-4482 onward).

### If you convert anyway

Two rules you cannot skip.

**`t2/update!` conditions may be kv-args or a conditions map — never `{:where ...}`.**

```clojure
(t2/update! :model/X :locale [:auto/param locale] {:msgstr "..."})   ; kv-args -- works
(t2/update! :model/X {:locale [:auto/param locale]} {:msgstr "..."}) ; conditions map -- works
(t2/update! :model/X {:where [:= :locale locale]} {:msgstr "..."})   ; FAILS
```

The third is read as a column literally named `where` and fails with
`only binary := is supported`. Both working forms run type transforms.

**Do not assume a fixed argument offset.** Several query fns take an argument before the model:

```clojure
(t2/select-one-fn :value :model/Setting :key k)
;;                ^^^^^^ before the model
```

Read each call. Mis-pairing from a fixed offset is the bug that made kv-arg counts too low before
the lint was fixed.

---

## Type transforms: the trap that bit us

Toucan applies a model's `deftransforms` `:in` fn **only** in kv-arg position. It hooks
`query/apply-kv-arg`; a raw `{:where ...}` map never passes through there. Toucan's own source calls
HoneySQL "an outlet to bypass type transforms" (`toucan2/tools/transformed.clj:88`).

Verified against a real app DB on `:model/SearchIndexMetadata`, whose `:engine` is
`mi/transform-keyword`:

```clojure
(t2/select :model/SearchIndexMetadata :engine :appdb)
;; => ["SELECT * FROM SEARCH_INDEX_METADATA WHERE ENGINE = ?"  "appdb"]      transform ran

(t2/select :model/SearchIndexMetadata {:where [:= :engine :appdb]})
;; => ["SELECT * FROM SEARCH_INDEX_METADATA WHERE ENGINE = \"APPDB\""]       transform skipped
```

The second is broken: the keyword lands in a value slot, HoneySQL formats a keyword there as an
**identifier**, and the query compares a column to a nonexistent column. It compiles. It runs. It
returns wrong rows or throws at the database.

Two instances shipped this way before being caught:

- `sync/db.clj` — `:semantic_type :type/Name` became `semantic_type = type."Name"`
- `collections/db.clj` — `:model/User` `:type :api-key` became `"type" <> "api-key"`

**The rule: a call filtering on a column with a `deftransforms` entry stays a kv-arg.** Transforms
run there and the value needs no marker. This is the main reason call style is not converted.

What breaks is the CALL STYLE, not the marker. A marked kv-arg still runs the transform, because
`value_guard` lifts the `[:auto/param column v]` 3-arity from inside `apply-kv-arg`. Verified on
`:model/SearchIndexMetadata`:

```clojure
(t2/select :model/SearchIndexMetadata :engine :appdb)
;; => ["... WHERE \"ENGINE\" = ?"  "appdb"]        kv-arg, bare

(t2/select :model/SearchIndexMetadata :engine [:auto/param :appdb])
;; => ["... WHERE \"ENGINE\" = ?"  "appdb"]        kv-arg, marked -- identical

(t2/select :model/SearchIndexMetadata {:where [:= :engine :appdb]})
;; => ["... WHERE \"ENGINE\" = \"APPDB\""]          where map -- transform skipped, broken
```

So a marker on a transformed column in kv-arg position is harmless but redundant: leave it off
because the transform already binds the value, not because marking would break it.

Models with transforms include `:model/Field`, `:model/Card`, `:model/Collection`, `:model/User`,
`:model/Database`, `:model/DataPermissions`, `:model/SearchIndexMetadata` and ~90 others. Check
before assuming a column is plain.

---

## What the mechanism catches for you

`value_guard.clj` refuses these at compile rather than letting them reach SQL. You do not need to
hand-check for them, but knowing the messages saves debugging time.

| thrown | meaning |
|---|---|
| `::malformed-marker` | marker-shaped but not `[:auto/param v]`, e.g. a stray third element |
| `::marked-operator-form` | the marker wraps a whole comparison — `[:auto/param [:< v]]` instead of `[:< [:auto/param v]]` |
| `::marked-empty-collection` | rule 5 |
| `::marker-reached-sql` | a marker survived to SQL, e.g. written in a column or table position |

A marker in a column or table position is the one case worth naming explicitly, because the failure
is silent without the guard: HoneySQL formats it as the literal identifier `param` and discards the
value.

`nil` needs no special handling. A marked nil passes through as a literal so HoneySQL emits
`IS NULL`, where a bound parameter would emit `= ?` and match nothing.

---

## Known limits — record, do not solve

A fully converted namespace can still report findings. That means the lint is less precise than this
rubric, not that work remains.

- **Column references get flagged** (rule 2). The lint's suggested fix would break the join.
- **Operator forms the walk does not classify** — `[:composite ...]`, `[:case ...]` — are skipped or
  mis-flagged. The lint knows comparison operators and boolean connectives; nothing else.
- **`^:const` literals** are flagged as symbols even though they resolve to compile-time constants.
- **Helpers that return a form, not a value.** `h2x/like-substring` returns
  `[:escape "%foo%" [::h2x/literal "!"]]`; marking it binds the whole form and drops the `ESCAPE`
  clause. It is already safe. The rule: **mark what sits in the value slot after any transformation**,
  not the argument the function received.

**The gate is not zero findings.** It is that every remaining finding is explained by a rule above or
a limit here. Never contort code to silence a finding; forcing a value into the rubric because the
lint asked is a wrong outcome.

---

## Procedure

1. Branch from `master`. The mechanism is merged; there is no feature branch to build on.
2. Add the namespace to `:config-in-ns` under `:metabase/unsafe-app-db-query` (see
   [The marker](#the-marker)).
3. Lint: `clj-kondo --lint <path> --config .clj-kondo/config.edn`
4. Apply the rubric to each finding. Do not change call style.
5. Confirm every remaining finding is accounted for, and say which rule or limit accounts for it.
6. Run the module's tests: `./bin/test-agent :only '[metabase.<module>.db-test]'`. If any fail,
   **prove** they fail on a clean master checkout before calling them pre-existing: check out master
   in a scratch worktree, rerun, diff the failing test names.
7. Add a test if the module has none for its queries — a value that looks like SQL should match
   nothing.

A PR is three files: the module's `db.clj`, its `db_test.clj`, and the one-entry `.clj-kondo/config.edn`
change.

## Stop and ask

- A value that is neither clearly an id nor clearly from outside.
- A conversion that changes a query's results.
- A flagged value you believe is safe for a reason not listed here.

Partial conversions with recorded questions are a good outcome.

## Out of scope

Values only. An attacker-controlled operator or column name still injects; the marker does nothing
about it. Writes are not parameterized here either — see rule 1, and
[GHY-4615](https://linear.app/metabase/issue/GHY-4615) for the write path. Both are step 2's half.

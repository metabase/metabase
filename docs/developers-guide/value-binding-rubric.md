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
;; settings/db.clj -- the inserted row's values are left alone
(t2/insert-returning-instances! :model/Setting :key setting-key :value value)

;; settings/db.clj -- `value` is in the changes map, so it stays bare.
;; `setting-key` is a CONDITION, so rule 7 applies to it instead.
(t2/update! :model/Setting :key [:auto/param setting-key] {:value value})
```

A written value is not a where-clause value, so it is not the injection shape this project targets
(HoneySQL will still resolve a map in a VALUES row or a SET map toward structure, which is what the
shipped `honeysql_guard` and the write path in GHY-4615 cover). And marking one
does not just fail to help — it corrupts the write, because the column's `:in` transform runs on
the marker itself before compile. `[:lift "huh"]` on a `:json` column is stored as the literal
string `"[\"lift\",\"huh\"]"`: marker destroyed, wrong data persisted. The same applies to any
encrypted column, which is `mi/transform-encrypted-json` — an `:in` transform, so a marker reaches
it and is encrypted as data.

A `define-before-insert` hook can read a written value too, which is another reason the value must
arrive as itself rather than wrapped.

The lint no longer flags written values.

Do not confuse the changes map with the conditions. `(t2/update! model conditions changes)` — the
conditions filter and follow rules 2 through 7; only the trailing changes map is exempt.

### 2. A column rather than a value -> leave it

A join ON condition compares two columns, and so does `[:= :a.id :b.id]`.

```clojure
;; dependencies/db.clj -- `id-field` holds a column, not a value
:left-join [:dependency_status [:and
                                [:= :dependency_status.entity_id id-field]
                                ...]]
```

Marking a column reference does not fail loudly — it binds the column NAME as a parameter, so the
comparison survives but compares against a literal string instead of the column:

```clojure
(t2/select :model/Setting {:where [:= :key [:auto/param :value]]})
;; => ["SELECT * FROM SETTING WHERE KEY = ?"  :value]   <- compares to the keyword, not the column
```

The query still runs and returns the wrong rows. The lint flags some column references and cannot
tell them from values, so this one is on you: check whether the symbol holds a column before
marking it. Record it and move on.

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

`long` throws on a string, map, vector, or keyword, so a request value that is not a number cannot
reach the value slot. Two edges worth knowing: it silently TRUNCATES a non-integral number
(`(long 1.9)` is `1`), and it returns the codepoint of a `Character`. Neither can carry SQL, so the
security guarantee holds — but do not read `long` as full validation. Use `mapv`, not `map`, so a
bad element throws at the call site rather than part way through the query.

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

Toucan rewrites `[:in col []]` to `FALSE`, because `IN ()` is invalid SQL, and that rewrite runs
inside the compile step the marker wraps — so marking hides it. The guard refuses a marked empty
collection rather than guessing, and you get a thrown `::marked-empty-collection` instead of a
silent bug.

**The rewrite is `:in` only.** `:not-in` is not rewritten, so an empty collection there emits
invalid SQL whether you mark it or not. Verified:

```clojure
(t2/select :model/Setting {:where [:in :key []]})      ; => "... WHERE FALSE"        fine
(t2/select :model/Setting {:where [:not-in :key []]})  ; => "... WHERE KEY NOT IN ()" broken
```

So for `:not-in`, leaving it unmarked is not a safe finished state: the call site has to guarantee
the collection is non-empty (or branch on `seq`). Record it as a finding if it cannot.

**Which wins when a collection holds ids?** Rule 4 and this rule both apply. Rule 4 wins: coerce
with `(mapv long ids)` and do not add a marker. The coercion proves each element is numeric, and an
empty vector still reaches Toucan's `:in` rewrite because `mapv` of nothing is `[]`.

**Where the non-empty proof has to live.** "Provably non-empty" means provable at THIS call, not at
a caller one file away — a caller's `(seq ...)` guard can be deleted without touching this
namespace. If the guarantee is not local, treat the collection as possibly empty.

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

A string, enum, uuid, path, cron, locale, boolean -- anything that did not come from the source
text. If it arrived as an argument and is not an id, it belongs here.

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
`mi/transform-keyword`. All three forms, so the variable is visible:

```clojure
;; kv-arg, bare -- transform runs
(t2/select :model/SearchIndexMetadata :engine :appdb)
;; => ["... WHERE \"ENGINE\" = ?"  "appdb"]

;; kv-arg, marked -- transform still runs, byte-identical SQL
(t2/select :model/SearchIndexMetadata :engine [:auto/param :appdb])
;; => ["... WHERE \"ENGINE\" = ?"  "appdb"]

;; query map -- transform SKIPPED
(t2/select :model/SearchIndexMetadata {:where [:= :engine :appdb]})
;; => ["... WHERE \"ENGINE\" = \"APPDB\""]
```

**The call style is the variable, not the marker.** A marked kv-arg keeps its transform because
`apply-kv-arg` still runs on it: `transform-condition-value` treats a sequential value as an
operator form and maps the transform over its tail, so `[:auto/param :appdb]` comes out as
`[:auto/param "appdb"]` with the payload transformed. Only moving the value into a `{:where ...}`
map takes it off the `apply-kv-arg` path, and that is where the transform is lost.

The third form is broken: the keyword lands in a value slot, HoneySQL formats a keyword there as an
**identifier**, and the query compares a column to a nonexistent column. It compiles, it runs, and
it returns wrong rows or throws at the database. Two instances shipped that way before review caught
them:

- `sync/db.clj` — `:semantic_type :type/Name` became `semantic_type = type."Name"`
- `collections/db.clj` — `:model/User` `:type :api-key` became `"type" <> "api-key"`

**The rule: a call filtering on a column with a `deftransforms` entry stays a kv-arg**, and the
value needs no marker there — the transform already binds it. A marker would be redundant rather
than harmful, so leave it off. This is the main reason call style is not converted.

If a call is ALREADY a query map on master and filters on a transformed column, the value must be
the POST-transform form, written out explicitly:

```clojure
[:= :semantic_type [:auto/param "type/Name"]]   ; not the keyword :type/Name
```

Models with transforms include `:model/Field`, `:model/Card`, `:model/Collection`, `:model/User`,
`:model/Database`, `:model/DataPermissions`, `:model/SearchIndexMetadata` and ~90 others. Check
before assuming a column is plain.

---

## What the mechanism catches for you

`value_guard.clj` refuses these at compile rather than letting them reach SQL:

| thrown | meaning |
|---|---|
| `::malformed-marker` | marker-shaped but not `[:auto/param v]`, e.g. a stray third element |
| `::marked-operator-form` | the marker wraps a whole comparison — `[:auto/param [:< v]]` instead of `[:< [:auto/param v]]` |
| `::marked-empty-collection` | rule 5 |
| `::marker-reached-sql` | a marker reached a raw `[sql & args]` vector, where nothing can lift it |
| `::marker-outside-value-slot` | a marker in a slot that names a column or table — a `:select`/`:from` entry, an alias, a join table |

A marker outside a value slot is refused as `::marker-outside-value-slot`. The lift rewrites a
marker wherever it sits, so without this one in an identifier slot compiled to the identifier
`PARAM` and silently discarded the value.

The check is positional, because HoneySQL is: an entry in one of those clauses is `expr` or
`[expr alias]`, so index 0 may be an expression and everything after it is a name. That is what
catches `{:from [[:t [:auto/param "al"]]]}`, which a head-shape test read as an operator form.
It recurses into subqueries, descends past keyword-headed operator forms (so a computed projection
or a `CASE` sort key is fine), and treats `:cross-join` as a flat list of tables since it has no ON
condition.

`:order-by` and `:group-by` are deliberately NOT refused: HoneySQL binds a param in both
(`ORDER BY ?`), so a marker there is a pointless no-op rather than a dropped value.

`nil` needs no special handling. A marked nil passes through as a literal so HoneySQL emits
`IS NULL`, where a bound parameter would emit `= ?` and match nothing.

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

### The lint also MISSES things (false negatives)

Everything above is the lint over-flagging. It under-flags too, and zero findings therefore does not
mean a namespace is converted. Grep for these by hand:

- **A positional primary key.** `(t2/update! model id changes)`, `(t2/select model id)`. Not a
  keyword pair, so nothing sees it. Coerce these by hand.
- **A non-literal model.** `(t2/select-one model :id id)` -- the walkers find the value slots by
  locating the `:model/...` keyword, so a model held in a symbol blinds them. `models/db.clj` and
  `mcp/db.clj` are built this way; a namespace like that can be opted in and pass vacuously.
- **A fn that RETURNS a clause** for a caller to execute outside the Toucan pipeline (via
  `app-db/query`). The value slots are invisible to the lint and the marker never reaches the
  compile step that lifts it.

Covered now, after review found each of them silent: a bare conditions map
(`(t2/update! model {:col v} changes)`, `delete!`, `mdb/update-or-insert!`), a value inside a
function-call form (`[:= :k [:lower v]]`), a literal collection (`[:in :k [a b]]`), the `:!=` /
`:<>` / `is-distinct-from` operators, and a value inside a subquery.

**The gate is not zero findings.** It is that every remaining finding is explained by a rule above or
a limit here, AND that you have hand-checked the shapes in this subsection. Never contort code to
silence a finding; forcing a value into the rubric because the lint asked is a wrong outcome.

**Write the accounting down.** Put the survivor list in the PR description — one line per finding
with the rule or limit that accounts for it. Reviewers have no other place to look, and an
unaccounted namespace is indistinguishable from a converted one without it.

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

**Values only.** A HoneySQL map has value slots and structure slots — an operator, a column name, a
table name, an arm count. `[:auto/param x]` protects a value slot and cannot protect a structure
slot: in a structure position HoneySQL formats `[:param :k]` as an identifier, dropping the value
and putting a generated key in the SQL text. The guard now refuses that outright
(`::marker-outside-value-slot`), so do not reach for a marker to fix a structure slot — it will
throw, and the fix is a `.sql` file.

The structure-slot backlog is measured: **90 read-side structure slots are confirmed
request-reachable** across 33 `db.clj` files, of which 73 convert mechanically (flag-gating or a
`CASE` over a bound value) and 17 need runtime composition. See the
[structure-slot provenance audit](https://linear.app/metabase/document/structure-slot-provenance-audit-what-actually-needs-converting-to-sql-f7c824f3fac1).
That work is GHY-4482 onward and does not overlap this sweep.

Do not treat a converted namespace as safe from injection. This sweep closes the value half; a
namespace can be fully value-bound and still have a request-reachable structure slot.

**Writes** are not parameterized here either — see rule 1, and
[GHY-4615](https://linear.app/metabase/issue/GHY-4615) for the write path.

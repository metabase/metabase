# Validated records: a write takes proof that its checks passed

A sink that writes the app DB takes a validated record and nothing else. It reads everything it writes out of that
record. `metabase.util.validated` makes the record impossible to obtain without running its checks:

- `validate` runs a record's checks and returns that exact record.
- `validated` refuses any record that `validate` did not return.

The goal is to make two kinds of authorization bug impossible to write:

- **Check one thing, write another.** A permission check approves row A, and the write touches row B.
- **Write a reference nobody checked.** A request sets a foreign key, such as `timeline_id`, to a row the user
  may not write.

Today a permission check and the write it guards are separate statements. The only thing keeping them aligned is a
person reading both. With a validated record, the sink has no source of ids or columns other than the record the
checks approved.

## Use it in three steps

### 1. Define a record next to the code that writes

The record's fields are everything the write needs. The record implements `Validatable`.

```clojure
(ns metabase.cards.rename
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.util.validated :as validated]))

(set! *warn-on-reflection* true)

(defrecord RenameCard [user-id card-id title]
  validated/Validatable
  (checks [_]
    [[::title-not-blank (not (str/blank? title))]])

  (external-checks [_]
    (api/write-check :model/Card card-id) ; throws the 404 or 403
    [[::acting-user-is-current-user (and (some? user-id)
                                         (= user-id api/*current-user-id*))]]))
```

### 2. Validate where the request is parsed

```clojure
(validated/validate (->RenameCard api/*current-user-id* id (:title body)))
```

`validate` either returns the record or throws:

| Outcome | `:status-code` | `:failures` in `ex-data` |
|---|---|---|
| A check failed | 400 | every failed check, by name, with its result |
| An external check failed | 403 | every failed external check, by name, with its result |
| An external check threw | whatever it threw | none: the exception propagates, for example the 404 or 403 from `api/write-check` |

### 3. Make the sink take the record and nothing else

```clojure
(defn rename-card!
  [rename]
  (let [^RenameCard rename (validated/validated RenameCard rename)]
    (t2/update! :model/Card (.-card-id rename) {:name (.-title rename)})))
```

The sink has no `id` parameter and no `changes` parameter. The id it writes is the id the checks fetched.

## The `Validatable` protocol has two methods, and the split is the order of evaluation

```clojure
(defprotocol Validatable
  (checks [record]
    "Checks that read only the record.")
  (external-checks [record]
    "Checks that read the world, such as permissions. [[validate]] calls this only when every check passed, so these
    never see a malformed record."))
```

Each method returns a vector of `[check-name result]` pairs.

- **`checks`** read only the record: shapes, schemas, and how fields relate to each other. They are pure and cheap.
  A failure is a 400.
- **`external-checks`** read the world: the app DB, permissions, the current user. `validate` calls this method only
  when every check passed, so a permission query never runs on a malformed id. A failure is a 403.

Inside a method body, the record's fields are local symbols. `title` above is the record's field. A misspelled field
does not compile:

```
Syntax error compiling at (rename.clj:12:5).
Unable to resolve symbol: titel in this context
```

### A check passes only when its result is exactly `true`

Anything else is the failure, reported under the check's name. Return the failure data directly:

```clojure
[[::changes-match-schema (or (me/humanize (mr/explain changes-schema changes)) ; nil when valid
                             true)]]
```

A failure then throws an `ex-info` with this `ex-data`:

```clojure
{:status-code 400
 :record      EventUpdate
 :failures    {::changes-match-schema {:creator_id ["disallowed key"]
                                       :name       ["should be a string"]}}}
```

`nil` is a failure, not a pass. Many predicates return `nil` to mean no. `re-matches` and `some` are two examples.
If `nil` passed, a check written as `(re-matches #"..." s)` would pass every value it fails to match.

### Existing permission checks can throw instead of returning

`api/write-check` throws a 404 when the row is missing and a 403 when the user may not write it. It also publishes the
audit event for the denial. Call it in the method body before the vector:

```clojure
(external-checks [_]
  (api/write-check :model/TimelineEvent event-id) ; throws the 404 or 403
  [[::acting-user-is-current-user ...]])
```

The existing check keeps its status codes and its audit event, and no permission logic is duplicated.

### Checks are results, not functions

A check is `[name result]`, evaluated when the method runs. It is not `[name (fn [record] ...)]`. Results let the
body use the fields as locals, which gives the compile-time check above. A function of the record would receive it
as an argument and destructure it with keywords, where a misspelled keyword is a silent `nil`.

The vector evaluates in order, so a later check can rely on an earlier one having run. Every entry runs; a
failure does not stop the rest. Every failure is reported at once, unless a check throws.

## A sink reads fields with `.-`, so a misspelled field fails the build

```clojure
(let [^EventUpdate validated-update (validated/validated EventUpdate validated-update)]
  (t2/update! :model/TimelineEvent (.-event-id validated-update) (.-changes validated-update)))
```

With the type hint, the compiler resolves `.-event-id` against the record's class. A misspelled field is a
reflection warning:

```
src/metabase/timeline/db.clj:122:17: reflection: reference to field event_idd on
metabase.timeline.event_update.EventUpdate can't be resolved.
```

Eastwood's `:reflection` linter fails CI on that warning.

A keyword read gets none of this. `(:event-idd validated-update)` is `nil`, and `(t2/update! :model/TimelineEvent nil
changes)` is not a write anyone intended.

### The kondo hook flags keyword reads and unhinted bindings

`:metabase/validated-field-access`, in `.clj-kondo/src/hooks/clojure/core/let.clj`, checks every `let` that binds
`(validated/validated SomeRecord x)`:

```clojure
(let [u (validated/validated EventUpdate x)] ...)              ; flagged: not hinted ^EventUpdate
(let [{:keys [changes]} (validated/validated EventUpdate x)])  ; flagged: destructured
(let [^EventUpdate u (validated/validated EventUpdate x)]
  (:changes u)                                                 ; flagged
  (get u :changes)                                             ; flagged
  (get-in u [:changes :name])                                  ; flagged
  (select-keys u [:changes])                                   ; flagged
  (-> u :changes)                                              ; flagged
  (let [{:keys [changes]} u] changes)                          ; flagged
  (.-changes u))                                               ; fine
```

The hook returns the `let` unchanged, so kondo's own `let` analysis still runs.

## Holding a validated record is the proof

`validate` stores each record it returns in a weak map keyed by identity. `validated` and `validated?` look the record
up there:

```clojure
(defonce ^:private ^Map issued
  (.makeMap (.weakKeys (MapMaker.))))
```

Guava's `weakKeys` compares keys with `identical?`, not `=`. A record that equals a validated one but was built
separately is not in the map. The keys are weak, so a validated record is garbage collected like any other value.

| Attempt | Result |
|---|---|
| A plain map with the right keys | refused: not an instance of the record class |
| `->EventUpdate` or `map->EventUpdate` without `validate` | refused: not in the map |
| A record equal to a validated one, built by hand | refused: `=` but not `identical?` |
| `assoc` or `merge` on a validated record | refused: a new record, not in the map |
| The record reader tag, or a `pr-str` and `read-string` round trip | refused: a new record |
| A validated record of another class | refused: `instance?` fails |
| `extend-type` of the record to `Validatable` with empty checks | throws: the record already implements it |

`validated` throws a 500 for every refused attempt. A refusal at the sink is a programming error, not a permission
failure: the permission check either already ran or never did.

## A reference column comes from another validated record

A foreign key in a plain `changes` map is an integer that nothing checked. In `EventUpdate`, `changes` cannot hold
`timeline_id`. A move to another timeline must carry a validated `TimelineWrite`:

```clojure
(defrecord TimelineWrite [user-id timeline-id]
  validated/Validatable
  (checks [_] [])
  (external-checks [_]
    (api/write-check :model/Timeline timeline-id) ; throws the 404 or 403
    [[::acting-user-is-current-user (and (some? user-id)
                                         (= user-id api/*current-user-id*))]]))

(defrecord EventUpdate [user-id event-id changes new-timeline]
  validated/Validatable
  (checks [_]
    [[::changes-match-schema (or (me/humanize (mr/explain changes-schema changes)) true)] ; no :timeline_id
     [::new-timeline-checked (or (nil? new-timeline)
                                 (and (validated/validated? TimelineWrite new-timeline)
                                      (= user-id (.-user-id ^TimelineWrite new-timeline))))]])
  (external-checks [_]
    (api/write-check :model/TimelineEvent event-id)
    [[::acting-user-is-current-user (and (some? user-id)
                                         (= user-id api/*current-user-id*))]]))
```

The sink takes `timeline_id` from the `TimelineWrite`:

```clojure
(cond-> (.-changes validated-update)
  new-timeline (assoc :timeline_id (.-timeline-id new-timeline)))
```

Removing `TimelineWrite`'s write-check would be a visible edit to the only place that grants a move. There is no
second path to forget. `validated?` is the non-throwing form of `validated`, for a check that a field holds another
validated record.

## Count ungated writes with `./bin/mage write-census`

```
./bin/mage write-census                                    # module | write-sites | gated | ungated
./bin/mage write-census --module timeline                  # one module, each ungated site as file:line
./bin/mage write-census --module timeline --max-ungated 6  # exit 1 when over budget
```

A write site is a call to a Toucan 2 insert, update, delete, or save function. A site is gated when its enclosing
var calls `validated/validated` before the write. `--max-ungated` is a ratchet: lower the budget as sites are gated.

## Test a gated sink at three levels

1. **Pin the endpoint before the change.** Write HTTP tests for the current 403s and 404s and run them on the old
   code. They must pass before and after.
2. **Test the sink seam.** Pass an id, a plain map, and an unvalidated record, and assert a 500 each time. Assert
   that a validated record writes.
3. **Try to get past it.** Write one test per attempt in the table above, and assert the row is unchanged after
   each.

Check that the tests cover every check: delete each check in turn, run the tests, and confirm one fails. A check
that no test notices is dead or untested.

## Decisions

### Validate once, at the sink boundary, not on every write

**Decision:** validation runs when `validate` is called. `assoc`, constructors, and methods never validate.

**Rejected:** validating on every `assoc` and constructor call, with a separate draft type for multi-step edits.
Every `assoc` could then throw, which surprises Clojure code. A draft is a second class per record, and code that
walks data, such as `clojure.walk`, would run the checks once per entry.

**Consequence:** a record can hold invalid data until someone validates it. The sink refuses anything unvalidated,
so the invalid data can't reach a write.

### One record per operation, not one record with purposes

**Decision:** each operation is its own record: `EventUpdate`, `TimelineWrite`, `RenameCard`. Each record has one
set of checks.

**Rejected:** a single record with named purposes (`:sending`, `:previewing`) and a context argument that selects
which checks run. That is more machinery to read for each check, and a call can name the wrong purpose.

**Consequence:** a record that needs another's validity holds it as a field and checks it with `validated?`, as
`EventUpdate` does with `TimelineWrite`.

### A plain protocol, not a macro

**Decision:** a record implements `Validatable` with ordinary `defrecord` syntax.

**Rejected:** a `defrecord`-like macro that declares checks with dependency arglists, qualifies field keys, and
generates sealed and draft classes. Readers would need to know what the macro expands to.

**Consequence:** locals already give compile-time field checking. The macro's other features, such as
remembering which checks passed, are not needed when validation runs once, right before the write.

### Remember validated records by identity

**Decision:** a private weak identity map records what `validate` returned.

**Rejected:**

- **A secret in a field.** `deftype` and `defrecord` fields are public. Code can read a secret out of one validated
  record and pass it to the constructor of a forged one.
- **A secret in metadata.** `with-meta` copies it onto any value.
- **A `validated?` boolean field.** The constructor sets it to `true`.

**Consequence:** a lookup is a hash of the record's identity, not of its contents. One shared map serves every
record type.

### The acting user is a field

**Decision:** who is acting is a field of the record (`user-id`). An external check requires it to equal
`api/*current-user-id*`.

**Rejected:** a separate context map passed to `validate`. The user is part of what was checked, so it belongs in
the record that proves the check.

**Consequence:** existing permission functions, such as `api/write-check`, still read the current user from the
request binding. `::acting-user-is-current-user` makes that dependency explicit and refuses a mismatch.

### Fields are read with `.-`, not namespaced keywords

**Decision:** a sink reads fields with `.-` on a hinted local, and the kondo hook enforces it.

**Rejected:** namespaced field keys. They need a macro, and `::event-update/event-idd` reads and compiles without an
error.

**Consequence:** every field read in a sink is checked by the compiler or eastwood.

### Constructors are not restricted

**Decision:** any namespace may call `->EventUpdate` or `map->EventUpdate`.

**Rejected:** a lint confining constructors to the record's namespace. A hand-built record is harmless: the sink
refuses it, because it is not in the identity map.

## Known limits

- **Time of check and time of use differ.** A permission revoked between `validate` and the write is not seen.
  Validate in the same request, one call before the write.
- **A validated record does not expire.** The sink does not compare `user-id` to the current user. Code that keeps a
  validated record and writes it later, or as someone else, still writes. Validate where you write.
- **A private var is reachable by var-quote.** `(.put @#'metabase.util.validated/issued forged true)` adds a forged
  record to the map. This needs code inside the JVM, not a request.
- **`with-redefs` replaces `validate` or `validated`.** Use it in tests only.
- **Validation needs a current user.** Writes with no current user, such as sync, Quartz jobs, and serialization
  loads, have no user to name. Gating them needs a record type that names the system actor, which this namespace
  does not provide.

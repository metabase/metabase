# Validated records: a write takes proof that its checks passed

A sink that writes the app DB takes a validated record and nothing else. It reads everything it writes out of that
record. `metabase.util.validated` makes the record impossible to obtain without running its checks:

- `parse` runs a record's checks and returns that exact record.
- `validated` refuses any record that `parse` did not return, or that is not of the class the sink names.

The goal is to make two kinds of authorization bug impossible to write:

- **Check one thing, write another.** A permission check approves row A, and the write touches row B.
- **Write a reference nobody checked.** A request sets a foreign key, such as `timeline_id`, to a row the user
  may not write.

Today a permission check and the write it guards are separate statements. The only thing keeping them aligned is a
person reading both. With a validated record, the sink has no source of ids or columns other than the record the
checks approved.

## Use it in three steps

### 1. Declare the record's checks in one `def` next to the record

```clojure
(def ^:private event-update-declaration
  {:checks  [{:name  ::event-id-positive
              :doc   "The event id is a positive integer."
              :kind  :pure
              :reads [:event-id]
              :f     pos-int?}
             {:name    ::may-write-event
              :doc     "The current user may write the event."
              :kind    :external
              :fetches [::event]
              :f       may-write?}]
   :fetches [{:name  ::event
              :reads [:event-id]
              :f     #(rows-by-id timeline.db.fetch/timeline-events-by-id %)}]})

(defrecord EventUpdate [user-id event-id changes new-timeline]
  validated/Validatable
  (declaration [_] event-update-declaration))
```

A check receives exactly what it names: the fields under `:reads`, then the fetches under `:fetches`, in that
order. It passes when it returns exactly `true`. Anything else is the failure, reported under the check's name with
its `:doc`.

### 2. Parse where the request is parsed

```clojure
(validated/parse (event-update/->EventUpdate api/*current-user-id* id changes new-timeline))
```

Who is acting is a field, like anything else the checks read. `parse` returns the record or throws. `parse-all` takes
many records and throws once with every failure, by index.

### 3. Make the sink take the record and nothing else

```clojure
(defn update-timeline-event! [update]
  (let [^EventUpdate update (validated/validated EventUpdate update)]
    (t2/update! :model/TimelineEvent (.-event-id update) (.-changes update))))
```

## A check is pure or external, and the two run differently

| | `:pure` | `:external` |
|---|---|---|
| Reads | only its arguments | the world: the DB, the current user |
| May name `:fetches` | no | yes |
| Pass remembered for the record | yes | no, runs on every call |
| Default status when first to fail | 400 | 403 |

A check's `:status-code` overrides the default.

### Every pure check runs before anything touches the world

1. Pure checks run first. A pure check waits on every pure check that reads a proper subset of its fields: the
   shape of one field is checked before a relation between two.
2. Fetches run next, once all pure checks pass.
3. External checks run last, after their fetches and every pure check.

Malformed input never reads the DB and never publishes a refusal audit event. A check that did not run because one
it waits on failed is listed under that check's `:blocked`.

### A fetch runs once per call, for every record

A fetch's `:f` takes every distinct tuple of the fields it reads, across all the records in one `parse-all` of that
record type. It returns a map from each tuple to what it fetched. A tuple missing from the result is a 500.

`parse-all` of 100 `EventUpdate`s is one `SELECT ... WHERE id IN (...)`.

### Existing permission checks throw instead of returning

`api/write-check` throws the 404 or 403, and publishes the permission-failure event, as the endpoints always did. An
external check may call it and return `true`. The exception propagates out of `parse`, so `parse-all` stops at the
first record it refuses.

## A declaration is checked the first time a record of its type is used

The declaration is refused with a 500 when:

- a check or fetch name is used twice, or is not a qualified keyword;
- a check has no `:doc`, no `:f`, or a `:kind` other than `:pure` or `:external`;
- a pure check names `:fetches`;
- a check or fetch reads a field the record does not have;
- a check names a fetch that is not declared;
- an `:f` closes over a local;
- there are more than 64 pure checks.

### An `:f` closes over nothing, so what it reads is what it declares

The library reflects on each `:f` and refuses one with instance fields, which are the locals it closed over. This
also refuses `constantly`, `partial`, `comp`, `memoize`, and `with-meta` on a fn, which close over their arguments.
Write a `fn` instead.

The guard does not see globals. A pure check must not read an atom or any other global that can change: its pass is
remembered, and would outlive the value it checked.

### Fields read by pure checks must be immutable

A remembered pass is only true while the field is the value that was checked. A `java.util.HashMap`, or a `proxy`
backed by an atom, can change after `parse`. `EventUpdate` has a pure check that the class of `changes` is exactly
`PersistentArrayMap` or `PersistentHashMap`. `instance?` is not enough: neither class is final, so a `proxy` can
subclass one and read from an atom.

## Drafts remember which pure checks passed

Before `parse`, a record is a draft.

- `check` runs the named checks, and what they wait on, and remembers the pure checks that passed.
- `passed-checks` returns the names of the pure checks the record is known to pass.
- `assoc-field` sets a field and keeps the passes of every check that does not read it. It refuses a key that is not
  a field.
- A plain `assoc` keeps nothing.
- `parse` runs only the pure checks not already known to pass, and every external check.

The passes live in a weak identity map, never on the record, so they cannot be forged. Each entry holds the plan it
was set under. A declaration that varies with a field starts from nothing when `assoc-field` switches it.

## A sink reads fields with `.-`, so a misspelled field fails the build

With the type hint, the compiler resolves `.-event-id` against the record's class. A misspelled field is a
reflection warning, and Eastwood's `:reflection` linter fails CI on it. A keyword read gets none of this:
`(:event-idd update)` is `nil`.

`:metabase/validated-field-access`, in `.clj-kondo/src/hooks/clojure/core/let.clj`, checks every `let` that binds
`(validated/validated SomeRecord x)`:

```clojure
(let [u (validated/validated EventUpdate x)] ...)              ; flagged: not hinted ^EventUpdate
(let [{:keys [changes]} (validated/validated EventUpdate x)])  ; flagged: destructured
(let [^EventUpdate u (validated/validated EventUpdate x)]
  (:changes u)                                                 ; flagged
  (get u :changes)                                             ; flagged
  (.-changes u))                                               ; fine
```

## Holding a validated record of the right class is the proof

`parse` stores each record it returns in a weak map keyed by identity. Guava's `weakKeys` compares keys with
`identical?`, not `=`. `validated` checks both the map and the class.

| Attempt | Result |
|---|---|
| A plain map with the right keys | refused: not an instance of the record class |
| `->EventUpdate` or `map->EventUpdate` without `parse` | refused: not in the map |
| A record equal to a parsed one, built by hand | refused: `=` but not `identical?` |
| `assoc`, `merge`, or `assoc-field` on a parsed record | refused: a new record, not in the map |
| The record reader tag, or a `pr-str` and `read-string` round trip | refused: a new record |
| A parsed record of another class, with the same fields and no checks | refused: `instance?` fails |
| `extend-type` of the record to `Validatable` with empty checks | throws: the record already implements it |

`validated` throws a 500 for every refused attempt. A refusal at the sink is a programming error, not a permission
failure.

## The records fetch through a namespace under the module's db namespace

The sink in `metabase.timeline.db` requires the record namespace, to name its class. The records fetch through
`metabase.timeline.db.fetch`, which holds read-only queries and requires neither, so there is no cycle. The query
lint allows queries in `metabase.<module>.db` and any namespace under it.

## A reference column comes from another validated record

A foreign key in a plain `changes` map is an integer that nothing checked. In `EventUpdate`, `changes` cannot hold
`timeline_id`: its schema is closed. A move carries a parsed `TimelineWrite`, which checks that the current user may
write the destination. `EventUpdate`'s pure check `::new-timeline-checked` requires
`(validated/validated? TimelineWrite new-timeline)` for the same user. The sink takes `timeline_id` from it.

## A record selects what one operation needs

A record declares the fields one operation requires, and the sink reads only those fields. Extra keys in a request
fail the closed schema rather than flowing through. This is selection, not prohibition: a record is built for one
context, so there is nothing to forbid.

## Count ungated writes with `./bin/mage write-census`

```
./bin/mage write-census                                    # module | write-sites | gated | ungated
./bin/mage write-census --module timeline                  # one module, each ungated site as file:line
./bin/mage write-census --module timeline --max-ungated 6  # exit 1 when over budget
```

A site is gated when its enclosing var calls `validated/validated` before the write.

## Test a gated sink at three levels

1. **Pin the endpoint before the change.** Write HTTP tests for the current 403s and 404s and run them on the old
   code. They must pass before and after.
2. **Test the sink.** Pass an id, a plain map, and an unparsed record, and assert a 500 each time. Assert that a
   parsed record writes.
3. **Try to get past it.** Write one test per attempt in the table above, and assert the row is unchanged.

Delete each check in turn and confirm a test fails. A check no test notices is dead or untested.

## Known limits

- **Time of check and time of use differ.** A permission revoked between `parse` and the write is not seen. Parse
  in the same request, one call before the write.
- **A parsed record does not expire.** The sink refuses one parsed for another user, but code that keeps a parsed
  record and writes it later, as the same user, still writes. Parse where you write.
- **A private var is reachable by var-quote.** A test fails on any source file that var-quotes into
  `metabase.util.validated`. This needs code inside the JVM, not a request.
- **`with-redefs` replaces `parse` or `validated`.** Use it in tests only.
- **Parsing needs a current user.** Writes with no current user, such as sync, Quartz jobs, and serialization loads,
  have no user to name.

# Security lint

A security linter for the Clojure backend. It runs clj-kondo as a library over production source, walks the
resulting call sites with a set of rules, traces which of them a request or a background task can reach, and
reports findings as text or as SARIF for GitHub code scanning.

```
./bin/mage security-lint                     # whole tree, text report
./bin/mage security-lint --branch            # only findings in files this branch changed vs origin/master
./bin/mage security-lint --uncommitted       # only findings in files with uncommitted changes
./bin/mage security-lint --sarif out.sarif   # also write SARIF
```

The task runs in a fresh JVM, under forty seconds for the whole tree: `src`, `enterprise/backend/src` and each
driver module's `src`. `--branch` and `--uncommitted` take as long -- taint and reachability are whole-program,
and a changed helper can flip an unchanged endpoint -- and narrow only the text report and the exit status. A
SARIF report always covers the whole tree.

CI runs it from `.github/workflows/metabase-security-lint.yml`: on every push to `master` and the release branches the
whole tree, and on a pull request that touches backend source or the linter, with `--branch --base HEAD^1` -- the
merge commit GitHub checks out, against its base parent -- so the job log shows the changed files' findings. Both upload the whole-tree SARIF to GitHub code scanning under
the category `metabase-security-lint`; code scanning compares a pull request's analysis with its base's and
annotates the pull request with the alerts it introduced. The job never fails on findings (`--warn-only`):
whether a new alert blocks a merge is code scanning's decision, in the repository's code security settings. The
SARIF carries no `security-severity` on purpose, so an alert's severity is the finding's own level -- graded per
finding by taint, not per rule -- and the threshold for alerts without a security severity, set to *errors*,
blocks a merge on a new error-level finding and on nothing else. Findings in test code,
`dev/` and `mage/` are never reported. To iterate in the REPL instead, call `(dev.security-lint/reload!)` and
then `(dev.security-lint/scan)`; a plain `:reload` picks up only the entry namespace, not an edited rule.

## Reading a rule

```clojure
(defrule command-injection
  {:name        "Command built from dynamic input"
   :description "A shell command is assembled from a value that isn't known statically. ..."
   :remediation "Pass each argument as its own element ..."
   :severity    :error
   :precision   :high
   :cwe         "CWE-78"
   :triggers    #{clojure.java.shell/sh babashka.process/sh}}
  [{:keys [node] :as ctx}]
  (when-let [dynamic (first (filter #(and (ast/dynamic-string? %) (taint/tainted? ctx %)) (ast/args node)))]
    {:message (str "Shell command interpolates a caller-supplied value: " (ast/->str dynamic))}))
```

A rule is a declaration map plus a detect body. The declaration says *where* the rule wants to look and how a
finding should be filed; the body looks at one candidate and answers nil (not a finding) or a map with a
`:message`. The rule's id is `:metabase-security-lint/<name>`, derived from the `defrule` name. GitHub keys alert
identity off it, so renaming a rule orphans its alerts.

**What the declaration says.**

- `:name`, `:description`, `:remediation` are what a reviewer reads in the alert. Description says why it
  matters; remediation says what to do instead.
- `:severity` is `:error`, `:warning` or `:note`. Only `:error` fails a run. A map
  `{:tainted :error :otherwise :note}` files the finding as an error when the flagged value is attacker-influenced
  and as a note otherwise, for rules where the same call is a vulnerability with request data and merely unwise
  without it.
- `:precision` is `:high`, `:medium` or `:low`, in SARIF's sense: how much to trust a match. Be honest. A rule
  that matches on shape alone is `:low` or `:medium`.
- `:cwe` is the weakness class, for the alert's tags.
- `:exempt-files` is a vector of regexes over the repo-relative path. The namespace that legitimately owns a
  dangerous operation, such as the HTTP wrapper that is allowed to call the raw client, goes here.
- `:taint-policy :any-local` makes every local binding count as tainted for this rule, whatever the scan runs
  under. For the rules whose sources the graph cannot see -- a warehouse column type, a saved question's unit --
  which were the majority of the SQL findings in the security tracker. The call-graph positions still arrive as
  `:boundary-locals`, so such a rule grades a value that crossed a boundary above a merely dynamic one.

**What the rule watches.** One of these families, or more than one when the same thing has two spellings.

- `:triggers` is a set of fully qualified var symbols. The rule fires at every call to one of them, resolved by
  clj-kondo, so aliases and `:refer` are handled and a same-named function elsewhere is not. The symbol does not
  need to be on the classpath. A call written as a threading step or inside `#()` is the same call: the rule
  sees `(-> url http/get)` as `(http/get url)`, threaded argument included.
- `:interop-triggers` is a set of `Class/method` symbols for static Java calls, matched by name.
- `:constructor-triggers` is a set of class names, for `(Random.)`, `(new Random)` and `(Random/new)`.
- `:form-triggers` is a set of macro or special-form heads, such as `def` or `reify`, for rules about a form's
  shape rather than a call.
- `:vector-triggers` is a set of keywords, for vectors headed by one of them: `[:raw ...]`, `[:like ...]`. The
  HoneySQL forms are data, not calls, and clj-kondo reports nothing at them.
- `:mark-triggers` is a set of metadata keywords, for forms carrying one: `^:allow-subquery {...}`. The node the
  rule receives is the form with its metadata stripped; the marks arrive as `:marks`.
- `:accessor-triggers` is a set of regexes over a key name, for reads of that key: `(:card_id m)`, `(get m
  :card_id)`, `(get-in m [... :card_id])`. `ast/accessor` gives the rule the map and the key.
- `:endpoint-rule true` fires once per `defendpoint` form instead of per call site, with the set of every
  function the endpoint transitively reaches. This is how a rule requires or forbids something anywhere on any
  path from an endpoint, which no single call site can answer.

**What the body receives.** A context map.

| key | present for | meaning |
|---|---|---|
| `:node` | every rule | The rewrite-clj node of the matched form, with position metadata. |
| `:filename` | every rule | Absolute path of the file. |
| `:reachable-from` | every rule | Set of entry kinds that reach this code: `:http`, `:job`, `:mq`, `:event`, `:cli`, `:startup`, `:setting`, `:protocol`. Empty means nothing known reaches it. |
| `:endpoint-reachable?` | every rule | Shorthand for `:http` being in the set. |
| `:tainted?` | rules with `:tainted-arg n` | Whether argument `n` derives from attacker input, resolved up front so the body can branch on it. |
| `:locals` | every rule | The tainted local positions in this file under the rule's policy; `taint/tainted?` reads it. For an endpoint rule, the boundary positions of the endpoint's own body. |
| `:boundary-locals` | call-site rules | The call-graph positions regardless of policy, `{[row col] #{label}}`: every value that crossed a trust boundary and which -- `:request`, `:app-db/Card`, `:warehouse`, `:external`, `:file`. |
| `:origin-calls` | every rule | Position -> label of every call to an origin function in the file, so a value used straight out of `(t2/select-one ...)` counts with no binding in between. |
| `:sanitized-calls` | call-site rules | Positions of calls resolved to a sanitizer no name reveals (`honey.sql/format`). |
| `:labels` | every rule | Every label at every usage position, the `:checked/*` ones included; `taint/checks` reads it. |
| `:bindings` | endpoint rules | The same keyed by binding position, for what an endpoint's own parameters carry. |
| `:untyped-locals` | call-site rules | The request positions whose schema does not pin them to a number -- what may arrive as a string, a map or a vector. |
| `:structured-locals` | call-site rules | The request positions pinned to neither a number nor a string -- what may arrive as a HoneySQL clause. |
| `:local-inits` | call-site rules | Local usage position -> the node it was bound to; `taint/tainted?` follows a local back through it. |
| `:marks` | call-site rules | The metadata keywords written on the matched form. |
| `:ns` | call-site rules | The file's namespace symbol. |
| `:nearby` | endpoint rules | The functions within two call hops of the endpoint, for questions the full closure drowns. |
| `:ns-wrappers` | endpoint rules | Every router wrapper applied to the namespace's handler, from any file: `+auth`, `+require-premium-feature`. |
| `:endpoint-ns` | endpoint rules | The endpoint's namespace symbol. |
| `:reaches` | endpoint rules | Set of function symbols the endpoint transitively calls. |
| `:ns-middleware` | endpoint rules | Middleware the namespace's router wraps every endpoint in, such as `+check-superuser`. |

**What the body returns.** `nil`, or a map with `:message`. Add `:tainted? true` when the rule decided the flagged
value is attacker-influenced and its `:severity` is the dual form. Anything else in the map is ignored.

## What "tainted" means

There is no dataflow analysis, and this is an approximation on purpose. Taint starts at trust boundaries and
carries a label naming which one: `defendpoint` parameters, `request`/`req` parameters and Ring destructuring
(`:request`); every read of the application database -- `t2/select*`, `t2/query`, `t2/hydrate`, `read-check`, and
every `defsetting` getter -- (`:app-db`, refined to the model, `:app-db/Card`); what a driver describes or
returns and what JDBC returns (`:warehouse`); what an HTTP client returns (`:external`); what a document parser
returns (`:file`). The stored sources are a dozen *functions* named in `vocabulary/origin-functions`, never
columns: which columns are dangerous is the sink's question, and the sinks already ask it. A function that
assembles external data from something not in the list declares it with `^{:taint/source :warehouse}` on its own
definition; a marker on a `defmulti` covers every implementation.

A function's return carries what its tail forms *generate* -- an origin call there, a call to another function
that generates, a local bound from either (plain or destructured: `(let [{:keys [name]} (t2/select-one ...)]
name)` returns a column of the row) -- so a row read in a `db.clj` helper reaches the endpoint that called it. What arrives through a parameter is not passed back out: that summary would be the union over every caller,
and one generic pass-through helper then hands every label to every caller. The caller still holds the argument.

Every finding records the boundaries its values crossed (`values cross: request, app-db (Card)` in the text
report, `origins` in SARIF). A stored origin grades exactly as a request does. The model cannot tell a row the
server wrote from one a user did, and does not try: a row in the application database can always be written by
other means than this code -- sessions and API keys have been forged that way -- so nothing read back from a
store is trusted.

Authorization checks are labels too. A value handed to `read-check`, `write-check`, `can-write?` or any name
matching `vocabulary/object-checks` carries `:checked/<Model>` from there on, and so does the object such a check
returns; a check inside a callee vouches for the caller's argument, and a check on the object a query fetched
vouches for the id that fetched it. A check on `(:card_id body)` is scoped to that key -- `:checked.card_id/Card`
-- and vouches for nothing else in `body`. A call handed the current user's id alongside an id --
`(t2/select-one :model/Bookmark :card_id id :user_id api/*current-user-id*)`, `(delete-bookmark! model id
api/*current-user-id*)` -- is scoped to that user, which authorizes the id by construction: it carries
`:checked/owner`, and the call reaches the pseudo-function `owner-scoped-query` that the endpoint rules accept as
an authorization. Not an insert, a log line, an event, or a core function assembling data
(`vocabulary/current-user-refs`, `not-a-scope`). `taint/checks` reads them. `rules/authorization.clj` asks the
questions that need them: is a request id, destructured or read out of a map, ever checked on any path; was a
write's row checked as the model written (or one that owns it, `vocabulary/model-parents`) rather than some
other; does an endpoint return rows of a model nothing checked.

Rules that need to know *which* boundary, or that two values from different boundaries met at one sink, live in
`rules/origins.clj`: a credential sent to a host a setting chose, a stored query run under another identity, a
setting written from a synced document, a model chosen by a document. `mass-assignment` grades by origin too --
warehouse metadata or a revision's object written wholesale into a model is a finding in the data-access layer,
where a request map is that layer's job.

It propagates through `let`s,
threading, and calls into other functions, across files. A map literal handed to a parameter that destructures
it reaches each key's binding with that entry's labels, not the whole map's. A setting typed as a number, a
boolean or a timestamp is no origin: its getter coerces. The keys the session middleware writes into the request
(`:metabase-user-id`, `:is-superuser?`) are the middleware's, not the client's. A call through a quoting function -- a name matching a
sanitizer pattern in `vocabulary.clj` -- clears it; escaping, munging and normalizing do not, since none of them
makes a value safe to splice. Propagation stops at the `propagation-sanitizers` (quoting, the `LIKE` escapers, the
numeric coercions), so `(helper (h2x/like-substring q))` does not taint `helper`'s parameter, and at a sink a local is
followed back to what it was bound to in the same file, so `(let [w (quote-ident q)] ...)` is clean at the use of `w`.
A function whose every tail form is a sanitizer call is a sanitizer itself -- `(defn- drop-sql [t] (sql/format ...))`
clears what it is handed, as does a wrapper of it -- and a thread that ends in one, `(-> {...} (sql/format))`, is
sanitized whole, since the earlier steps are the sanitizer's input. An escaper applied as a value,
`(map h2x/like-substring tokens)`, escapes what comes out.
A `when`/`if` whose test is `re-matches` or `contains?` vouches for its then-branch only. A validating assertion
-- `(validate-url! url)`, `(assert-llm-host-allowed! url)`, `(check-sso-redirect redirect)`, any name that says it
checks and what it checks (`vocabulary/assertion-validator`) -- vouches for its argument in the forms after it in
the same body, and its value is the value it validated. It does not follow values
through atoms, dynamic vars, protocol methods, or `reduce`/`swap!`, so a zero from a taint-dependent rule is not
proof of absence.

Request values are also classified by what their `defendpoint` schema pins them to, because those schemas are
enforced in production: `id :- ms/PositiveInt` cannot arrive as a string, so a rule about Toucan's pk-or-query
position leaves it alone. A `mu/defn` annotation on a helper does *not* count -- it is compiled out of production
builds unless the namespace is marked `^:instrument/always` -- and a value validated only by one is treated as
untyped. That is the honest reading of SEC-823 and SEC-843, and the reason `toucan-positional-arg-from-request` is
a warning rather than an error until SEC-1215 lands. A union of pinned schemas is pinned (`[:or ms/PositiveInt
[:= :root]]`). Stored values have no schema, but an id column read straight off a row -- `(:card_id dashcard)` --
is an integer key, and so is a local named like one (`card-id`, `ids`, `idx`) when what it holds is stored; a
key read inside a JSON column, or off an untyped request map, is whatever the document or the client put there
(`vocabulary/id-key?`, `numeric-local-name`).

Reachability is over-approximate by design: a function referenced as a value (`partial`, `comp`, `#'f`, stored in
a map) counts as reachable. The findings feed human and model review, and a false positive costs a minute where a
false negative costs an incident. The one place the graph is strict is the endpoint rules' "does this endpoint
execute a check" question, where a referenced-but-never-run check must not clear a finding: only direct calls and
`apply`/`mapply` count there.

## Writing a rule

1. **Pick the family.** A dangerous function or macro: `:triggers`. A Java static call or constructor:
   `:interop-triggers` or `:constructor-triggers`. A shape of form: `:form-triggers`. A HoneySQL clause or a
   marked form: `:vector-triggers` or `:mark-triggers`. A read of a key by name: `:accessor-triggers`. An
   invariant about every endpoint under some namespace: `:endpoint-rule`.
2. **Write the test first**, in `dev/test/dev/security_lint/rules_test.clj`. Each rule gets a vulnerable snippet
   that must flag and a safe one that must not. The helpers there run the real engine over a temp file, so
   resolution is covered too: that `edn/read-string` is spared while `read-string` is flagged is a property of the
   pair.
3. **Write the rule** in the `rules/` namespace it belongs to, or a new namespace required from `rules.clj`.
   Inspect the node with `ast.clj`: `args`, `arg`, `head-sym`, `literal-string?`, `string-value`, `map-get`,
   `kwargs`, `find-nodes`, `dynamic-string?`. Ask `taint/tainted?` before reporting a value as caller-supplied;
   `taint/origins` says which boundaries it crossed, `taint/checks` which authorization checks it passed, and
   `taint/tainted-leaves` names the locals that carry it, for the message. Name lists belong in `vocabulary.clj`,
   with a sentence on why each entry is there, not inline in the rule.
4. **Add a case to the example tree** in `dev/resources/security_lint/corpus/` and its expected row in
   `corpus_test.clj`. A test there fails for any registered rule with no example.
5. **Run it over the real tree** with `./bin/mage security-lint --warn-only` and read every finding. A rule that
   reports a hundred instances of the same safe idiom needs a narrower trigger, an exemption, or a lower
   severity. Say in the rule's comments what you tried and what it reported; the existing rules do.

Registration is validated at load: a missing key, an unknown severity or precision, an unqualified trigger, or a
rule with neither triggers nor `:endpoint-rule` throws when the namespace loads.

## Reporting

Text output goes to the terminal: findings grouped by rule, then by severity, each with its file:row:col, what
reaches it, and one shortest call path per kind of entry point that does.

SARIF output is what GitHub code scanning ingests, written compact (`jq` reads it). Every rule is described
whether or not it fired, so a clean run closes resolved alerts; each links to its source on master as the alert's
help link. Rules carry a `security` tag and their CWE, and no `security-severity`: the alert's severity is the
result's level, so a rule that grades by taint grades its alerts one by one. The run records the tool version
(`sarif/version` -- bump it when the output changes meaning) and when the scan ran. Each result carries a fingerprint over the rule, the file, the whole flagged form with its
formatting removed, and which occurrence of that form it is in the file, so an alert survives edits above it and a
reformat, and two identical forms in one file stay two alerts; an edit to the flagged form itself is a new alert,
dismissed or not -- what was reviewed is no longer what is there. `sarif/fingerprint` says exactly what is hashed
and why. Each result also carries one code flow per entry
kind, the entry, each function on the shortest path, and the finding, which GitHub renders as "Show paths" on the
alert. The message ends with what reaches the finding. Suppressing a finding is done by dismissing the alert in
GitHub, not with an annotation in the source.

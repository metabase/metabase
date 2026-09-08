(ns dev.security-lint.vocabulary
  "Every hand-maintained list of names the analysis keys on, in one place.

  The engine and the taint tracing are generic; what makes them fit *this* codebase is a handful of name lists --
  which functions sanitize, which validate, which take a request, which are the authorization checks. Those lists
  used to live wherever they were first needed, across five namespaces, and a rule author had no single place to
  look. Everything here is a judgement about naming conventions, not a fact derived from code, and each entry says
  why it is there."
  (:require
   [clojure.string]))

(set! *warn-on-reflection* true)

(def interpolating-fns
  "Functions that build a string from their arguments. A call to one of these with a non-literal argument is how
  untrusted data gets spliced into a command, query or path."
  '#{str format print-str pr-str printf string/join str/join clojure.string/join})

(def sanitizers
  "Name patterns for functions that render a value safe to interpolate.

  Identifiers cannot be parameterized in SQL, so quoting them is the correct fix, not a workaround -- a rule that
  ignores that is noise. `^quote$` is `Pattern/quote`, the fix the redos rule itself recommends, and also
  `clojure.core/quote`, whose argument is a literal by definition. Matching by name rather than fully qualified
  symbol covers aliases and per-driver implementations without enumerating them.

  Deliberately narrow. `^escape`, `^munge` and `^normalize-` were here once and cleared taint through
  `escape-text` (markdown), `munge-setting-name` and `normalize-key` -- none of which makes a value safe to splice
  into SQL, a shell command or a path. A name that says what a function does to a string is not a claim about
  what the string is safe for; only quoting is."
  [#"^quoted?-" #"-quote(d)?$" #"^quote$" #"^sanitize"])

(def validators
  "Calls that establish something about a value rather than merely using it, so a conditional testing one can
  vouch for its branch.

  `re-matches` is anchored by definition, so a match is an allow-list decision. `re-find` is deliberately absent:
  it is unanchored, and treating it as validation would retire findings that deserve to stand."
  '#{re-matches contains?})

(def assertion-validator
  "Functions that validate a value and *throw* when it fails, by name: `validate-url!`, `check-sso-redirect`,
  `assert-safe-path`. As a statement, one vouches for its argument in the forms that follow it in the same body;
  as a value, it returns what it validated. The name has to say both that it checks and what kind of value --
  a URL, a redirect, a host, a path, a pattern -- so `check-404`, which only asserts presence, and
  `check-superuser`, which is about the caller, do not count."
  #"^(check|validate|assert|verify|ensure)[-!]?.*(redirect|url|uri|host|network|path|file|dir|pattern|regex|domain|origin)")

(defn assertion-validator?
  "Whether `head` (a symbol as written) names a validating assertion, see [[assertion-validator]]."
  [head]
  (boolean (and (symbol? head) (re-find assertion-validator (name head)))))

(def binding-forms
  "Forms whose first argument is a binding vector of `[name init]` pairs, by the head's name."
  '#{let when-let if-let if-some when-some loop binding with-open doseq for})

(def binding-form-name
  "Binding forms spelled with a status code: `api/let-404`, `let-400`. Same shape as `let`, and where the object an
  endpoint fetches by a request id is usually bound -- a value bound here that the model did not see was neither
  tainted nor, once checked, vouched for."
  #"^(let|when-let|if-let|when-some|if-some)-\d{3}$")

(defn binding-head?
  "Whether `head` (a symbol as written, possibly qualified) opens a `let`-shaped binding vector."
  [head]
  (boolean (when (symbol? head)
             (let [n (name head)]
               (or (contains? binding-forms (symbol n))
                   (re-matches binding-form-name n))))))

(def threading-slots
  "Threading macros, and the argument position the threaded value lands in at each step."
  '{-> 0, some-> 0, cond-> 0, doto 0, ->> :last, some->> :last, cond->> :last})

(def value-threads
  "The threading macros whose value is their last step's -- every one but `doto`, which returns its seed."
  (disj (set (keys threading-slots)) 'doto))

(def higher-order-fns
  "Core functions that take a function first and collections after, so taint in a collection reaches the
  function's first parameter. Only this shape is modelled; `reduce`, `swap!` and `update` put the function
  elsewhere and are left alone."
  '#{map mapv mapcat filter filterv remove keep keep-indexed run! some every? not-any?
     sort-by group-by partition-by take-while drop-while})

(def executes-first-arg
  "Combinators that execute the function in their first position *right now*: `(apply check args)` has run the
  check. A genuine call edge, counted when asking whether an endpoint executes something. Matched by name, so
  `m/mapply` and any alias count."
  #{"apply" "mapply"})

(def wraps-first-arg
  "Combinators that *produce* a function which executes their first argument if it is ever called. `(partial
  check x)` has not run the check, and may never. Findings are reviewed by people and models, and a missing
  check hidden by a speculative edge costs more than a spurious finding, so these widen what is reachable *from*
  but do not count as execution. Matched by name."
  #{"partial" "fnil" "complement" "memoize"})

(def wraps-every-arg
  "As [[wraps-first-arg]], for combinators whose every argument is wrapped. Matched by name."
  #{"comp" "juxt" "some-fn" "every-pred"})

(def request-param-names
  "Parameter names that hold a Ring request. A name heuristic, but narrow and reliable in a Ring codebase, and it
  only ever *adds* a trust boundary. Needed because `defendpoint` is not the only entry point."
  #{"request" "req"})

(def ring-request-keys
  "Destructuring keys distinctive to a Ring request map, so `(fn [{:keys [query-string]} respond raise] ...)` is
  recognized as a handler even though it never names the request."
  #{"query-string" "query-params" "form-params" "body-params" "path-params" "uri" "request-method"})

(def authz-names
  "The codebase's authorization vocabulary -- the throwing checks. `read-check` and `write-check` fetch and return
  the object, so the check is the fetch."
  #{"read-check" "write-check" "create-check" "update-check" "check-superuser" "check-403"
    "check-data-analyst" "can-read?" "can-write?" "check-has-application-permission"
    ;; see [[owner-scoped-query]]
    "owner-scoped-query"})

(def current-user-refs
  "How code names the current user: the dynamic vars the session middleware binds, and the accessor. A call
  handed one of these alongside an id is scoped to that user -- `(t2/select-one :model/Bookmark :card_id id
  :user_id api/*current-user-id*)`, `(delete-bookmark! model id api/*current-user-id*)` -- which authorizes the
  id by construction: the query cannot reach another user's row. Matched by the symbol's name."
  #{"*current-user-id*" "*current-user*" "current-user-id"})

(def owner-scoped-query
  "The pseudo-function an owner-scoped call is recorded as reaching, so a rule that asks whether an endpoint
  reaches an authorization sees one. Not a real var; it is in [[authz-names]]."
  'dev.security-lint/owner-scoped-query)

(def not-a-scope
  "Calls that take the current user without scoping anything by it, by the head's namespace alias or name:
  logging, events, analytics, and inserts -- a row created *by* the user is owned by them, but that authorizes
  none of the other values in it. A log line that mentions the user and an id has authorized nothing."
  #"^(log|logf|events?|analytics|snowplow|track|metrics|prometheus|audit|tracing|span|insert)")

(def not-a-scope-fns
  "Core functions that build or read data rather than query it: `(assoc info :executed-by *current-user-id*)`
  scopes nothing. Matched by name."
  '#{assoc assoc-in dissoc merge merge-with conj cons into hash-map array-map vector list str format
     select-keys update update-in get get-in contains? = not= and or when when-not if if-not cond case
     partial constantly identity apply mapv map filter remove keep some every? vec set seq first
     hash-set sorted-map zipmap juxt comp reduce keyword name symbol pr-str prn println})

(def visibility-filter-prefixes
  "How list endpoints authorize: helpers that restrict a query to what the current user may see --
  `collection/visible-collection-filter-clause`, `perms/visible-table-filter-select`, `users-rest.db/has-visible-card?`,
  `warehouses-rest.db/active-visible-tables-for-databases`. Matched by prefix, not by the substring `visible`:
  `user-visible-columns` picks display columns and `lib/visible-columns` is query metadata."
  ["visible-collection" "visible-table" "has-visible-" "active-visible-"])

(def entry-forms
  "Macros whose whole form is a place execution starts on its own, by kind.

  These extend *reachability*, not taint: a Quartz job or a queue consumer runs without a request, so its
  parameters are not attacker input, but the code it reaches is live and a finding there is real."
  {"defjob"               :job
   "def-listener!"        :mq
   ;; Toucan lifecycle hooks fire on every write to the model, from anywhere
   "define-before-insert" :lifecycle
   "define-after-insert"  :lifecycle
   "define-before-update" :lifecycle
   "define-after-update"  :lifecycle
   "define-before-delete" :lifecycle
   "define-after-delete"  :lifecycle
   "define-after-select"  :lifecycle
   ;; a setting's :setter, :getter and :on-change run when the framework decides; its default runs at load
   "defsetting"           :setting})

(def live-body-forms
  "Forms whose method bodies are live code with no caller the graph can attribute: a record's or type's protocol
  implementations, and protocol extensions. They are tagged `:protocol` rather than left unreachable. Modelling
  protocol dispatch properly -- so that `(proto/m x)` reaches each implementation, as a multimethod call does --
  is the more precise option and would also carry taint; it is not done here."
  #{"defrecord" "deftype" "extend-protocol" "extend-type" "reify"})

(def not-run-at-load
  "Heads whose body a top-level `def` merely *wraps* rather than runs: `(def x (delay ...))` computes nothing
  at load. Everything else a top-level `def` calls happens when the namespace loads, which for this codebase is
  startup."
  '#{fn fn* delay lazy-seq memoize comp partial future promise})

(def definition-forms
  "Top-level forms that define rather than run. A top-level call whose head is none of these -- and none of the
  entry forms above -- executes when the namespace loads."
  #{"ns" "comment" "declare" "defmacro" "defmulti" "defprotocol" "definterface" "defonce"
    "import" "require" "set!" "derive" "alter-meta!"})

(def entry-fn-names
  "Function names that are entry points: the process starts here."
  {"-main" :startup})

(def entry-fn-meta
  "Metadata on a `defn` name that marks it an entry point. `(defn ^:command migrate ...)` is dispatched by
  `metabase.cmd` from the command line."
  {:command :cli})

(def entry-multimethods
  "Multimethods whose implementations are entry points. An event handler is a `defmethod` on `publish-event!`;
  the event may be fired by a job or another handler with no request anywhere behind it."
  '{metabase.events.impl/publish-event! :event
    metabase.events.core/publish-event! :event})

(def numeric-schema-names
  "Malli schemas, by the name they are written with, that pin a request value to a number. A `defendpoint`
  parameter under one of these cannot be a string, a map or a vector in production, where those schemas are
  enforced -- unlike `mu/defn` annotations, which are compiled out. What is not here is treated as untyped for
  the rules that care about a value's *shape*: Toucan 2 reads a non-number in its pk position as a query."
  #{"PositiveInt" "IntGreaterThanZero" "IntGreaterThanOrEqualToZero" "Int" "PositiveNum" "NonNegativeInt"
    "NegativeInt" "pos-int?" "int?" "nat-int?" "integer?" "number?" "double?" "float?" "neg-int?" "IntString"
    "BooleanValue" "MaybeBooleanValue" "boolean?"})

(def numeric-schema-keywords
  "As [[numeric-schema-names]], for the keyword schemas. Booleans are here too: what these sets answer is
  \"can this value be a string, a keyword, a map or a vector\", and a boolean cannot."
  #{:int :double :float :pos-int :nat-int :neg-int :boolean})

(def string-schema-names
  "Malli schemas that pin a request value to a string. A string is a bound parameter inside a HoneySQL clause and
  cannot be a clause itself, but it *is* raw SQL in Toucan's pk position and a live pattern in `LIKE`, so the
  rules that distinguish strings from structure ask for this separately."
  #{"NonBlankString" "string?" "UUIDString" "Email" "TemporalString" "JSONString" "ValidPassword"
    "BooleanString" "URL" "KeywordOrString"})

(def string-schema-keywords
  "As [[string-schema-names]], for the keyword schemas."
  #{:string :uuid :keyword})

(def string-id-keys
  "Columns named like an id that hold a string: NanoIDs, foreign systems' identifiers, OAuth client ids. Every
  other `*_id` column in the application database is an integer key, see [[id-key?]]."
  #{"entity_id" "external_id" "remote_id" "client_id" "public_uuid" "channel_id" "message_id" "session_id"
    "conversation_id" "correlation_id" "request_id" "trace_id" "span_id" "job_id" "run_id" "task_id"})

(def scalar-setting-types
  "`defsetting` `:type`s whose getter returns a number, a boolean or an instant, coerced from whatever the store
  holds: a value of one of these carries no shape a rule about SQL structure, paths or hosts cares about."
  #{":integer" ":positive-integer" ":double" ":boolean" ":timestamp"})

(def session-keys
  "Keys the session middleware writes into the request map, typed by the middleware and not by the client:
  the user's id and flags. `(:metabase-user-id request)` is an integer whatever the request said."
  #{:metabase-user-id :is-superuser? :is-group-manager? :is-data-analyst? :metabase-session-id})

(defn id-key?
  "Whether `k` names an integer id column: `:id`, `:card_id`, `:table-id`, and not one of [[string-id-keys]].
  A value read under such a key straight off a row is a number, whatever the rest of the row holds -- it cannot
  be a clause, a wildcard or a raw query. Only a *stored* row, though: a request map's `:card_id` is whatever the
  client sent, and a key inside a JSON column is whatever the document holds."
  [k]
  (boolean (and (keyword? k)
                (let [n (name k)]
                  (and (re-find #"(^|[-_])id$" n)
                       (not (contains? string-id-keys n)))))))

(def numeric-local-name
  "Locals that are numbers by the naming convention of this codebase: `card-id`, `ids`, `idx`, `n`, `limit`,
  `offset` -- and booleans, `archived?`, `is-superuser?`, which are scalars as much as numbers are. Under the `:any-local` policy, which assumes nothing about where a value came from, these are still
  not dynamic in the sense the shape rules mean: a collection-location path built from `collection-id` carries
  no wildcard, and `[:= :id user-id]` binds a parameter."
  #"(^|-)ids?$|^(pid|i|j|k|n|idx|index|offset|limit|count|cnt|size|len|page)$|\?$|^\*?(is-superuser|current-user-id)\*?$")

(defn numeric-local-name?
  "Whether a local's name says it holds a number, see [[numeric-local-name]]."
  [nm]
  (boolean (and nm (re-find numeric-local-name (name nm)))))

(def scalar-coercions
  "Calls that turn a value into a number: `(long id)`, `(u/the-id card)`. Past one of these a value cannot be a
  HoneySQL clause, a keyword or a raw SQL string, so the rules about a value's shape stop at them. `str` is
  deliberately absent from this list: a string is a bound parameter inside a HoneySQL clause, but it is *raw SQL*
  in Toucan's pk position, so each rule says which it accepts."
  '#{long int integer bigint parse-long the-id parse-int})

(def disclosing-ex-data-keys
  "Keys in an `ex-info` data map whose value is a definition rather than an identifier. `api-exception-response`
  returns ex-data as the response body, so each of these is what a 403 or a 500 hands to the caller."
  #{":query" ":sql" ":native" ":dataset_query" ":dataset-query" ":preprocessed" ":compiled" ":params"
    ":card" ":details" ":native-query" ":query-string" ":definition"})

(def model-writers
  "Toucan 2 calls that change the application database. A GET endpoint reaching one of these has a side effect
  the method promises it does not."
  '#{toucan2.core/update! toucan2.core/insert! toucan2.core/insert-returning-instance!
     toucan2.core/insert-returning-instances! toucan2.core/insert-returning-pk! toucan2.core/insert-returning-pks!
     toucan2.core/delete!})

(def authenticating-wrappers
  "Router wrapper names that establish who the caller is before the handler runs. A namespace mounted under none
  of these serves its endpoints to anyone."
  #"^\+(auth|static-apikey|check-)")

(def credential-params
  "Parameter names that mean an endpoint verifies a secret. Guessing one is what a throttle prevents."
  #"(?i)\b(password|old[-_]password|new[-_]password|otp|mfa[-_]code|reset[-_]token)\b")

(def propagation-sanitizers
  "Calls whose result carries no attacker *structure*, so taint stops at them when it is propagated across
  functions: the quoting functions in [[sanitizers]], the `LIKE` escapers, the numeric coercions, the
  validating assertions, and an allow-list lookup of a model (`entity->model`). What comes
  out of `(h2x/like-substring q)` is a string the search code can hand to the next function as a pattern; if the
  next function spliced it into `[:raw ...]` that would be a finding this list hides, and that flow does not
  exist in this codebase. Rules still apply their own, narrower lists at the sink."
  (into sanitizers (concat [#"^like-" #"^wildcard-" #"->model$" assertion-validator] scalar-coercions)))

(def origin-functions
  "Functions whose result crossed a trust boundary, by fully qualified symbol, and the label the result carries.

  This is the stored-data counterpart of `defendpoint`: taint starts at the *read*, not at any column. Everything
  that comes back from the application database was written by some user; everything a driver describes or
  returns was written by whoever can write to the warehouse; everything fetched or parsed came from outside. Which
  columns are dangerous is the sink's question, and the sinks already ask it -- `[:raw x]` cares whether `x` is a
  literal, `[:inline x]` whether it was coerced, `[:like _ x]` whether it was escaped -- so no column is named
  here and none will need to be. A function not in this list, whose result is external data all the same, says so
  with `^{:taint/source :warehouse}` on its own definition; see [[origin-prefixes]] for the Toucan family."
  '{toucan2.core/query                          :app-db
    toucan2.core/query-one                      :app-db
    toucan2.core/hydrate                        :app-db
    toucan2.core/reducible-query                :app-db
    metabase.api.common/read-check              :app-db
    metabase.api.common/write-check             :app-db
    metabase.driver/describe-database           :warehouse
    metabase.driver/describe-table              :warehouse
    metabase.driver/describe-fields             :warehouse
    metabase.driver/describe-fks                :warehouse
    metabase.driver/describe-table-fks          :warehouse
    metabase.driver/describe-indexes            :warehouse
    metabase.driver/describe-table-indexes      :warehouse
    metabase.driver/table-rows-seq              :warehouse
    metabase.driver/execute-reducible-query     :warehouse
    metabase.driver/execute-write-query!        :warehouse
    metabase.query-processor/process-query      :warehouse
    metabase.query-processor/userland-query     :warehouse
    clojure.java.jdbc/query                     :warehouse
    next.jdbc/execute!                          :warehouse
    next.jdbc/execute-one!                      :warehouse
    next.jdbc/plan                              :warehouse
    clj-http.client/get                         :external
    clj-http.client/post                        :external
    clj-http.client/put                         :external
    clj-http.client/request                     :external
    metabase.util.http/fetch-bytes              :external
    metabase.util.http/*fetch-as-json*          :external
    clojure.data.json/read                      :file
    clojure.data.json/read-str                  :file
    clojure.edn/read-string                     :file
    clj-yaml.core/parse-string                  :file})

(def origin-prefixes
  "As [[origin-functions]], for a family matched by prefix: every `toucan2.core/select*` is a read of the
  application database, however the result is shaped."
  [["toucan2.core/select" :app-db]
   ["toucan2.core/reducible-select" :app-db]])

(def origin-meta-key
  "Metadata on a `defn`, `mu/defn` or `defmulti` name declaring that its result crossed a boundary:
  `(defmulti ^{:taint/source :warehouse} describe-table ...)`. Multimethod dispatch is resolved by the graph, so a
  marker on the `defmulti` covers every implementation. The one in-code annotation this analysis asks for, and
  only where inference cannot reach: a function that assembles external data from something not in the list."
  :taint/source)

(def resolved-sanitizers
  "Sanitizers matched by fully qualified symbol rather than by name, because the name alone says the opposite:
  `honey.sql/format` binds every value as a parameter and quotes every identifier, while `clojure.core/format`
  is the injection primitive. Resolved by clj-kondo in the engine and honoured by propagation and at sinks."
  '#{honey.sql/format honey.sql/format-expr honey.sql/format-entity})

(def credential-bearing-models
  "Models whose rows carry a credential in some column -- connection details, secrets, keys, password hashes,
  tokens -- and the names a whole row of each is bound to in this codebase. An origin label says a value
  *derives* from such a row, which an id or a status does too; the name is what says the value is the row.
  A whole row in a log line or an error body is a leak."
  {"Database"     #{"db" "database" "the-db"}
   "Secret"       #{"secret"}
   "ApiKey"       #{"api-key"}
   "AuthIdentity" #{"auth-identity" "identity"}
   "User"         #{"user"}
   "Session"      #{"session"}
   "Channel"      #{"channel"}
   "OAuthAccessToken"  #{"token" "access-token"}
   "OAuthRefreshToken" #{"token" "refresh-token"}
   "OAuthClient"       #{"client"}})

(defn credential-row?
  "Whether `sym` is a whole row of a credential-bearing model: its origins name the model, and it is bound to the
  model's conventional name."
  [sym origins]
  (let [nm (-> (name sym) (clojure.string/replace #"^the-|-row$|\*$" ""))]
    (boolean (some (fn [o]
                     (and (= "app-db" (namespace o))
                          (contains? (get credential-bearing-models (name o) #{}) nm)))
                   origins))))

(def credential-name
  "Names that suggest the value *is* a credential.

  Anchored at the end, which is what separates `llm-anthropic-api-key` from `openai-max-tokens-per-batch` and
  `slack-token-valid?`: a name that merely mentions a credential usually describes it -- a count, a flag, an
  expiry -- rather than holding one. Deliberately does not include `auth`, which matches far too much.

  `token` is singular only. In this codebase `tokens`, `input-tokens` and `:tokens` are LLM usage counts, never a
  list of credentials; the other plurals stay, since a logged `api-keys` really is a list of them."
  #"(?i)((password|passwd|secret|api[-_]?key|private[-_]?key|credential|access[-_]?key)s?|token)$")

(def quantity-word
  "Words that make the name a measurement of credentials rather than one. `llm-max-tokens` counts LLM tokens."
  #"(?i)\b(max|min|num|count|limit|size|length|batch|per|total|window)\b|[-_](max|min|num|count|limit|size|length|batch|per|total|window)[-_]?")

(defn credential-name?
  "Whether `x` (a keyword, symbol or string) is named like a credential and not like a count of them."
  [x]
  (boolean (and x
                (re-find credential-name (name x))
                (not (re-find quantity-word (name x))))))

(def object-checks
  "Authorization checks that take the object, or its id, that they authorize -- matched by name, since they are
  spelled through several aliases and several namespaces. A value handed to one of these is *checked*, and so is
  the value one of them returns (`read-check` fetches and returns the object). `check-superuser` and
  `check-has-application-permission` are deliberately absent: they authorize the caller, not an object.

  The names are broad on purpose -- `user-has-permission-for-table?`, `check-tenant-groups-visible!` -- so that a
  spelling this list has not seen marks a value checked rather than reports it unchecked. A missing check is a
  finding; a check the list did not recognize would be a false one."
  #"^(read|write|create|update|query)-check$|^can-(read|write|create|update|query|run|execute)\??$|^user-has-permission-for-|^check-.*(visible|owner|manager|access|perm|self)|^has-.*-perm|^can-.*-perm|-perms?[?!]?$|^visible-|^has-visible-|^active-visible-")

(def privileged-models
  "Models whose columns decide who may do what, or hold a secret: a whole map written into one of these sets
  `is_superuser`, a permission value, a credential, a session's user. The data-access layer forwards a `changes`
  map into every model -- that is what it is for -- so [[dev.security-lint.rules.models/mass-assignment]] reports
  it there only for these; a Table written from warehouse metadata is sync, a MetabotMessage from an LLM is the
  conversation."
  #{"User" "AuthIdentity" "Session" "ApiKey" "Secret" "Setting" "Database"
    "Permissions" "DataPermissions" "PermissionsGroup" "PermissionsGroupMembership"
    "PermissionsRevision" "ApplicationPermissionsRevision" "CollectionPermissionGraphRevision"
    "Tenant" "SupportAccessGrant" "OAuthClient" "Sandbox" "ConnectionImpersonation"})

(def model-parents
  "What authorizes a write to a model besides a check on the model itself: a Card is written by whoever may write
  its Collection, a DashboardCard by whoever may write the Dashboard, a Transform by whoever may run transforms
  on its source Database. A write whose only check was on a model in neither column was checked against the
  wrong object."
  {"Card"          #{"Collection" "Dashboard"}
   "Dashboard"     #{"Collection"}
   "DashboardCard" #{"Dashboard"}
   "DashboardTab"  #{"Dashboard"}
   "Document"      #{"Collection"}
   "Collection"    #{"Collection"}
   "Segment"       #{"Table"}
   "Measure"       #{"Table"}
   "Field"         #{"Table" "Database"}
   "Table"         #{"Database"}
   "Transform"     #{"Database"}
   "TransformJob"  #{"Transform"}
   "PersistedInfo" #{"Card" "Collection"}
   "Timeline"      #{"Collection"}
   "TimelineEvent" #{"Timeline" "Collection"}
   "Notification"  #{"Card" "Dashboard"}
   "Pulse"         #{"Collection"}
   "Action"        #{"Card" "Collection"}
   "Sandbox"       #{"Table" "PermissionsGroup"}})

(ns dev.security-lint.rules.honeysql
  "HoneySQL forms that render a value as SQL text rather than binding it as a parameter.

  These are the shapes behind most of the SQL findings in the security tracker: a `[:raw ...]` around a stored
  column type, a `(name unit)` spliced for a unit nobody validated, a `LIKE` pattern built with `str`, a value in
  Toucan's pk-or-query position that arrived as a string. The application database has a runtime guard for the
  first of these (`metabase.app-db.honeysql-guard`); the warehouse compile path has nothing, which is where these
  rules carry the weight.

  Most run under the `:any-local` taint policy on purpose. The value that reached the sink in the real incidents
  was a warehouse column name or a saved card's option, not the request that triggered the query, and the graph
  cannot see those sources. Request taint is still consulted, to grade a request-reachable value as an error
  above a merely dynamic one."
  (:require
   [clojure.string :as str]
   [dev.security-lint.ast :as ast]
   [dev.security-lint.rule :refer [defrule]]
   [dev.security-lint.taint :as taint]
   [dev.security-lint.vocabulary :as vocab]
   [rewrite-clj.node :as n]))

(set! *warn-on-reflection* true)

(defn- crosses-boundary?
  "Whether `node` carries a value from across a trust boundary -- a request, the application database, a
  warehouse, an external service -- whatever policy the rule itself runs under."
  [ctx node & [opts]]
  (taint/tainted? (assoc ctx :locals (:boundary-locals ctx)) node opts))

(def ^:private coercion-sanitizers
  "The default sanitizers plus the numeric coercions: past `(long x)` a value is a number whatever it was."
  (into vocab/sanitizers vocab/scalar-coercions))

(defn- client-shaped?
  "Whether the local inside `(name x)` carries an untyped request label: the client chose its shape."
  [ctx node]
  (let [a (some-> (ast/arg (ast/unmeta node) 0) ast/unmeta)]
    (boolean (and a (contains? (get (:labels ctx) ((juxt :row :col) (meta a))) :request/untyped)))))

(defn- temporal-unit-name?
  "`(name unit)` in a driver's date implementation: the temporal bucketing units are an MBQL enum, validated by
  the query schema before any driver sees one, and every `sql.qp/date` implementation splices the unit's name.
  Judged by the local's name; the schema is not visible from here."
  [node]
  (let [node (ast/unmeta node)]
    (boolean (and (ast/call? node) (= "name" (some-> (ast/head-sym node) name))
                  (let [a (some-> (ast/arg node 0) ast/unmeta)]
                    (and a (ast/symbol-node? a) (re-find #"unit$" (ast/->str a))))))))

(defrule honeysql-raw-from-dynamic
  {:name        "Raw SQL spliced from a dynamic value"
   :description (str "A `[:raw ...]` form renders its argument as SQL text with no quoting and no parameter "
                     "binding. When the argument is a plain value the code did not build -- a warehouse column "
                     "type, a saved question's unit, a transform target name -- it carries whatever reached it. "
                     "Each of those has been the payload in a warehouse SQL injection.")
   :remediation (str "Bind the value as a parameter, quote it as an identifier with `h2x/identifier`, or "
                     "validate it against an allow-list and mark the form `^:allow-raw-sql` to say so -- the "
                     "same marker the application-database guard requires.")
   :severity    {:tainted :error :otherwise :warning}
   :precision   :medium
   :cwe         "CWE-89"
   :taint-policy :any-local
   :vector-triggers #{:raw}}
  [{:keys [node marks] :as ctx}]
  (let [arg (second (ast/children node))]
    ;; A value that went through some other function -- `(datepart-token unit)`, `(u.date/format t)` -- has been
    ;; mapped or rendered, and is left to that function; only a value spliced as it is counts.
    (when (and arg
               (not (contains? marks :allow-raw-sql))
               ;; unless the unit is the client's, sent in whatever shape
               (not (and (temporal-unit-name? arg) (not (client-shaped? ctx arg))))
               (taint/raw-value? ctx arg {:sanitizers coercion-sanitizers}))
      {:tainted? (crosses-boundary? ctx arg {:sanitizers coercion-sanitizers})
       :message  (str ":raw renders a dynamic value as SQL text: " (ast/->str arg))})))

(def ^:private inline-arithmetic
  "Heads that produce a number: past one of these an inlined value cannot be a string."
  (into coercion-sanitizers '[+ - * / inc dec count math/pow pow bit-shift-left indexOf .indexOf]))

(defrule honeysql-inline-from-dynamic
  {:name        "Value inlined into SQL whose type the code does not pin"
   :description (str "`[:inline x]` writes `x` into the SQL text instead of binding it. A number inlines safely; "
                     "a string is written between single quotes with no escaping, so a quote inside it ends the "
                     "literal. The application-database guard rejects a non-numeric inline at runtime; the "
                     "warehouse path has no such check.")
   :remediation "Inline only a value coerced to a number -- `[:inline (long n)]` -- and bind anything else."
   ;; Reported for a value that crossed a boundary and may be a string: a request value no schema pins to a
   ;; number, a stored value that is not an id column. Every plain local once counted under `:any-local`, and
   ;; that reported 22 offsets, limits and indexes in driver query compilers whose type the MBQL schema pins.
   :severity    :warning
   :precision   :low
   :cwe         "CWE-89"
   :vector-triggers #{:inline}}
  [{:keys [node marks] :as ctx}]
  (let [arg (second (ast/children node))]
    (when (and arg
               (not (contains? marks :allow-raw-sql))
               (taint/raw-value? (assoc ctx :locals (:untyped-locals ctx)) arg {:sanitizers inline-arithmetic}))
      {:message (str ":inline writes a value of unknown type into SQL: " (ast/->str arg))})))

(def ^:private clause-keys
  "HoneySQL keys whose value is a clause, not a value."
  #{:union :union-all :intersect :except :where :from :select :select-distinct :nest :having :with :join
    :left-join :right-join :inner-join :order-by :group-by :with-recursive})

(defrule blessed-honeysql-with-dynamic-leaf
  {:name        "Blessed HoneySQL clause with an uncoerced dynamic leaf"
   :description (str "A clause marked `^:allow-subquery`, `^:allow-raw-sql` or `^:mb/interpret-as-query-syntax` "
                     "is trusted whole by the application-database guard, nested leaves included. A leaf that is "
                     "a plain local is then whatever it was -- a keyword, a vector, a map -- and HoneySQL renders "
                     "each of those as SQL structure rather than as a value.")
   :remediation (str "Coerce every dynamic leaf to a provable scalar inside the blessed clause: `(long id)`, "
                     "`(u/the-id card)`, `(str name)`. The coercion is what makes the blessing safe.")
   ;; Reported only for a leaf that may *be* a clause: a request value whose schema pins it to neither a number
   ;; nor a string, or a stored value that is not an id. The runtime guard still rejects a nested map, `:raw` or
   ;; `:inline` inside a blessed clause, so what slips is a keyword leaf. Every plain local once counted under
   ;; `:any-local`, and that reported 149 clauses -- `[:= :id user-id]`, which binds a parameter, and
   ;; `{:union-all queries}`, which is what the marker is for -- with no leaf a caller could make a keyword among
   ;; them. A warning, not an error: the current user's id and flags are request values to the graph too.
   :severity    :warning
   :precision   :low
   :cwe         "CWE-89"
   :mark-triggers #{:allow-subquery :allow-raw-sql :mb/interpret-as-query-syntax}}
  [{:keys [node] :as ctx}]
  ;; `str` counts as a coercion here: a string leaf is bound as a parameter. It is the one place it does.
  (let [sanitizers (conj coercion-sanitizers 'str 'boolean 'double)
        ;; `{:union-all queries}`, `{:where clause}`: a local that *is* a clause, in a clause's position -- what
        ;; the marker exists to allow. A call -- `(visible-collection-filter-clause ...)` -- returns a clause by
        ;; construction. Only a plain local in a value position is a leaf that may be a clause by accident.
        clause-values (into #{} (for [m     (ast/find-nodes ast/map-node? node)
                                      [k v] (ast/map-entries m)
                                      :when (and (ast/keyword-node? k) (contains? clause-keys (n/sexpr k)))]
                                  ((juxt :row :col) (meta (ast/unmeta v)))))
        leaves     (->> (taint/tainted-leaves (assoc ctx :locals (:structured-locals ctx)) node {:sanitizers sanitizers})
                        (remove ast/call?)
                        (remove #(contains? clause-values ((juxt :row :col) (meta %)))))]
    (when (seq leaves)
      {:message (str "Blessed clause trusts a leaf that may be a clause: "
                     (str/join ", " (distinct (map ast/->str leaves))))})))

(def ^:private value-accessors
  "Calls that fetch a value out of something rather than build one: `(:id body)`, `(get-in body [:card :id])`.
  The positional argument this rule cares about is a plain value like these or a bare local; a map or vector
  written in place is a query the author meant, and goes through the runtime guard."
  '#{get get-in first second nth str})

(defn- positional-arg
  "The pk-or-query argument of a Toucan call, when it is a plain value; nil for the keyword-value form and for a
  query the author built in place.

  `(t2/select-one :model/Card x)` and `(t2/update! :model/Card x {...})` hand `x` to Toucan as the primary key
  if it is a number and as the *query* otherwise; `(t2/select-one :model/Card :id x)` is a where clause."
  [node]
  (let [a (ast/arg node 1)]
    (when (and a
               (or (ast/symbol-node? a)
                   (let [h (ast/head-sym a)]
                     (or (and (ast/call? a) (ast/keyword-node? (first (ast/children a))))
                         (and h (contains? value-accessors (symbol (name h))))))))
      a)))

(defrule toucan-positional-arg-from-request
  {:name        "Request value in Toucan's pk-or-query position"
   :description (str "The argument after the model in a Toucan 2 call is the primary key when it is a number and "
                     "the query when it is anything else -- a string is executed as SQL. A request value whose "
                     "schema does not pin it to a number can be either, and the caller chooses.")
   :remediation (str "Declare the parameter with an integer schema, or coerce it with `u/the-id` or `long` "
                     "before the call.")
   ;; A warning rather than an error, and a deliberate one: `mu/defn` schemas are compiled out of production
   ;; builds (see `metabase.util.malli.fn/instrument-ns?`), so a `:- ::lib.schema.id/card` on a `db.clj` helper
   ;; pins nothing there and this rule does not credit it -- only a `defendpoint` schema, or a `mu/defn` in a
   ;; namespace marked `^:instrument/always`.
   :severity    :warning
   :precision   :medium
   :cwe         "CWE-89"
   :triggers    #{toucan2.core/select toucan2.core/select-one toucan2.core/select-one-fn toucan2.core/select-fn-set
                  toucan2.core/select-fn-vec toucan2.core/select-one-pk toucan2.core/select-pks-set
                  toucan2.core/select-pks-vec toucan2.core/select-fn->fn toucan2.core/select-pk->fn
                  toucan2.core/update! toucan2.core/delete! toucan2.core/exists? toucan2.core/count
                  toucan2.core/hydrate}}
  [{:keys [node untyped-locals] :as ctx}]
  (when-let [a (positional-arg node)]
    ;; `(str x)` is not a coercion here: a string in this position is raw SQL
    (when (taint/tainted? (assoc ctx :locals untyped-locals) a {:sanitizers coercion-sanitizers})
      {:tainted? true
       :message  (str "Toucan reads a non-numeric value here as a query: " (ast/->str a))})))

(defrule like-pattern-from-dynamic
  {:name        "LIKE pattern built from a dynamic value"
   :description (str "The right-hand side of `LIKE` is a pattern. A search string placed into it unescaped keeps "
                     "its own `%` and `_` live, and a handful of interior wildcards make the database's matcher "
                     "backtrack for seconds per row: an 8-byte query parameter cost 31 seconds of server thread.")
   :remediation "Build the pattern with `h2x/like-pattern` or `h2x/like-substring`, which escape the value."
   ;; A warning even when a request value reaches it: measured over this codebase, half of those were collection
   ;; location paths built from ids, or a value escaped in a caller through `(map h2x/like-substring ...)`, which
   ;; the taint model does not follow. The shape is right often enough to report, not to fail a build on.
   :severity    {:tainted :warning :otherwise :note}
   :precision   :medium
   :cwe         "CWE-1333"
   ;; migrations match their own constants
   :exempt-files [#"app_db/custom_migrations"]
   :taint-policy :any-local
   :vector-triggers #{:like :ilike :not-like :not-ilike}}
  [{:keys [node] :as ctx}]
  ;; `location-path` and `children-location` build a collection path -- `/1/2/` -- from ids, which carries no
  ;; wildcard however it is used.
  (let [sanitizers (into coercion-sanitizers [#"^like-" #"-like$" #"^wildcard-" #"location"])
        pattern    (last (ast/children node))
        ;; a collection location or a permission path is ids and slashes: `location-prefix`, `path-form`,
        ;; `children-location` carry no wildcard whatever built them
        path-name? (fn [leaf] (re-find #"location|prefix|^path" (ast/->str leaf)))
        ;; `(format "/%d/%%" id)`: every placeholder is numeric, so the value cannot carry a wildcard
        numeric-format? (fn [nd]
                          (and (ast/call? nd) (= "format" (some-> (ast/head-sym nd) name))
                               (when-let [lit (some-> (ast/arg nd 0) ast/unmeta ast/string-value)]
                                 (and (re-find #"%d" lit) (not (re-find #"%[^d%]" lit))))))]
    (when (and pattern
               (not (ast/literal? pattern))
               (not (numeric-format? (ast/unmeta pattern)))
               (seq (remove path-name? (taint/tainted-leaves ctx pattern {:sanitizers sanitizers}))))
      ;; a number cannot carry a wildcard, so graded on the request values not pinned to one
      {:tainted? (taint/tainted? (assoc ctx :locals (:untyped-locals ctx)) pattern {:sanitizers sanitizers})
       :message  (str "LIKE pattern carries a dynamic value unescaped: " (ast/->str pattern))})))

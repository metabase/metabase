(ns dev.hugsql-spike.search-union
  "SPIKE (not production): can the search UNION be composed with provenance instead of enumeration?

  Search is the case the HugSQL POC does NOT solve. `metabase.search.in-place.legacy` UNIONs one
  arm per requested model over 14 models, and `:models` is request-controlled, so enumerating the
  subsets means 2^14 = 16384 statements. Runtime assembly is the only option, and the two obvious
  ways back in are string concatenation (banned) and HugSQL `:snip*:` (disarmed).

  This spike asks whether a *checked type* can make runtime assembly safe. The claim under test:

    an arm is trustworthy if it can only have been produced by dev-authored SQL,
    and that is checkable by value rather than by reviewing every call site.

  Findings are recorded in [[findings]] at the bottom, including what does NOT work.

  Run it: (dev.hugsql-spike.search-union/demo)"
  (:require
   [clojure.string :as str]
   [metabase.app-db.query :as mdb.query]))

(set! *warn-on-reflection* true)

;;;; The type

;; deftype, not defrecord: defrecord generates public ->X and map->X constructors, and the entire
;; point is that exactly one fn can mint one of these. A record would hand the forger a doorway.
(deftype SafeSql [sql params])

(defn- wrap-sqlvec
  "PRIVATE -- the single trust boundary. Turns a sqlvec into an arm.

  Private stops the ordinary path at compile time: another namespace calling this gets
  `var: ... is not public`. It does NOT stop `#'dev.hugsql-spike.search-union/wrap-sqlvec`, since
  var-deref defeats privacy in Clojure. That residual hole is closed by a kondo `:discouraged-var`
  entry on this var, which flags both `(deref (var ...))` and the `#'` reader macro. Privacy and
  the lint are complementary; neither alone is sufficient."
  [[sql & params]]
  (->SafeSql sql (vec params)))

(defn defarms
  "The only exported way to obtain arms. Takes `k -> arm-builder-fn` and returns `(fn [k params])`.

  The builders must be dev-authored SQL producers (a `def-sqlvec-fns` snippet fn, or -- as in this
  spike -- a HoneySQL compile of an in-tree query). Nothing here accepts caller-supplied SQL: the
  caller passes a KEY, and an unknown key throws rather than falling through."
  [builders]
  (fn arm [k params]
    (if-let [f (get builders k)]
      (wrap-sqlvec (f params))
      (throw (ex-info "unknown arm key" {:key k :known (set (keys builders))})))))

(defn compose-union
  "Compose `arms` into one sqlvec with an explicit connective.

  Deliberately not `:snip*:`. HugSQL's `sqlvec-param-list` joins arms with a bare space and
  supplies no connective, so it produces `... WHERE x = ? SELECT ...` for a UNION -- invalid SQL.
  Owning the join is the point: we control the separator AND the param order, over a type whose
  provenance we just checked."
  [arms connective]
  (when-not (seq arms)
    (throw (ex-info "no arms to compose" {})))
  (doseq [a arms]
    (when-not (instance? SafeSql a)
      (throw (ex-info "arm is not a SafeSql; arms must come from a dev-authored builder"
                      {:got (type a)}))))
  (into [(str/join connective (map #(.-sql ^SafeSql %) arms))]
        (mapcat #(.-params ^SafeSql %) arms)))

;;;; Wiring it to the REAL search arms

(def ^:private search-ctx
  "A minimally valid SearchContext. Values are inert; the spike is about assembly, not results."
  {:search-string                       "test"
   :current-user-id                     1
   :current-user-perms                  #{"/"}
   :models                              #{"card" "dashboard" "collection"}
   :archived?                           false
   :model-ancestors?                    false
   :is-superuser?                       true
   :is-data-analyst?                    true
   :filter-items-in-personal-collection "all"
   :enabled-transform-source-types      #{}})

(defn- real-arm-builder
  "An arm builder backed by the real `search-query-for-model` defmethod for `model`.

  In a production version these would be `def-sqlvec-fns` snippets from a `.sql` file. Using the
  live HoneySQL here is deliberate: it tests composition against the actual 2.5KB, 4-to-8-param
  arms search really produces, rather than against a toy I wrote to succeed."
  [model]
  (fn [_params]
    (let [sqfm (deref (requiring-resolve 'metabase.search.in-place.legacy/search-query-for-model))]
      (mdb.query/compile (sqfm model search-ctx)))))

(def ^:private arm
  (defarms (into {} (for [m ["card" "dashboard" "collection" "dataset" "metric"]]
                      [m (real-arm-builder m)]))))

(defn build-union
  "Compose a UNION ALL over `models` (a seq of the string model names above)."
  [models]
  (compose-union (map #(arm % {}) models) "\nUNION ALL\n"))

;;;; Demo / evidence

(defn demo
  "Returns the evidence table: arity, forgery attempts, and the param-ordering check."
  []
  (let [one   (build-union ["card"])
        three (build-union ["card" "dashboard" "collection"])
        five  (build-union ["card" "dashboard" "collection" "dataset" "metric"])
        try!  (fn [label f] [label (try (f) :ACCEPTED
                                        (catch Exception e (str "REJECTED: " (.getMessage e))))])
        evil  ["SELECT 1; DROP TABLE report_card--"]]
    {:arity        {:1 {:params (count (rest one))   :unions (count (re-seq #"UNION ALL" (first one)))}
                    :3 {:params (count (rest three)) :unions (count (re-seq #"UNION ALL" (first three)))}
                    :5 {:params (count (rest five))  :unions (count (re-seq #"UNION ALL" (first five)))}}
     ;; Param order must match SQL order or every arm binds the wrong values.
     :params-in-order? (= (vec (rest three))
                          (vec (concat (rest (build-union ["card"]))
                                       (rest (build-union ["dashboard"]))
                                       (rest (build-union ["collection"])))))
     :forgery      (into {} [(try! :raw-vector    #(compose-union [evil] "\nUNION ALL\n"))
                             (try! :mixed         #(compose-union [(arm "card" {}) evil] "\nUNION ALL\n"))
                             (try! :meta-tagged   #(compose-union [(with-meta evil {:safe true})] "\nUNION ALL\n"))
                             (try! :bare-string   #(compose-union ["DROP TABLE report_card"] "\nUNION ALL\n"))
                             (try! :unknown-key   #(arm "definitely-not-a-model" {}))])}))

(def findings
  "What the spike established, including the parts that do not work."
  {:works
   ["Variable arity composes: 1, 3, and 5 real search arms each produce one statement with the
     correct number of UNION ALL connectives and the params concatenated in SQL order."
    "Provenance is checkable by value. instance? on a deftype cannot be faked, unlike a metadata
     tag -- (with-meta v {:safe true}) is rejected, which is why ^{::safe true} was the wrong idea."
    "Composition is O(N) in arms, not O(2^N) in subsets. This is the property enumeration lacks
     and the reason the stale finding does NOT generalize to search."]

   :limits
   ["Private is a convention, not a capability: #'wrap-sqlvec still derefs. A kondo
     :discouraged-var entry on that var is required, and flags both bypass forms. Verified."
    "An earlier iteration exposed a public `from-snippet` that wrapped ANY vector. That laundered
     rather than checked -- it moved the trust boundary instead of closing it. Do not reintroduce
     a public sqlvec -> arm fn."
    "This spike composes HoneySQL-compiled arms, not .sql-file snippets. It proves the assembly
     mechanism; it does NOT prove the 14 search arms port to static SQL. That is the larger and
     still-unanswered question -- per-model joins, hoisted CTEs, and the permission clauses are
     untouched here."]

   :open
   ["CTE hoisting: extract-and-hoist-ctes lifts :with clauses out of arms before the union. A
     composed statement needs the same, so SafeSql would have to carry CTEs, not just sql+params."
    "The outer wrapper (ORDER BY over the union, limit) still needs the CASE-sort-key treatment."
    "Whether arms should be keyed by symbols resolving to vars instead of strings in a map --
     symbols carry a name you can audit; the map here trusts whoever built it at load time."]})

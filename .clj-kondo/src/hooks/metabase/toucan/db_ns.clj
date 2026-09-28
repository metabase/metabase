(ns hooks.metabase.toucan.db-ns
  "Lint that application database query calls -- Toucan 2's `t2/select`, `t2/query`, `t2/insert!`, `t2/update!`,
  `t2/delete!` and friends, plus the `metabase.app-db.core` wrappers around them such as `mdb/query` and
  `mdb/update-or-insert!` -- live in a module's `db` namespace, i.e. `metabase[-enterprise].<module>.db` (or `metabase.driver.<driver>.db` for
  driver modules). Every other namespace in a module goes through those functions instead of talking to the
  application database directly.

  Registered as an `:analyze-call` hook on each of those functions in `.clj-kondo/config.edn`. The hook
  returns its input unchanged so Kondo's normal analysis of the call (arity, var usage) still runs."
  (:require
   [clj-kondo.hooks-api :as hooks]
   [hooks.common.modules :as modules]))

(def ^:private driver-db-namespace
  "Matches `metabase.driver.<driver>.db`; individual drivers are not modules."
  #"^metabase\.driver\.[^.]+\.db$")

(defn- db-namespace? [config ns-sym]
  (let [ns-str (name ns-sym)]
    (boolean
     ;; Resolve ownership first: a nested `.db` name alone does not make a module.
     (or (when-let [module (modules/module config ns-sym)]
           (= ns-str (str (modules/module-ns-prefix (:metabase/modules config) module) ".db")))
         (re-matches driver-db-namespace ns-str)))))

(defn- test-file?
  "Whether `filename` is in a test source tree. Test namespaces are exempt through the `test-namespaces` group in
  `config.edn`, but helper namespaces like `metabase.sso.test-helpers` don't match that group's pattern."
  [filename]
  (boolean (and filename (re-find #"(?:^|/)test/" filename))))

(def ^:private value-operators
  "Operators whose second argument is a value rather than a column."
  '#{= not= != <> is-distinct-from is-not-distinct-from
     < > <= >= like not-like ilike not-ilike in not-in between not-between})

(defn- marked?
  "Whether `node` is an `[:auto/param v]` marker."
  [node]
  (and (hooks/vector-node? node)
       (= :auto/param (some-> (first (:children node)) hooks/sexpr))))

(defn- distinct-by
  "`coll` with only the first element for each distinct `(f element)`."
  [f coll]
  (->> coll (reduce (fn [[seen acc] x]
                      (let [k (f x)]
                        (if (contains? seen k) [seen acc] [(conj seen k) (conj acc x)])))
                    [#{} []])
       second))

(def ^:private identifier-clauses
  "Clause keys whose entries name a column or a table rather than carrying a value.

  A symbol here is a name, and `metabase.app-db.value-guard` refuses a marker in one, so reporting
  it would ask for a fix that throws at compile. `:order-by` and `:group-by` are included even
  though the guard allows a marker there: it compiles to `ORDER BY ?` and loses the ordering, so
  asking for one is still wrong."
  #{:select :select-distinct :select-top :from :join :left-join :right-join :inner-join :full-join
    :cross-join :update :insert-into :delete-from :returning :with :with-columns :using
    :order-by :group-by :partition-by :window})

(def ^:private expression-entry-clauses
  "Identifier clauses where index 0 of an `[expr alias]` entry is an expression, not a name.

  HoneySQL binds a parameter there -- `SELECT ? AS a` -- so the guard accepts a marker, and mirrors
  this set as `expression-entry-clauses` in `metabase.app-db.value-guard`. Everything after index 0
  is an alias, and a bare entry is a name; the guard refuses a marker in both."
  #{:select :select-distinct :select-top :returning :partition-by})

(defn- comparison-node?
  "Whether `node` is a keyword-headed comparison -- the one shape inside an identifier clause that
  does hold values, as in the computed projection `[[:= :engine v] :is_match]`."
  [node]
  (and (hooks/vector-node? node)
       (let [op (some-> (first (:children node)) hooks/sexpr)]
         (and (keyword? op) (contains? value-operators (symbol (name op)))))))

(declare value-nodes)

(defn- identifier-clause-value-nodes
  "The value slots reachable inside an identifier clause: a subquery's own clauses, and the
  arguments of a comparison. The names themselves are not candidates."
  [node]
  (cond
    (hooks/map-node? node)    (value-nodes node)
    (comparison-node? node)   (value-nodes node)
    (hooks/vector-node? node) (mapcat identifier-clause-value-nodes (:children node))
    (hooks/list-node? node)   (mapcat identifier-clause-value-nodes (:children node))
    :else                     nil))

(defn- expression-entry-value-nodes
  "The value slots of an [[expression-entry-clauses]] clause: index 0 of each `[expr alias]` entry."
  [node]
  (when (hooks/vector-node? node)
    (mapcat (fn [entry]
              (when (hooks/vector-node? entry)
                (when-let [expr (first (:children entry))]
                  ;; Keep the expression AND descend, so a bare symbol is reported and a computed
                  ;; projection or a subquery sitting there has its own values checked.
                  (cons expr (value-nodes expr)))))
            (:children node))))

(defn- clause-value-nodes
  "The value slots of the value under clause key `clause`."
  [clause node]
  (cond
    (contains? expression-entry-clauses clause) (expression-entry-value-nodes node)
    (contains? identifier-clauses clause)       (identifier-clause-value-nodes node)
    :else                                       (value-nodes node)))

(defn- value-nodes
  "The nodes sitting in a value slot of `node`, following the clause shapes a query map uses."
  [node]
  (cond
    ;; A query map -- walk its clause values, not its keys. A clause that names columns or tables
    ;; contributes only what is nested inside it.
    (hooks/map-node? node)
    (mapcat (fn [[k v]]
              (if (hooks/keyword-node? k)
                (clause-value-nodes (hooks/sexpr k) v)
                (value-nodes v)))
            (partition 2 (:children node)))

    (hooks/vector-node? node)
    (let [[head & args] (:children node)
          op            (some-> head hooks/sexpr)]
      (cond
        ;; A marker IS the value slot -- never descend into its payload, or the marked value
        ;; gets reported as though it were bare.
        (marked? node)
        nil

        (contains? #{:and :or :not} op)
        (mapcat value-nodes args)

        ;; `[:= col v]`, `[:in col vs]`, `[:between col lo hi]` -- the first argument is the
        ;; column and the rest are values, whatever the arity. Keep each value AND descend into it,
        ;; so a subquery in a value slot -- `[:in :id {:select ... :where [:= :z z]}]` -- has its
        ;; own values checked too. Descending alone would drop the plain-token case.
        (and (keyword? op) (contains? value-operators (symbol (name op))))
        (mapcat #(cons % (value-nodes %)) (rest args))

        ;; A function-call form -- `[:lower v]` -- or a literal collection -- `[a b]` in an `:in`.
        ;; Both hold values, so yield the children themselves as candidates as well as
        ;; descending, since a token child returns nothing on its own.
        :else
        (mapcat #(cons % (value-nodes %)) (:children node))))

    ;; A clause built conditionally -- `(when flag [:= :col v])`, `(if ... )`, `(cond-> ...)`. The
    ;; value slots are inside, so walk the children rather than stopping. Without this a value
    ;; wrapped in `when` is invisible to the check, which is a false negative in a security lint.
    ;;
    ;; An `assoc` call gets its clause context back: `(assoc q :order-by [[col dir]])` is the same
    ;; clause as `{:order-by [[col dir]]}`, but written outside a map literal, where the walk would
    ;; otherwise fall back to shape alone and report the column and the direction as values.
    ;; `cond->` is covered because the walk descends into the nested `assoc`.
    (hooks/list-node? node)
    (let [children (vec (:children node))
          assoc?   (= 'assoc (some-> (first children) hooks/sexpr))
          ;; index of a clause value -> its clause key
          clauses  (when assoc?
                     (into {} (keep-indexed (fn [i child]
                                              (when (and (hooks/keyword-node? child)
                                                         (contains? identifier-clauses (hooks/sexpr child))
                                                         (< (inc i) (count children)))
                                                [(inc i) (hooks/sexpr child)]))
                                            children)))]
      (mapcat (fn [i child]
                (if-let [clause (get clauses i)]
                  (clause-value-nodes clause child)
                  (value-nodes child)))
              (range)
              children))

    :else nil))

(def ^:private write-fns
  "Calls whose values are written rather than filtered on. A value here is not a where-clause value
  an attacker can turn into SQL structure, and a `define-before-insert` hook may read it before the
  query compiles, so a marker would break it rather than protect anything."
  '#{insert! insert-returning-instance! insert-returning-instances! insert-returning-pk!
     insert-returning-pks! save!})

(defn- read-call?
  "Whether `node` is a query call whose values are filtered on rather than written."
  [node]
  (let [f (some-> (first (:children node)) hooks/sexpr)]
    (not (contains? write-fns (some-> f name symbol)))))

(def ^:private clause-keys
  "Query-map clause keys. A map keyed by these is a query map rather than a map of conditions."
  #{:select :select-distinct :from :where :join :left-join :right-join :inner-join :full-join
    :cross-join :group-by :having :order-by :limit :offset :for :union :union-all :with
    :with-columns :returning :values :set})

(defn- query-map-node?
  "Whether `node` is a query map rather than a map of column/value conditions.

  `(t2/delete! :model/X {:where [:= :k k]})` passes a query map, whose values [[value-nodes]]
  already walks -- treating it as conditions too would report every value twice."
  [node]
  (boolean (some #(and (hooks/keyword-node? %) (contains? clause-keys (hooks/sexpr %)))
                 (take-nth 2 (:children node)))))

(def ^:private changes-map-fns
  "Conditions-map fns whose arglist also ends in a changes map, so a lone trailing map is changes."
  '#{update! update-or-insert!})

(def ^:private conditions-map-fns
  "Calls whose first argument after the model is a map of CONDITIONS rather than a query map.

  `(t2/update! :model/X {:key k} {:v 1})` filters on `k`, so it is a where-clause value -- but it
  reaches the query as a plain map entry rather than a `:where` clause, so neither the query-map
  walker nor the kv-arg walker sees it. It is a shape the sweep leaves in place, so it has to be
  checked here."
  '#{update! update-or-insert! delete!})

(defn- conditions-map-value-nodes
  "The values of a conditions map passed to one of [[conditions-map-fns]]."
  [f args]
  (when (contains? conditions-map-fns (some-> f name symbol))
    (let [after-model (->> args
                           (drop-while #(not (and (hooks/keyword-node? %)
                                                  (= "model" (namespace (hooks/sexpr %))))))
                           rest)]
      ;; Only the map immediately after the model is conditions. A later map is the changes map,
      ;; whose values are written rather than filtered on, and a written value is never marked: a
      ;; column's `:in` transform runs on the marker itself and stores it as data.
      ;; `update!`'s arglist ENDS in the changes map, so its first map is conditions only when
      ;; another argument follows: `(t2/update! model {:v written})` is the two-arity call whose
      ;; single map is CHANGES, so flagging it would ask for a marker that corrupts the write.
      ;; `delete!` has no changes map, so its map is always conditions.
      (when-let [m (when (or (not (contains? changes-map-fns (some-> f name symbol)))
                             (next after-model))
                     (first after-model))]
        (when (and (hooks/map-node? m) (not (query-map-node? m)))
          (mapcat (fn [v]
                    ;; The column comes from the map key, so an operator form here holds only
                    ;; values -- `{:key [:in ks]}` -- exactly as a kv-arg pair does.
                    (if (and (hooks/vector-node? v) (not (marked? v)))
                      (let [[head & op-args] (:children v)
                            op               (some-> head hooks/sexpr)]
                        (if (and (keyword? op) (contains? value-operators (symbol (name op))))
                          (mapcat #(cons % (value-nodes %)) op-args)
                          (cons v (value-nodes v))))
                      (cons v (value-nodes v))))
                  (take-nth 2 (rest (:children m)))))))))

(defn- kv-arg-value-nodes
  "The value nodes of a call written as `:column value` pairs.

  `(t2/select :model/X :locale locale)`. Several of these fns take an argument before the model --
  `(t2/select-one-fn :value :model/X :key k)` -- so the pairs do not start at a fixed offset; they
  start after the `:model/...` keyword. A call that does not name a literal model is not checked.

  A trailing query map is not a pair, and its values are reached by [[value-nodes]] instead. A
  value that is itself an operator form -- `:id [:in ids]` -- has its own values walked, so the
  collection inside is checked rather than the form."
  [args]
  (let [after-model (->> args
                         (drop-while #(not (and (hooks/keyword-node? %)
                                                (= "model" (namespace (hooks/sexpr %))))))
                         rest)]
    (->> after-model
         ;; `partition-all` rather than `partition` so a trailing odd argument (a query map, which
         ;; is not a pair) is still seen and skipped by the keyword-node? test below.
         (partition-all 2)
         (mapcat (fn [[k v]]
                   (when (and v (hooks/keyword-node? k))
                     (if-not (hooks/vector-node? v)
                       [v]
                       (let [[head & op-args] (:children v)
                             op               (some-> head hooks/sexpr)]
                         (cond
                           ;; Already marked -- the marker is the value slot.
                           (marked? v) [v]

                           ;; `:id [:in ids]`. Toucan folds the column in from the pair key, so
                           ;; EVERY argument here is a value -- unlike a query-map clause, where
                           ;; the first argument is the column.
                           (and (keyword? op)
                                (contains? value-operators (symbol (name op))))
                           (mapcat #(cons % (value-nodes %)) op-args)

                           :else (cons v (value-nodes v)))))))))))

(defn- lint-unmarked-values!
  "Register a finding for each argument of the enclosing function that reaches a value slot unmarked.

  Only a symbol is reported. A literal cannot carry a request value, and a value built inside the
  function is out of reach of a check that does not follow it across a call."
  [node]
  (doseq [value (let [args (rest (:children node))
                      f    (some-> (first (:children node)) hooks/sexpr)]
                  ;; The three walkers overlap on some shapes -- a multi-arg operator in a kv-arg
                  ;; reaches both `value-nodes` and `kv-arg-value-nodes` -- so dedupe by source
                  ;; position rather than trying to keep them disjoint.
                  (->> (concat (mapcat value-nodes args)
                               (kv-arg-value-nodes args)
                               (conditions-map-value-nodes f args))
                       (distinct-by #(select-keys (meta %) [:row :col]))))
          :when (and (hooks/token-node? value)
                     (symbol? (hooks/sexpr value))
                     (not (marked? value)))]
    (hooks/reg-finding!
     (assoc (meta value)
            :message (format "`%s` reaches a SQL value slot unmarked. Write it as [:auto/param %s] so it is bound as a parameter."
                             (hooks/sexpr value) (hooks/sexpr value))
            :type :metabase/unsafe-app-db-query))))

(defn lint-query-call
  "Register a `:metabase/t2-query-namespace` finding when a Toucan 2 query call appears outside a `<module>.db`
  namespace."
  [{:keys [node ns filename] :as input}]
  (when (and ns
             (not (db-namespace? (modules/config input) ns))
             (not (test-file? filename)))
    (let [fn-node (first (:children node))]
      (hooks/reg-finding!
       (assoc (meta fn-node)
              :message (format "Application database query calls like `%s` must live in metabase[-enterprise].<module>.db (or metabase.driver.<driver>.db) namespaces"
                               (hooks/sexpr fn-node))
              :type :metabase/t2-query-namespace))))
  ((requiring-resolve 'hooks.metabase.warehouse-schema-overlay.table-or-field-query/lint-read) input)
  (when (and ns
             (db-namespace? (modules/config input) ns)
             (not (test-file? filename))
             (read-call? node))
    (lint-unmarked-values! node))
  input)

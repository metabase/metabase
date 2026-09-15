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
  '#{= not= < > <= >= like not-like ilike not-ilike in not-in})

(defn- marked?
  "Whether `node` is an `[:auto/param v]` marker."
  [node]
  (and (hooks/vector-node? node)
       (= :auto/param (some-> (first (:children node)) hooks/sexpr))))

(defn- value-nodes
  "The nodes sitting in a value slot of `node`, following the clause shapes a query map uses."
  [node]
  (cond
    ;; A query map -- walk its clause values, not its keys.
    (hooks/map-node? node)
    (mapcat value-nodes (take-nth 2 (rest (:children node))))

    (hooks/vector-node? node)
    (let [[head & args] (:children node)
          op            (some-> head hooks/sexpr)]
      (cond
        (contains? #{:and :or :not} op)
        (mapcat value-nodes args)

        (and (keyword? op) (contains? value-operators (symbol (name op))))
        (when (= 2 (count args))
          [(second args)])

        :else
        (mapcat value-nodes (:children node))))

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
    (not (contains? write-fns (symbol (name f))))))

(defn- kv-arg-values
  "The value nodes of the `:column value` pairs a query call takes after its model.

  `(t2/select :model/X :locale locale :archived false)` -- the pairs run to the end of the call, or
  to a trailing query map."
  [args]
  ;; Several of these fns take an argument before the model -- `(t2/select-one-fn :value :model/X
  ;; :key k)` -- so the pairs do not start at a fixed offset. They start after the model, which is
  ;; the `:model/...` keyword.
  (let [after-model (->> args
                         (drop-while #(not (and (hooks/keyword-node? %)
                                                (= "model" (namespace (hooks/sexpr %))))))
                         rest)]
    (->> after-model
         (partition 2 2 nil)
         (keep (fn [[k v]]
                 (when (and v (hooks/keyword-node? k))
                   v))))))

(defn- lint-unmarked-values!
  "Register a finding for each argument of the enclosing function that reaches a value slot unmarked.

  Only a symbol is reported. A literal cannot carry a request value, and a value built inside the
  function is out of reach of a check that does not follow it across a call."
  [node]
  (doseq [value (let [args (rest (:children node))]
                  (concat (mapcat value-nodes args)
                          ;; `:column value` pairs after the model, which Toucan builds into the
                          ;; where clause.
                          (kv-arg-values args)))
          :when (and (hooks/token-node? value)
                     (symbol? (hooks/sexpr value))
                     (not (marked? value)))]
    (hooks/reg-finding!
     (assoc (meta value)
            :message (format "`%s` reaches a SQL value slot unmarked. Write it as [:auto/param %s] so it is bound as a parameter."
                             (hooks/sexpr value) (hooks/sexpr value))
            :type :metabase/unmarked-sql-value))))

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

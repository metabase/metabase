(ns hooks.metabase.toucan.db-ns
  "Lint that Toucan 2 primary keys are passed explicitly, as in `(t2/select-one :model/Card :id id)`, rather than
  bare, as in `(t2/select-one :model/Card id)`.

  Registered as an `:analyze-call` hook on the Toucan 2 query fns in `.clj-kondo/config.edn`. The hook returns its
  input unchanged so Kondo's normal analysis of the call (arity, var usage) still runs.

  This is the `:metabase/t2-implicit-pk` part of master's hook of the same name, backported on its own: the other
  linters master's hook carries (`:metabase/t2-query-namespace`, `:metabase/unsafe-app-db-query`) depend on the
  `<module>.db` layout, which this release branch does not have."
  (:require
   [clj-kondo.hooks-api :as hooks]))

(def ^:private model-index
  "For each Toucan 2 fn that accepts a bare primary key, the index of the model among its arguments."
  '{select                         0
    select-one                     0
    select-pks-set                 0
    select-pks-vec                 0
    select-one-pk                  0
    reducible-select               0
    count                          0
    exists?                        0
    delete!                        0
    update!                        0
    update-returning-pks!          0
    reducible-update               0
    reducible-update-returning-pks 0
    select-one-fn                  1
    select-fn-set                  1
    select-fn-vec                  1
    select-fn-reducible            1
    select-pk->fn                  1
    select-fn->pk                  1
    select-fn->fn                  2})

(def ^:private trailing-changes-fns
  "Fns whose arglist ends in a changes map, so the bare primary key is the second-to-last argument."
  '#{update! update-returning-pks! reducible-update reducible-update-returning-pks})

(def ^:private map-returning-fns
  "Fns whose call returns a map -- or throws, given a string -- so a call to one can never carry a string into
  the query slot."
  '#{assoc assoc-in assoc-some dissoc select-keys update update-in})

(def ^:private seeded-fns
  "Fns that return their first argument when nothing applies, so they return a map only when seeded with one."
  '#{cond-> cond->> -> ->> some-> some->> into})

(def ^:private branching-fns
  "Fns whose result is one of their branches, so they return a map only when every branch is one."
  '#{if if-not if-let if-some when when-not when-let when-some or})

(def ^:private map-asserting-fns
  "`h2x/assert-map-or-nil!`, which throws for anything but a map or nil, so a call to it can never carry a string."
  '#{metabase.util.honey-sql-2/assert-map-or-nil!})

(defn- resolved-symbol
  "`sym` with its namespace alias resolved, or `sym` itself when Kondo cannot resolve it."
  [sym]
  (or (try
        (when-let [{resolved-ns :ns, resolved-name :name} (hooks/resolve {:name sym})]
          (symbol (str resolved-ns) (str resolved-name)))
        (catch Exception _ nil))
      sym))

(defn- map-form?
  "Whether `node` statically yields a map (or nil), so passing it after the model is conditions or a query,
  never a string. A fn named for a query proves nothing -- it could return a string -- so only the shape of the
  form counts, or a call to [[map-asserting-fns]], which checks at runtime."
  [node]
  (cond
    (hooks/map-node? node) true
    (and (hooks/token-node? node) (nil? (hooks/sexpr node))) true
    (hooks/list-node? node)
    (let [[head & args] (:children node)
          sym           (some-> head hooks/sexpr)
          f             (when (symbol? sym) (symbol (name sym)))]
      (boolean
       (cond
         (and (symbol? sym)
              (contains? map-asserting-fns (resolved-symbol sym))) true
         (contains? map-returning-fns f) true
         (contains? seeded-fns f)        (some-> (first args) map-form?)
         ;; `(merge s {...})` throws for a string `s`, so one map argument is enough.
         (= 'merge f)                    (some map-form? args)
         (contains? branching-fns f)     (let [branches (case f
                                                          (if if-not if-let if-some) (rest args)
                                                          (when when-not when-let when-some) [(last args)]
                                                          or args)]
                                           (and (seq branches) (every? map-form? branches))))))
    :else false))

(defn- implicit-pk-node?
  "Whether `node`, as the lone query argument after a model, is read by Toucan as a primary key.

  A keyword names a query, and a string or vector literal is a query written in place. A form that yields a
  map ([[map-form?]]), or an identity query, is a query too. Anything else -- a symbol, a number, a call -- is
  reported, because Toucan reads a non-map value as a primary key, and a string one as a query: written as
  `:id x`, a string is bound as a value instead."
  [node]
  (not (or (map-form? node)
           (hooks/keyword-node? node)
           (hooks/string-node? node)
           (hooks/vector-node? node)
           (let [head (some-> node :children first hooks/sexpr)]
             (and (hooks/list-node? node) (symbol? head) (= "identity-query" (name head)))))))

(def ^:private pk-columns
  "Models whose primary key is not `:id`, mirroring their `t2/primary-keys` methods."
  {:model/FieldUserSettings :field_id
   :model/TableUserSettings :table_id
   :model/Setting           :key
   :model/QueryCache        :query_hash
   :model/QueryAction       :action_id
   :model/HTTPAction        :action_id
   :model/ImplicitAction    :action_id})

(defn- pk-column
  "The primary key column to suggest for `model-node`: `:id`, unless [[pk-columns]] names another. A model
  that is not a literal keyword could be any model, so it gets `:toucan/pk`, which matches on whatever that
  model's primary key is."
  [model-node]
  (let [model (if (hooks/vector-node? model-node)
                (some-> model-node :children first hooks/sexpr)
                (some-> model-node hooks/sexpr))]
    (if (keyword? model)
      (get pk-columns model :id)
      :toucan/pk)))

(defn- lint-implicit-pk!
  "Register a `:metabase/t2-implicit-pk` finding when a primary key is passed bare, as in
  `(t2/select-one :model/Card id)`, rather than as `(t2/select-one :model/Card :id id)`."
  [node]
  (let [[fn-node & args] (:children node)
        verb             (some-> fn-node hooks/sexpr name symbol)]
    (when-let [i (get model-index verb)]
      (let [after-model (drop (inc i) args)
            n-query     (if (contains? trailing-changes-fns verb) 2 1)]
        (when (= n-query (count after-model))
          (let [pk (first after-model)]
            (when (implicit-pk-node? pk)
              (hooks/reg-finding!
               (assoc (meta pk)
                      :message (format "Pass the primary key as `%s %s` rather than bare to `%s`"
                                       (pk-column (nth args i)) (hooks/sexpr pk) (hooks/sexpr fn-node))
                      :type :metabase/t2-implicit-pk)))))))))

(defn lint-query-call
  "Register a `:metabase/t2-implicit-pk` finding when a Toucan 2 query call passes a primary key bare."
  [{:keys [node] :as input}]
  (lint-implicit-pk! node)
  input)

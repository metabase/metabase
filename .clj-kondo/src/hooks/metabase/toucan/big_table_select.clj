(ns hooks.metabase.toucan.big-table-select
  "Lint that flags eager, fully-realizing toucan2 selects against tables that
  can grow to millions/billions of rows (e.g. `:model/DataPermissions`,
  `:model/Field`, `:model/Table`). Realizing all rows of such a table into a
  Clojure collection OOMs the JVM. The fix is almost always to push the work
  into the DB: add `{:select-distinct [...]}` or `{:limit n}`, or use a
  reducible select that streams.

  A call is considered safe (and not flagged) when its trailing options map
  contains `:select-distinct`, `:limit`, or `:select` — these bound or
  project the result set in the database.

  Reducible selects (`select-reducible`, `reducible-query`) are intentionally
  NOT flagged: they are the streaming escape hatch, not the problem."
  (:require
   [clj-kondo.hooks-api :as hooks]))

(def ^:private big-models
  "Toucan models whose tables can be huge; eager selection OOMs."
  #{:model/DataPermissions
    :model/Field
    :model/Table})

(def ^:private fn->model-arg-index
  "For each flagged eager-select fn, the 0-based index (among the call's
  arguments, i.e. children after the fn symbol) at which the model appears."
  {"select"        0
   "select-fn-set" 1   ; (f model & conditions)
   "select-fn-vec" 1
   "select-fn->fn" 2   ; (k v model & conditions)
   "select-fn->map" 2
   "select-pks-set" 0  ; (model & conditions)
   "select-pks-vec" 0})

(defn- toucan-select-fn?
  "If `sym` is a flagged toucan2 select fn (as `t2/…` or `toucan2.core/…`),
  return its bare name, else nil."
  [sym]
  (when (symbol? sym)
    (let [nom (name sym)]
      (when (and (contains? fn->model-arg-index nom)
                 (#{"t2" "toucan2.core"} (namespace sym)))
        nom))))

(defn- bounded-options?
  "True if any trailing child is an options map literal that bounds/projects
  the result set in the DB (`:select-distinct`, `:limit`, or `:select`)."
  [option-nodes]
  (boolean
   (some (fn [node]
           (when (hooks/map-node? node)
             (let [ks (->> (:children node)
                           (partition 2)
                           (map (comp hooks/sexpr first)))]
               (some #{:select-distinct :limit :select} ks))))
         option-nodes)))

(defn lint
  [{:keys [node] :as input}]
  (let [children (:children node)
        [fn-sym & args] children
        fn-name (some-> fn-sym hooks/sexpr toucan-select-fn?)]
    (when fn-name
      (let [model-idx (fn->model-arg-index fn-name)
            model-node (nth args model-idx nil)
            model (when model-node
                    (try (hooks/sexpr model-node) (catch Exception _ nil)))]
        (when (and (contains? big-models model)
                   (not (bounded-options? (drop (inc model-idx) args))))
          (hooks/reg-finding!
           (assoc (meta (or model-node node))
                  :message (format (str "`t2/%s` against %s realizes the whole table into memory and can OOM. "
                                        "Add `{:select-distinct [...]}` or `{:limit n}`, or use a reducible select.")
                                   fn-name model)
                  :type :metabase/big-table-eager-select))))))
  input)

(ns hooks.metabase.warehouse-schema-overlay.table-or-field-query
  "Lint that a query over `:model/Field` or `:model/Table` names its source with `field-query`/`table-query` from
  `metabase.warehouse-schema-overlay.core`, or reads sync's values with `{:user-settings? false}`."
  (:require
   [clj-kondo.hooks-api :as hooks]))

(def ^:private read-fn?
  "The Toucan 2 query functions that read rows. Writes are not affected: they go to `metabase_field` itself."
  #{"select" "select-one" "select-fn->fn" "select-fn->pk" "select-fn-reducible" "select-fn-set" "select-fn-vec"
    "select-one-fn" "select-one-pk" "select-pk->fn" "select-pks-set" "select-pks-vec" "select-reducible"
    "reducible-select" "reducible-query" "query" "query-one" "count" "exists?"})

(def ^:private model->helper
  {":model/Field" "field-query"
   ":model/Table" "table-query"})

(defn- test-file? [filename]
  (boolean (and filename (re-find #"(?:^|/)test/" filename))))

(defn- tokens
  "Every token in `node`'s tree, as strings."
  [node]
  (tree-seq :children :children node))

(defn- mentions?
  [node pred]
  (boolean (some (fn [n] (when-let [s (some-> (hooks/sexpr n) pr-str)] (pred s)))
                 (filter (complement :children) (tokens node)))))

(defn- writes?
  "Whether a `t2/query` form is really a write spelled as a query."
  [node]
  (mentions? node #{":update" ":delete-from" ":insert-into"}))

(defn lint-read
  "Register a `:metabase/table-or-field-query` finding when a read of `:model/Field` or `:model/Table` does not name
  its source with the matching helper."
  [{:keys [node filename]}]
  (let [fn-node (first (:children node))
        fn-name (some-> (hooks/sexpr fn-node) name)]
    (when (and fn-name
               (read-fn? fn-name)
               (not (test-file? filename))
               (not (writes? node)))
      (doseq [[model helper] model->helper
              :when (mentions? node #(= % model))
              :when (not (mentions? node #(re-find (re-pattern (str "\\b" helper "$")) %)))]
        (hooks/reg-finding!
         (assoc (meta fn-node)
                :message (format "A read of %s must name its source: add {:from [(%s)]} (or {:user-settings? false} for sync's own values)"
                                 model helper)
                :type :metabase/table-or-field-query))))))

(ns metabase.driver.sql-mbql5.pivot
  "HoneySQL formatters and SQL compilation hooks for the MBQL 5 native pivot path. Used by any driver that derives from
  `:sql-mbql5` and opts into `:native-pivot-tables`."
  (:refer-clojure :exclude [mapv])
  (:require
   [clojure.string :as str]
   [honey.sql :as sql]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib.options :as lib.options]
   [metabase.lib.pivot :as lib.pivot]
   ^{:clj-kondo/ignore [:metabase/modules]}
   [metabase.query-processor.middleware.add-remaps :as-alias add-remaps]
   [metabase.query-processor.pivot :as qp.pivot]
   [metabase.util.performance :refer [mapv]]))

(defn- format-exprs
  "Format each expression in `exprs` via [[honey.sql/format-expr]] and return `[[sql-strings] [args]]`."
  [exprs]
  (let [formatted (mapv #(sql/format-expr % {:nested true}) exprs)]
    [(mapv first formatted)
     (mapcat rest formatted)]))

(defn- format-grouping-fn
  "Render `GROUPING(expr1, expr2, ...)` from a HoneySQL form `[::grouping-fn expr1 expr2 ...]`."
  [_fn exprs]
  (let [[sql-parts args] (format-exprs exprs)]
    (into [(str "GROUPING(" (str/join ", " sql-parts) ")")] args)))

(sql/register-fn! ::grouping-fn #'format-grouping-fn)

(defn- format-grouping-sets
  "Render `GROUPING SETS ((expr1, expr2), (expr1), ())` from a HoneySQL form
  `[::grouping-sets [expr1 expr2] [expr1] []]`. Each argument is one grouping set (a sequence of expressions)."
  [_fn sets]
  (let [rendered (mapv format-exprs sets)
        set-sql  (mapv (fn [[sql-parts _]] (str "(" (str/join ", " sql-parts) ")")) rendered)
        all-args (mapcat second rendered)]
    (into [(str "GROUPING SETS (" (str/join ", " set-sql) ")")] all-args)))

(sql/register-fn! ::grouping-sets #'format-grouping-sets)

(defn- remap-original->new-field-positions
  "Map `original-position` → `new-field-position` for each remap pair in `breakouts`. Returns `{}` when the query
  has no remapped breakouts."
  [breakouts]
  (let [new-field-by-dim-id (into {}
                                  (keep-indexed
                                   (fn [i b]
                                     (when-let [dim-id (-> b lib.options/options
                                                           (get ::add-remaps/new-field-dimension-id))]
                                       [dim-id i])))
                                  breakouts)]
    (into {}
          (keep-indexed
           (fn [orig-pos b]
             (when-let [dim-id (-> b lib.options/options
                                   (get ::add-remaps/original-field-dimension-id))]
               (when-let [new-pos (get new-field-by-dim-id dim-id)]
                 [orig-pos new-pos]))))
          breakouts)))

(defn- non-remap-positions
  "Indices in `breakouts` of the breakouts that are NOT remap new-field breakouts, in original order."
  [breakouts]
  (into []
        (keep-indexed
         (fn [i b]
           (when-not (-> b lib.options/options (get ::add-remaps/new-field-dimension-id))
             i)))
        breakouts))

(defn- expand-grouping-combo
  "Map a `combo` of indices into the non-remap-breakouts vector to the corresponding sorted indices into the full
  `breakouts` vector, dragging each remap new-field along with its original via `original->new-field`."
  [combo non-remap-positions original->new-field]
  (sort
   (into #{}
         (mapcat (fn [non-remap-combo-idx]
                   (let [orig-pos (nth non-remap-positions non-remap-combo-idx)]
                     (if-let [new-pos (get original->new-field orig-pos)]
                       [orig-pos new-pos]
                       [orig-pos]))))
         combo)))

(defn- splice-pivot-grouping-select
  "Insert `pivot-grouping-select` into `select` immediately after the leading `n-breakouts` columns, mirroring
  [[lib.pivot/splice-pivot-grouping]]'s placement in `returned-columns` so the SQL row layout matches the result
  metadata."
  [select n-breakouts pivot-grouping-select]
  (let [[breakouts rest-cols] (split-at n-breakouts select)]
    (-> (vec breakouts)
        (conj pivot-grouping-select)
        (into rest-cols))))

(defmethod sql.qp/apply-top-level-clause [:sql-mbql5 :pivot]
  [driver _ honeysql-form {:keys [breakout pivot]}]
  (let [breakout-hsql     (mapv #(sql.qp/->honeysql driver %) breakout)
        non-remap-poss    (non-remap-positions breakout)
        non-remap-bos     (mapv breakout non-remap-poss)
        orig->new         (remap-original->new-field-positions breakout)
        nr-idx-by-uuid    (into {} (map-indexed (fn [i b] [(lib.options/uuid b) i])) non-remap-bos)
        rows-idx          (mapv nr-idx-by-uuid (:rows pivot))
        cols-idx          (mapv nr-idx-by-uuid (:columns pivot))
        combos            (qp.pivot/breakout-combinations (count non-remap-bos)
                                                          rows-idx
                                                          cols-idx
                                                          (get pivot :show-row-totals    true)
                                                          (get pivot :show-column-totals true))
        sets-hsql         (mapv (fn [combo]
                                  (mapv #(nth breakout-hsql %)
                                        (expand-grouping-combo combo non-remap-poss orig->new)))
                                combos)
        non-remap-hsql    (mapv breakout-hsql non-remap-poss)
        ;; Args reversed so the bitmask convention matches `pivot.common/group-bitmask`: bit 0 = first non-remap breakout.
        grouping-fn       (into [::grouping-fn] (rseq non-remap-hsql))
        grouping-sets     (into [::grouping-sets] sets-hsql)]
    (-> honeysql-form
        (update :select splice-pivot-grouping-select (count breakout) [grouping-fn lib.pivot/pivot-grouping-column-name])
        (assoc :group-by [grouping-sets]
               :order-by (into [[grouping-fn :asc]] (:order-by honeysql-form))))))

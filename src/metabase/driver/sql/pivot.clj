(ns metabase.driver.sql.pivot
  "HoneySQL formatters and SQL compilation hooks for the MBQL 5 native pivot path. Used by any driver that derives from
  `:sql` and opts into `:native-pivot-tables`."
  (:refer-clojure :exclude [empty? mapv some])
  (:require
   [clojure.string :as str]
   [honey.sql :as sql]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.util :as driver.u]
   [metabase.lib.options :as lib.options]
   [metabase.lib.pivot :as lib.pivot]
   [metabase.lib.schema.aggregation :as lib.schema.aggregation]
   ;; :as-alias only, for ::add-remaps keywords; no runtime dependency on QP internals
   ^{:clj-kondo/ignore [:metabase/modules]}
   [metabase.query-processor.middleware.add-remaps :as-alias add-remaps]
   [metabase.query-processor.pivot :as qp.pivot]
   [metabase.util.performance :refer [empty? mapv some]]))

(set! *warn-on-reflection* true)

(defn- stage-has-window-fn-aggregation?
  "True iff any aggregation on the compiled `stage` is a window-function aggregation, or transitively contains one."
  [stage]
  (some? (some lib.schema.aggregation/window-aggregation-expression?
               (:aggregation stage))))

(defn- use-grouping-sets?
  "True iff `database`'s driver supports `:native-pivot-tables` and the compiled `stage` has no window aggregation.
  Short-circuits when [[qp.pivot/*force-compilation-shape*]] is bound to `:grouping-sets` or `:union-all`."
  [database stage]
  (case qp.pivot/*force-compilation-shape*
    :grouping-sets true
    :union-all     false
    (and (driver.u/supports? (driver.u/database->driver database) :native-pivot-tables database)
         (not (stage-has-window-fn-aggregation? stage)))))

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

(defn- format-grouping-id-fn
  "Render `GROUPING_ID(expr1, expr2, ...)` from a HoneySQL form `[::grouping-id-fn expr1 expr2 ...]`."
  [_fn exprs]
  (let [[sql-parts args] (format-exprs exprs)]
    (into [(str "GROUPING_ID(" (str/join ", " sql-parts) ")")] args)))

(sql/register-fn! ::grouping-id-fn #'format-grouping-id-fn)

(defmulti pivot-grouping-hsql
  "Return a HoneySQL form producing the pivot-grouping bitmask, one bit per expression in `exprs`. The default emits
  `GROUPING(exprs...)` (the Postgres/Oracle/Snowflake multi-arg extension). Drivers whose SQL dialect wants a
  different function or shape override this method."
  {:added "0.64.0", :arglists '([driver exprs])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod pivot-grouping-hsql :sql
  [_driver exprs]
  (into [::grouping-fn] exprs))

(defn synthesise-grouping-bitmask
  "HoneySQL form that computes the pivot-grouping bitmask as a sum of single-arg
  `GROUPING(expr) * 2^n` terms — for dialects whose `GROUPING()` accepts only one argument and
  that have no `GROUPING_ID()` equivalent. `exprs` follow the same left=highest-bit convention as
  `GROUPING(a, b, ...)` / `GROUPING_ID(a, b, ...)`.

  For `exprs = [a b c]`, produces the HoneySQL equivalent of
  `GROUPING(a) * 4 + GROUPING(b) * 2 + GROUPING(c)`. When only one expression is supplied the
  result is a bare `GROUPING(a)`."
  [exprs]
  (let [n     (count exprs)
        ;; The least-significant term (shift = 0) omits the `* 1`; this also unwraps the whole
        ;; sum to a bare `GROUPING(expr)` in the single-expression case.
        terms (map-indexed
               (fn [i expr]
                 (let [g     [::grouping-fn expr]
                       shift (- n i 1)]
                   (if (zero? shift)
                     g
                     [:* g [:inline (bit-shift-left 1 shift)]])))
               exprs)]
    (if (next terms)
      (into [:+] terms)
      (first terms))))

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

(defn- compile-grouping-sets-pivot
  "Compile the `:pivot` clause into a single-query `GROUP BY GROUPING SETS ((...), (...), ...)` shape.
  Assumes `driver` supports the `GROUPING SETS` extension via `:native-pivot-tables`."
  [driver honeysql-form {:keys [breakout pivot]}]
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
        grouping-fn       (pivot-grouping-hsql driver (rseq non-remap-hsql))
        grouping-sets     (into [::grouping-sets] sets-hsql)
        ;; With only one grouping set the grouping bitmask is constant; skip the ORDER BY prefix so dialects that
        ;; reject constants in ORDER BY (e.g. SQL Server) don't fail, and to avoid the redundant sort.
        prefix-order-by   (if (= 1 (count sets-hsql)) [] [[grouping-fn :asc]])]
    (-> honeysql-form
        (update :select splice-pivot-grouping-select (count breakout) [grouping-fn lib.pivot/pivot-grouping-column-name])
        (assoc :group-by [grouping-sets]
               :order-by (into prefix-order-by (:order-by honeysql-form))))))

(defn- select-entry-alias
  "Return the alias of a HoneySQL `:select` `entry` — either the second element of a `[expr alias]` pair, or the
  entry itself when it's a bare identifier (HoneySQL treats it as its own alias)."
  [entry]
  (if (vector? entry) (second entry) entry))

(defmulti null-pad-breakout-hsql
  "Return a HoneySQL form used to null-pad a dropped-breakout column in a UNION ALL branch of the
  UA pivot compiler. `breakout` is the MBQL breakout clause (drivers can read `:base-type` /
  `:effective-type` from its options); `breakout-expr` is its compiled HoneySQL form (drivers can
  read database-type metadata attached during compilation).

  Default is a bare `NULL`, which most dialects infer from sibling `UNION ALL` branches. Dialects
  that leave untyped `NULL` untyped and reject the union (BigQuery, Presto/Trino) override this
  to emit `CAST(NULL AS <type>)`, typically by mapping `:base-type` to a driver-specific SQL type
  name."
  {:added "0.64.0", :arglists '([driver breakout breakout-expr])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod null-pad-breakout-hsql :sql
  [_driver _breakout _breakout-expr]
  nil)

(defmulti apply-cte-hoist?
  "True iff a UNION ALL pivot compiled for `driver` should hoist the shared pre-pivot subquery into a
  `WITH` binding referenced from every branch. Off by default; drivers opt in when their planner both
  benefits from CTE deduplication (older Presto fans identical subqueries into per-branch tasks and
  exhausts the coordinator heap on large joins) *and* correctly binds prepared-statement parameters
  in a CTE referenced from multiple UNION branches (H2 mis-binds these and returns zero-count rows,
  so it stays opted out)."
  {:added "0.64.0", :arglists '([driver])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod apply-cte-hoist? :sql
  [_driver]
  false)

(defn- compile-union-all-pivot
  "Compile the `:pivot` clause into a `UNION ALL` over one branch per grouping-set combination, wrapped in an outer
  `SELECT * FROM (...) AS __mb_pivot_result`. Used for drivers that lack `:native-pivot-tables` and for queries whose
  window aggregations GROUPING SETS can't compose meaningfully.

  For each combo we recompile `:breakout` + `:aggregation` against a stage variant carrying only the kept
  breakouts, so the SQL compiler produces branch-appropriate `GROUP BY` and window-fn `OVER` shapes (matching
  what the multi-query path emits per subquery). Missing breakout columns are null-padded so all branches
  share a UNION-ALL-compatible column layout."
  [driver honeysql-form {:keys [breakout pivot] :as stage}]
  (let [breakout-hsql            (mapv #(sql.qp/->honeysql driver %) breakout)
        non-remap-poss           (non-remap-positions breakout)
        non-remap-bos            (mapv breakout non-remap-poss)
        orig->new                (remap-original->new-field-positions breakout)
        nr-idx-by-uuid           (into {} (map-indexed (fn [i b] [(lib.options/uuid b) i])) non-remap-bos)
        rows-idx                 (mapv nr-idx-by-uuid (:rows pivot))
        cols-idx                 (mapv nr-idx-by-uuid (:columns pivot))
        combos                   (qp.pivot/breakout-combinations (count non-remap-bos)
                                                                 rows-idx
                                                                 cols-idx
                                                                 (get pivot :show-row-totals    true)
                                                                 (get pivot :show-column-totals true))
        n-breakouts              (count breakout)
        orig-breakout-select     (subvec (:select honeysql-form) 0 n-breakouts)
        orig-agg-select          (subvec (:select honeysql-form) n-breakouts)
        ;; Only take aggregation-referencing order-bys from the stage — implicit breakout-based order-bys
        ;; added by middleware are re-derived below (canonicalized), so keeping them would double-insert.
        user-order-bys           (into []
                                       (filter (fn [[_ _ ref]]
                                                 (and (vector? ref) (= (first ref) :aggregation))))
                                       (:order-by stage))
        ;; HoneySQL form used to null-pad a dropped breakout in a UA branch — dispatched to
        ;; [[null-pad-breakout-hsql]]. Default is bare `NULL`; drivers with strict `UNION ALL`
        ;; type coercion (BigQuery, Presto) override to emit `CAST(NULL AS <type>)`.
        typed-null               (fn [i]
                                   (null-pad-breakout-hsql driver (nth breakout i) (nth breakout-hsql i)))
        ;; Shared prefix (source, joins, filter, CTEs) — everything except the per-branch shape.
        shared-base              (dissoc honeysql-form :select :select-distinct :group-by :order-by :limit)
        alias-of                 select-entry-alias
        ;; Reorder `bos` so any temporal breakout with the finest granularity sits last — matches the sort
        ;; ordering the multi-query path emits per subquery (via
        ;; `nest_breakouts/add-implicit-breakout-order-bys`) so UA-branch offsets and outer row ordering line
        ;; up with multi-query row-for-row.
        canonicalize-breakouts   (fn [bos]
                                   (if-let [fti (driver-api/finest-temporal-breakout-index bos 1)]
                                     (into (vec (concat (subvec (vec bos) 0 fti)
                                                        (subvec (vec bos) (inc fti))))
                                           [(nth bos fti)])
                                     (vec bos)))
        compile-branch           (fn [combo]
                                   (let [kept-full-idx (vec (expand-grouping-combo combo non-remap-poss orig->new))
                                         kept-breakout (mapv (partial nth breakout) kept-full-idx)
                                         bitmask       (qp.pivot/group-bitmask (count non-remap-bos) combo)
                                         ;; Strip :pivot to avoid recursing into this method. Set :order-by to
                                         ;; the user's explicit order-bys followed by canonical breakouts
                                         ;; (finest-temporal last) — window-fn aggregations read this from
                                         ;; `*inner-query*` to build their `OVER (ORDER BY ...)`, and multi-query's
                                         ;; subqueries sort the same way so branch row ordering lines up. Strip
                                         ;; :limit — the outer wrapper owns any row caps.
                                         canonical-bo  (canonicalize-breakouts kept-breakout)
                                         branch-obs    (into user-order-bys
                                                             (mapv (fn [b] [:asc {} b]) canonical-bo))
                                         branch-stage  (-> stage
                                                           (dissoc :pivot :limit)
                                                           (assoc :breakout kept-breakout)
                                                           (cond->
                                                            (seq branch-obs) (assoc :order-by branch-obs)
                                                            (empty? branch-obs) (dissoc :order-by)))
                                         branch-form   (binding [sql.qp/*inner-query* branch-stage]
                                                         (cond-> shared-base
                                                           (seq kept-breakout)
                                                           (as-> $ (sql.qp/apply-top-level-clause driver :breakout $ branch-stage))
                                                           :always
                                                           (as-> $ (sql.qp/apply-top-level-clause driver :aggregation $ branch-stage))))
                                         n-kept        (count kept-breakout)
                                         branch-select (:select branch-form)
                                         kept-sel      (subvec branch-select 0 n-kept)
                                         aggs-sel      (subvec branch-select n-kept)
                                         kept-by-alias (into {} (map (juxt alias-of identity)) kept-sel)
                                         padded-bo-sel (mapv (fn [orig-entry i]
                                                               (or (kept-by-alias (alias-of orig-entry))
                                                                   [(typed-null i) (alias-of orig-entry)]))
                                                             orig-breakout-select
                                                             (range n-breakouts))
                                         full-select   (-> padded-bo-sel
                                                           (conj [[:inline bitmask] lib.pivot/pivot-grouping-column-name])
                                                           (into aggs-sel))]
                                     (assoc branch-form :select full-select)))
        branches                 (mapv compile-branch combos)
        ;; Outer sort: pivot-grouping first (so branches stay grouped), then user's explicit order-bys
        ;; (referenced by their aggregation aliases so each pivot-grouping's rows are ordered like a
        ;; multi-query subquery would order them), then canonical breakouts as a final tiebreak.
        ;; HoneySQL wraps `[<alias>]` (the SELECT-alias shape) around the identifier form; strip that
        ;; wrapper for ORDER-BY use so HoneySQL emits `"alias" ASC` rather than `("alias") ASC` (which
        ;; Presto/Trino rejects).
        alias-ident              (fn [a]
                                   (if (and (vector? a) (= 1 (count a)))
                                     (first a)
                                     a))
        canonical-orig-bo-aliases (mapv (fn [b]
                                          (alias-ident
                                           (alias-of (nth orig-breakout-select
                                                          (.indexOf ^java.util.List (vec breakout) b)))))
                                        (canonicalize-breakouts breakout))
        ;; Map aggregation UUID → position, so we can resolve MBQL 5 `[:aggregation opts <uuid-str>]`
        ;; references from the user's :order-by to the corresponding aggregation alias in
        ;; `orig-agg-select`.
        agg-uuid->idx            (into {}
                                       (map-indexed (fn [i agg] [(lib.options/uuid agg) i]))
                                       (:aggregation stage))
        user-order-by-outer      (into []
                                       (keep (fn [[dir _opts ref]]
                                               (when (and (vector? ref) (= (first ref) :aggregation))
                                                 (let [target (nth ref 2 nil)
                                                       agg-idx (get agg-uuid->idx target)]
                                                   (when-let [entry (and agg-idx (nth orig-agg-select agg-idx nil))]
                                                     [(alias-ident (alias-of entry)) dir])))))
                                       user-order-bys)
        outer-order-by           (when (> (count combos) 1)
                                   (into [[:pivot-grouping :asc]]
                                         cat
                                         [user-order-by-outer
                                          (map (fn [alias] [alias :asc]) canonical-orig-bo-aliases)]))
        ;; Older planners (Presto 0.254) don't dedupe identical subqueries in `FROM`, so each UA branch
        ;; scheduled its own copy of the pre-pivot subtree — enough tasks at CI data scale to blow the
        ;; coordinator heap. If every branch shares the same one-entry `:from` (the nested source produced
        ;; by [[qp.util.transformations.nest-breakouts/nest-pivot-joins]]), lift it into a `WITH` binding
        ;; and rewrite each branch to reference the CTE by its original alias. Falls back to the flat
        ;; shape when branches diverge (no joins, or heterogeneous per-branch filters).
        cte-name                 :__mb_pivot_source
        froms                    (mapv :from branches)
        ;; A branch's `:from` is `[[<source-spec> <alias>]]` (or `[<source-spec>]` with no alias). We
        ;; only lift when every branch's `:from` is identical AND `<source-spec>` is a subquery map — a
        ;; bare table ref (keyword, identifier vector) has no per-branch fanout for the planner to
        ;; duplicate, and CTE'ing a table would be invalid syntax. Gated on [[apply-cte-hoist?]].
        [shared-src src-alias]   (when (and (apply-cte-hoist? driver)
                                            (apply = froms)
                                            (= 1 (count (first froms))))
                                   (let [entry (ffirst froms)]
                                     (cond
                                       (map? entry)
                                       [entry nil]
                                       (and (vector? entry) (>= (count entry) 1) (map? (first entry)))
                                       [(first entry) (second entry)])))
        branches                 (cond-> branches
                                   shared-src
                                   (as-> $ (mapv (fn [b]
                                                   (assoc b :from
                                                          (if src-alias
                                                            [[cte-name src-alias]]
                                                            [[cte-name]])))
                                                 $)))]
    (cond-> {:select [:*]
             :from   [[{:union-all branches} :__mb_pivot_result]]}
      shared-src     (assoc :with [[cte-name shared-src]])
      outer-order-by (assoc :order-by outer-order-by))))

(defmethod sql.qp/apply-top-level-clause [:sql :pivot]
  [driver _ honeysql-form stage]
  (let [database (driver-api/database (driver-api/metadata-provider))]
    (if (use-grouping-sets? database stage)
      (compile-grouping-sets-pivot driver honeysql-form stage)
      (compile-union-all-pivot     driver honeysql-form stage))))

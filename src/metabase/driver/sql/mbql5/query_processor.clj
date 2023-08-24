(ns metabase.driver.sql.mbql5.query-processor
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.driver :as driver]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.walk :as lib.util.walk]
   [metabase.mbql.util :as mbql.u]
   [metabase.qp.metadata-provider :as qp.metadata-provider]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.annotate :as annotate]
   [metabase.query-processor.middleware.wrap-value-literals
    :as qp.wrap-value-literals]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.util.add-alias-info :as add]
   [metabase.query-processor.util.nest-query :as nest-query]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   #_{:clj-kondo/ignore [:discouraged-namespace :deprecated-namespace]}
   [metabase.util.honeysql-extensions :as hx]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [schema.core :as s]))

(set! *warn-on-reflection* true)

(def ^:dynamic *stage*
  "The INNER query currently being processed, for situations where we need to refer back to it."
  nil)

(defmethod sql.qp/->honeysql [:sql/mbql5 :value]
  [driver [_ _opts value]]
  (sql.qp/->honeysql driver value))

(defmethod sql.qp/->honeysql [:sql/mbql5 :expression]
  [driver [_ {::add/keys [source-table source-alias], :as _opts} expression-name :as _clause]]
  (let [expression-definition (mbql.u/expression-with-name *stage* expression-name)]
    (sql.qp/->honeysql driver (if (= source-table ::add/source)
                         (apply h2x/identifier :field sql.qp/source-query-alias source-alias)
                         expression-definition))))

(defn- field-source-table-aliases
  "Get sequence of alias that should be used to qualify a `:field` clause when compiling (e.g. left-hand side of an
  `AS`).

    (field-source-table-aliases [:field 1 nil]) ; -> [\"public\" \"venues\"]"
  [[_field {::add/keys [source-table]} id-or-name]]
  (let [source-table (or source-table
                         (when (integer? id-or-name)
                           (:table_id (qp.store/field id-or-name))))]
    (cond
      (= source-table ::add/source) [sql.qp/source-query-alias]
      (= source-table ::add/none)   nil
      (integer? source-table)       (let [{schema :schema, table-name :name} (qp.store/table source-table)]
                                      [schema table-name])
      source-table                  [source-table])))

(defn- field-source-alias
  "Get alias that should be use to refer to a `:field` clause when compiling (e.g. left-hand side of an `AS`).

    (field-source-alias [:field 1 nil]) ; -> \"price\""
  [[_field {::add/keys [source-alias]} id-or-name]]
  (or source-alias
      (when (string? id-or-name)
        id-or-name)
      (when (integer? id-or-name)
        (:name (qp.store/field id-or-name)))))

(defmethod sql.qp/->honeysql [:sql/mbql5 :field]
  [driver [_field
           {:keys             [database-type]
            ::nest-query/keys [outer-select]
            :as               options}
           id-or-name
           :as field-clause]]
  (try
    (let [source-table-aliases (field-source-table-aliases field-clause)
          source-alias         (field-source-alias field-clause)
          field                (when (integer? id-or-name)
                                 (qp.store/field id-or-name))
          allow-casting?       (and field
                                    (not outer-select))
          database-type        (or database-type
                                   (:database_type field))
          identifier           (sql.qp/->honeysql driver
                                                  (apply h2x/identifier :field
                                                         (concat source-table-aliases [source-alias])))
          maybe-add-db-type    (fn [expr]
                                 (if (h2x/type-info->db-type (h2x/type-info expr))
                                   expr
                                   (h2x/with-database-type-info expr database-type)))]
      (u/prog1
        (cond->> identifier
          allow-casting?           (sql.qp/cast-field-if-needed driver field)
          ;; only add type info if it wasn't added by [[cast-field-if-needed]]
          database-type            maybe-add-db-type
          (:temporal-unit options) (sql.qp/apply-temporal-bucketing driver options)
          (:binning options)       (sql.qp/apply-binning options))
        (log/trace (binding [*print-meta* true]
                     (format "Compiled field clause\n%s\n=>\n%s"
                             (u/pprint-to-str field-clause) (u/pprint-to-str <>))))))
    (catch Throwable e
      (throw (ex-info (tru "Error compiling :field clause: {0}" (ex-message e))
                      {:clause field-clause}
                      e)))))

(defmethod sql.qp/->honeysql [:sql/mbql5 :count]
  [driver [_count _opts expr]]
  (if expr
    [:count (sql.qp/->honeysql driver expr)]
    :%count.*))

(defmethod sql.qp/->honeysql [:sql/mbql5 :avg]    [driver [_tag _opts expr]] [:avg        (sql.qp/->honeysql driver expr)])
(defmethod sql.qp/->honeysql [:sql/mbql5 :median] [driver [_tag _opts expr]] [:median     (sql.qp/->honeysql driver expr)])
(defmethod sql.qp/->honeysql [:sql/mbql5 :stddev] [driver [_tag _opts expr]] [:stddev_pop (sql.qp/->honeysql driver expr)])
(defmethod sql.qp/->honeysql [:sql/mbql5 :var]    [driver [_tag _opts expr]] [:var_pop    (sql.qp/->honeysql driver expr)])
(defmethod sql.qp/->honeysql [:sql/mbql5 :sum]    [driver [_tag _opts expr]] [:sum        (sql.qp/->honeysql driver expr)])
(defmethod sql.qp/->honeysql [:sql/mbql5 :min]    [driver [_tag _opts expr]] [:min        (sql.qp/->honeysql driver expr)])
(defmethod sql.qp/->honeysql [:sql/mbql5 :max]    [driver [_tag _opts expr]] [:max        (sql.qp/->honeysql driver expr)])

(defmethod sql.qp/->honeysql [:sql/mbql5 :percentile]
  [driver [_percentile _opts field p]]
  (let [field (sql.qp/->honeysql driver field)
        p     (sql.qp/->honeysql driver p)]
    [::h2x/percentile-cont field p]))

(defmethod sql.qp/->honeysql [:sql/mbql5 :distinct]
  [driver [_distinct _opts field]]
  (let [field (sql.qp/->honeysql driver field)]
    [::h2x/distinct-count field]))

(defmethod sql.qp/->honeysql [:sql/mbql5 :floor] [driver [_tag _opts mbql-expr]] [:floor (sql.qp/->honeysql driver mbql-expr)])
(defmethod sql.qp/->honeysql [:sql/mbql5 :ceil]  [driver [_tag _opts mbql-expr]] [:ceil  (sql.qp/->honeysql driver mbql-expr)])
(defmethod sql.qp/->honeysql [:sql/mbql5 :round] [driver [_tag _opts mbql-expr]] [:round (sql.qp/->honeysql driver mbql-expr)])
(defmethod sql.qp/->honeysql [:sql/mbql5 :abs]   [driver [_tag _opts mbql-expr]] [:abs (sql.qp/->honeysql driver mbql-expr)])
(defmethod sql.qp/->honeysql [:sql/mbql5 :exp]   [driver [_tag _opts mbql-expr]] [:exp (sql.qp/->honeysql driver mbql-expr)])
(defmethod sql.qp/->honeysql [:sql/mbql5 :sqrt]  [driver [_tag _opts mbql-expr]] [:sqrt (sql.qp/->honeysql driver mbql-expr)])

(defmethod sql.qp/->honeysql [:sql/mbql5 :log]
  [driver [_tag _opts mbql-expr]]
  [:log (sql.qp/inline-num 10) (sql.qp/->honeysql driver mbql-expr)])

(defmethod sql.qp/->honeysql [:sql/mbql5 :power]
  [driver [_power _opts mbql-expr power]]
  [:power
   (sql.qp/->honeysql driver mbql-expr)
   (sql.qp/->honeysql driver power)])

(defn- interval? [expr]
  (mbql.u/is-clause? :interval expr))

(defmethod sql.qp/->honeysql [:sql/mbql5 :+]
  [driver [_tag _opts & args]]
  (if (some interval? args)
    (if-let [[field intervals] (u/pick-first (complement interval?) args)]
      (reduce (fn [hsql-form [_ amount unit]]
                (sql.qp/add-interval-honeysql-form driver hsql-form amount unit))
              (sql.qp/->honeysql driver field)
              intervals)
      (throw (ex-info "Summing intervals is not supported" {:args args})))
    (into [:+]
          (map (partial sql.qp/->honeysql driver))
          args)))

(defmethod sql.qp/->honeysql [:sql/mbql5 :-]
  [driver [_tag _opts & args]]
  (into [:-] (map (partial sql.qp/->honeysql driver)) args))

(defmethod sql.qp/->honeysql [:sql/mbql5 :*]
  [driver [_tag _opts & args]]
  (into [:*] (map (partial sql.qp/->honeysql driver)) args))

(defmethod sql.qp/->honeysql [:sql/mbql5 :/]
  [driver [_tag _opts & mbql-exprs]]
  (let [[numerator & denominators] (for [mbql-expr mbql-exprs]
                                     (sql.qp/->honeysql driver (if (integer? mbql-expr)
                                                          (double mbql-expr)
                                                          mbql-expr)))]
    (into [:/ (sql.qp/->float driver numerator)]
          (map sql.qp/safe-denominator)
          denominators)))

(defmethod sql.qp/->honeysql [:sql/mbql5 :sum-where]
  [driver [_sum-where _opts arg pred]]
  [:sum [:case
         (sql.qp/->honeysql driver pred) (sql.qp/->honeysql driver arg)
         :else                    [:inline 0.0]]])

(defmethod sql.qp/->honeysql [:sql/mbql5 :count-where]
  [driver [_count-where _opts pred]]
  (sql.qp/->honeysql driver [:sum-where 1 pred]))

(defmethod sql.qp/->honeysql [:sql/mbql5 :share]
  [driver [_share _opts pred]]
  [:/ (sql.qp/->honeysql driver [:count-where pred]) :%count.*])

(defmethod sql.qp/->honeysql [:sql/mbql5 :trim]
  [driver [_trim _opts arg]]
  [:trim (sql.qp/->honeysql driver arg)])

(defmethod sql.qp/->honeysql [:sql/mbql5 :ltrim]
  [driver [_ltrim _opts arg]]
  [:ltrim (sql.qp/->honeysql driver arg)])

(defmethod sql.qp/->honeysql [:sql/mbql5 :rtrim]
  [driver [_rtrim _opts arg]]
  [:rtrim (sql.qp/->honeysql driver arg)])

(defmethod sql.qp/->honeysql [:sql/mbql5 :upper]
  [driver [_upper _opts arg]]
  [:upper (sql.qp/->honeysql driver arg)])

(defmethod sql.qp/->honeysql [:sql/mbql5 :lower]
  [driver [_lower _opts arg]]
  [:lower (sql.qp/->honeysql driver arg)])

(defmethod sql.qp/->honeysql [:sql/mbql5 :coalesce]
  [driver [_coalesce _opts & args]]
  (into [:coalesce] (map (partial sql.qp/->honeysql driver)) args))

(defmethod sql.qp/->honeysql [:sql/mbql5 :replace]
  [driver [_replace _opts arg pattern replacement]]
  [:replace (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver pattern) (sql.qp/->honeysql driver replacement)])

(defmethod sql.qp/->honeysql [:sql/mbql5 :concat]
  [driver [_concat _opts & args]]
  (into [:concat] (map (partial sql.qp/->honeysql driver)) args))

(defmethod sql.qp/->honeysql [:sql/mbql5 :substring]
  [driver [_substring _opts arg start length]]
  (let [arg    (sql.qp/->honeysql driver arg)
        start  (sql.qp/->honeysql driver start)
        length (when length
                 (sql.qp/->honeysql driver length))]
    (if length
      [:substring arg start length]
      [:substring arg start])))

(defmethod sql.qp/->honeysql [:sql/mbql5 :length]
  [driver [_length _opts arg]]
  [:length (sql.qp/->honeysql driver arg)])

(defmethod sql.qp/->honeysql [:sql/mbql5 :case]
  [driver [_case _opts args]]
  (let [pred-expr-pairs (concat
                         (butlast args)
                         [(if (and (vector? (last args))
                                   (not (lib.util/clause? (last args))))
                            (last args)
                            ; final default value without pred form
                            [:else (last args)])])]
    (into [:case]
          (mapcat (fn [[pred expr]]
                    [(if (= pred :else)
                       :else
                       (sql.qp/->honeysql driver pred))
                     (sql.qp/->honeysql driver expr)]))
          pred-expr-pairs)))

;;  aggregation REFERENCE e.g. the ["aggregation" 0] fields we allow in order-by
(defmethod sql.qp/->honeysql [:sql/mbql5 :aggregation]
  [driver [_ index]]
  (mbql.u/match-one (nth (:aggregation *stage*) index)
    [:aggregation-options ag (options :guard :name)]
    (sql.qp/->honeysql driver (h2x/identifier :field-alias (:name options)))

    [:aggregation-options ag _]
    #_:clj-kondo/ignore
    (recur ag)

    ;; For some arcane reason we name the results of a distinct aggregation "count", everything else is named the
    ;; same as the aggregation
    :distinct
    (sql.qp/->honeysql driver (h2x/identifier :field-alias :count))

    #{:+ :- :* :/}
    (sql.qp/->honeysql driver &match)

    ;; for everything else just use the name of the aggregation as an identifer, e.g. `:sum`
    ;;
    ;; TODO -- I don't think we will ever actually get to this anymore because everything should have been given a name
    ;; by [[metabase.query-processor.middleware.pre-alias-aggregations]]
    [ag-type & _]
    (sql.qp/->honeysql driver (h2x/identifier :field-alias ag-type))))

(defmethod sql.qp/->honeysql [:sql/mbql5 :absolute-datetime]
  [driver [_absolute-datetime _opts timestamp unit]]
  (sql.qp/date driver unit (sql.qp/->honeysql driver timestamp)))

(defmethod sql.qp/->honeysql [:sql/mbql5 :time]
  [driver [_time _opts value unit]]
  (sql.qp/date driver unit (sql.qp/->honeysql driver value)))

(defmethod sql.qp/->honeysql [:sql/mbql5 :relative-datetime]
  [driver [_relative-datetime _opts amount unit]]
  (sql.qp/date driver unit (if (zero? amount)
                      (sql.qp/current-datetime-honeysql-form driver)
                      (sql.qp/add-interval-honeysql-form driver (sql.qp/current-datetime-honeysql-form driver) amount unit))))

(defmethod sql.qp/->honeysql [:sql/mbql5 :temporal-extract]
  [driver [_temporal-extract _opts  mbql-expr unit]]
  (sql.qp/date driver unit (sql.qp/->honeysql driver mbql-expr)))

(defmethod sql.qp/->honeysql [:sql/mbql5 :datetime-add]
  [driver [_datetime-add _opts arg amount unit]]
  (sql.qp/add-interval-honeysql-form driver (sql.qp/->honeysql driver arg) amount unit))

(defmethod sql.qp/->honeysql [:sql/mbql5 :datetime-subtract]
  [driver [_datetime-substract _opts arg amount unit]]
  (sql.qp/add-interval-honeysql-form driver (sql.qp/->honeysql driver arg) (- amount) unit))

(defmethod sql.qp/->honeysql [:sql/mbql5 :datetime-diff]
  [driver [_datetime-diff _opts x y unit]]
  (let [x (sql.qp/->honeysql driver x)
        y (sql.qp/->honeysql driver y)]
    (sql.qp/datetime-diff-check-args x y (partial re-find #"(?i)^(timestamp|date)"))
    (sql.qp/datetime-diff driver unit x y)))

;; TODO -- this name is a bit of a misnomer since it also handles `:aggregation` and `:expression` clauses.
(s/defn field-clause->alias :- (s/pred some? "non-nil")
  "Generate HoneySQL for an approriate alias (e.g., for use with SQL `AS`) for a `:field`, `:expression`, or
  `:aggregation` clause of any type, or `nil` if the Field should not be aliased. By default uses the
  `::add/desired-alias` key in the clause options.

  Optional third parameter `unique-name-fn` is no longer used as of 0.42.0."
  [driver [clause-type {::add/keys [desired-alias], :as _opts} id-or-name] & _unique-name-fn]
  (let [desired-alias (or desired-alias
                          ;; fallback behavior for anyone using SQL QP functions directly without including the stuff
                          ;; from [[metabase.query-processor.util.add-alias-info]]. We should probably disallow this
                          ;; going forward because it is liable to break
                          (when (string? id-or-name)
                            id-or-name)
                          (when (and (= clause-type :field)
                                     (integer? id-or-name))
                            (:name (qp.store/field id-or-name))))]
    (sql.qp/->honeysql driver (h2x/identifier :field-alias desired-alias))))

;; Certain SQL drivers require that we refer to Fields using the alias we give in the `SELECT` clause in
;; `ORDER BY` and `GROUP BY` rather than repeating definitions.
;; BigQuery does this generally, other DB's require this in JSON columns.
;;
;; See #17536 and #18742

(defn rewrite-fields-to-force-using-column-aliases
  "Rewrite `:field` clauses to force them to use the column alias regardless of where they appear."
  ([form]
   (rewrite-fields-to-force-using-column-aliases form {:is-breakout false}))
  ([form {is-breakout :is-breakout}]
   (mbql.u/replace form
     [:field id-or-name opts]
     [:field id-or-name (cond-> opts
                          true
                          (assoc ::add/source-alias        (::add/desired-alias opts)
                                 ::add/source-table        ::add/none
                                 ;; sort of a HACK but this key will tell the SQL QP not to apply casting here either.
                                 ::nest-query/outer-select true
                                 ;; used to indicate that this is a forced alias
                                 ::forced-alias            true)
                          ;; don't want to do temporal bucketing or binning inside the order by only.
                          ;; That happens inside the `SELECT`
                          ;; (#22831) however, we do want it in breakout
                          (not is-breakout)
                          (dissoc :temporal-unit :binning))])))

(defmethod sql.qp/apply-top-level-clause [:sql/mbql5 :aggregation]
  [driver _top-level-clause honeysql-form {aggregations :aggregation, :as stage}]
  (let [honeysql-ags (vec (for [ag   aggregations
                                :let [ag-expr  (sql.qp/->honeysql driver ag)
                                      ag-name  (annotate/aggregation-name stage ag)
                                      ag-alias (sql.qp/->honeysql driver (h2x/identifier
                                                                   :field-alias
                                                                   (driver/escape-alias driver ag-name)))]]
                            [ag-expr [ag-alias]]))]
    (reduce sql.helpers/select honeysql-form honeysql-ags)))

(def ^:private StringValueOrFieldOrExpression
  [:or
   [:and :mbql.clause/value
    [:fn {:error/message "string value"} #(string? (second %))]]
   :mbql.clause/field
   :mbql.clause/expression
   ::lib.schema.expression/string])

(mu/defn ^:private generate-pattern
  "Generate pattern to match against in like clause. Lowercasing for case insensitive matching also happens here."
  [driver
   pre
   [type _ :as arg] :- StringValueOrFieldOrExpression
   post
   {:keys [case-sensitive] :or {case-sensitive true} :as _options}]
  (if (= :value type)
    (sql.qp/->honeysql driver (update arg 1 #(cond-> (str pre % post)
                                        (not case-sensitive) u/lower-case-en)))
    (cond->> (sql.qp/->honeysql driver (into [:concat] (remove nil?) [pre arg post]))
      (not case-sensitive) [:lower])))

(defmethod sql.qp/->honeysql [:sql/mbql5 :starts-with]
  [driver [_starts-with options x y]]
  (sql.qp/like-clause (sql.qp/->honeysql driver x) (generate-pattern driver nil y "%" options) options))

(defmethod sql.qp/->honeysql [:sql/mbql5 :contains]
  [driver [_contains options x y]]
  (sql.qp/like-clause (sql.qp/->honeysql driver x) (generate-pattern driver "%" y "%" options) options))

(defmethod sql.qp/->honeysql [:sql/mbql5 :ends-with]
  [driver [_ends-with options x y]]
  (sql.qp/like-clause (sql.qp/->honeysql driver x) (generate-pattern driver "%" y nil options) options))

(defmethod sql.qp/->honeysql [:sql/mbql5 :between]
  [driver [_between _opts expr min-val max-val]]
  [:between (sql.qp/->honeysql driver expr) (sql.qp/->honeysql driver min-val) (sql.qp/->honeysql driver max-val)])

(defmethod sql.qp/->honeysql [:sql/mbql5 :>]
  [driver [_> _opts x y]]
  [:> (sql.qp/->honeysql driver x) (sql.qp/->honeysql driver y)])

(defmethod sql.qp/->honeysql [:sql/mbql5 :<]
  [driver [_< _opts x y]]
  [:< (sql.qp/->honeysql driver x) (sql.qp/->honeysql driver y)])

(defmethod sql.qp/->honeysql [:sql/mbql5 :>=]
  [driver [_>= _opts x y]]
  [:>= (sql.qp/->honeysql driver x) (sql.qp/->honeysql driver y)])

(defmethod sql.qp/->honeysql [:sql/mbql5 :<=]
  [driver [_<= _opts x y]]
  [:<= (sql.qp/->honeysql driver x) (sql.qp/->honeysql driver y)])

(defmethod sql.qp/->honeysql [:sql/mbql5 :=]
  [driver [_= _opts x y]]
  (assert x)
  [:= (sql.qp/->honeysql driver x) (sql.qp/->honeysql driver y)])

(defmethod sql.qp/->honeysql [:sql/mbql5 :!=]
  [driver [_!= _opts x y]]
  (if (nil? (qp.wrap-value-literals/unwrap-value-literal y))
    [:not= (sql.qp/->honeysql driver x) (sql.qp/->honeysql driver y)]
    (sql.qp/correct-null-behaviour driver [:not= x y])))

(defmethod sql.qp/->honeysql [:sql/mbql5 :and]
  [driver [_and _opts & subclauses]]
  (into [:and]
        (map (partial sql.qp/->honeysql driver))
        subclauses))

(defmethod sql.qp/->honeysql [:sql/mbql5 :or]
  [driver [_or _opts & subclauses]]
  (into [:or]
        (map (partial sql.qp/->honeysql driver))
        subclauses))

(defmethod sql.qp/->honeysql [:sql/mbql5 :not]
  [driver [_not _opts subclause]]
  (if (sql.qp/clause-needs-null-behaviour-correction? subclause)
    (sql.qp/correct-null-behaviour driver [:not subclause])
    [:not (sql.qp/->honeysql driver subclause)]))

(declare compile-query)

(mu/defmethod sql.qp/join-source :sql/mbql5 :- :some
  [driver join :- ::lib.schema.join/join]
  (if-let [source-table-id (lib.util/source-table-id join)]
    (sql.qp/->honeysql driver (qp.store/table source-table-id))
    (compile-query join)))

(mu/defmethod sql.qp/join->honeysql :sql/mbql5 :- sql.qp/HoneySQLJoin
  [driver {:keys [conditions], join-alias :alias, :as join} :- ::lib.schema.join/join]
  [[(sql.qp/join-source driver join)
    (let [table-alias (sql.qp/->honeysql driver (h2x/identifier :table-alias join-alias))]
      [table-alias])]
   (sql.qp/->honeysql driver (lib.filter/combine-conditions conditions))])

(defmethod sql.qp/->honeysql [:sql/mbql5 :asc]
  [driver [direction _opts field]]
  [(sql.qp/->honeysql driver field) direction])

(defmethod sql.qp/->honeysql [:sql/mbql5 :desc]
  [driver [direction _opts field]]
  [(sql.qp/->honeysql driver field) direction])

(defmethod sql.qp/->honeysql [:sql/mbql5 :metadata/table]
  [driver table]
  (let [{table-name :name, schema :schema} table]
    (sql.qp/->honeysql driver (h2x/identifier :table schema table-name))))

(defmethod sql.qp/apply-top-level-clause [:sql/mbql5 :source-table]
  [driver _top-level-clause honeysql-form {source-table-id :source-table}]
  (let [table (lib.metadata/table (qp.metadata-provider/metadata-provider) source-table-id)]
    (sql.helpers/from honeysql-form [(sql.qp/->honeysql driver table)])))

(declare apply-clauses)

#_(defn- apply-source-query
  "Handle a `:source-query` clause by adding a recursive `SELECT` or native query. At the time of this writing, all
  source queries are aliased as `source`."
  [driver honeysql-form {{:keys [native params],
                          persisted :persisted-info/native
                          :as source-query} :source-query}]
  (assoc honeysql-form
         :from [[(cond
                   persisted
                   (sql.qp/sql-source-query persisted nil)

                   native
                   (sql.qp/sql-source-query native params)

                   :else
                   (apply-clauses driver {} source-query))
                 (let [table-alias (sql.qp/->honeysql driver (h2x/identifier :table-alias sql.qp/source-query-alias))]
                   [table-alias])]]))

#_(defn- apply-clauses
  "Like [[apply-top-level-clauses]], but handles `source-query` as well, which needs to be handled in a special way
  because it is aliased."
  [driver honeysql-form stage]
  (binding [*stage* stage]
    (sql.qp/apply-top-level-clauses driver honeysql-form stage)))

(defn- compile-stage [driver stage context]
  (try
    (assoc stage :sql.qp/honeysql (sql.qp/apply-top-level-clauses driver {} stage))
    (catch Throwable e
      (throw (ex-info (tru "Error compiling stage: {0}" (ex-message e))
                      {:driver  driver
                       :stage   stage
                       :context (dissoc context :query)
                       :type    qp.error-type/driver}
                      e)))))

(mu/defn ^:private compile-query :- [:map [:select :any] [:from :any]]
  [query]
  (transduce
   (map :sql.qp/honeysql)
   (completing
    (fn [previous-stage-honeysql stage-honeysql]
      (if-not previous-stage-honeysql
        stage-honeysql
        (assoc previous-stage-honeysql :from [[previous-stage-honeysql sql.qp/source-query-alias]]))))
   nil
   (:stages query)))

(defn mbql->honeysql
  "Build the HoneySQL form we will compile to SQL and execute."
  [driver query]
  (binding [hx/*honey-sql-version* 2]
    (lib.util.walk/walk-query
     query
     (fn [x context]
       (case (:what context)
         ;; :lib.walk/joins.after (compile-join  driver x context)
         :lib.walk/stage.post (compile-stage driver x context)
         :lib.walk/query.post (compile-query x)
         x)))))

(defn mbql->native
  "Transpile MBQL query into a native SQL statement. This is the `:sql/mbql5` driver implementation
  of [[driver/mbql->native]] (actual multimethod definition is in [[metabase.driver.sql.mbql5]]."
  [driver outer-query]
  (let [honeysql-form (mbql->honeysql driver outer-query)
        [sql & args]  (sql.qp/format-honeysql 2 (sql.qp/quote-style driver) honeysql-form)]
    {:query sql, :params args}))

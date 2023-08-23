(ns metabase.lib.filter
  (:refer-clojure
   :exclude
   [filter and or not = < <= > >= not-empty case])
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib.common :as lib.common]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.filter.operator :as lib.filter.operator]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.filter :as lib.schema.filter]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.util :as lib.util]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

(doseq [tag [:and :or]]
  (lib.hierarchy/derive tag ::compound))

(doseq [tag [:= :!=]]
  (lib.hierarchy/derive tag ::varargs))

(doseq [tag [:< :<= :> :>= :starts-with :ends-with :contains :does-not-contain]]
  (lib.hierarchy/derive tag ::binary))

(doseq [tag [:is-null :not-null :is-empty :not-empty :not]]
  (lib.hierarchy/derive tag ::unary))

(defmethod lib.metadata.calculation/describe-top-level-key-method :filters
  [query stage-number _key]
  (when-let [filters (clojure.core/not-empty (:filters (lib.util/query-stage query stage-number)))]
    (i18n/tru "Filtered by {0}"
              (lib.util/join-strings-with-conjunction
                (i18n/tru "and")
                (for [filter filters]
                  (lib.metadata.calculation/display-name query stage-number filter :long))))))

;;; Display names for filter clauses are only really used in generating descriptions for `:case` aggregations or for
;;; generating the suggested name for a query.

(defmethod lib.metadata.calculation/display-name-method ::compound
  [query stage-number [tag _opts & subclauses] style]
  (lib.util/join-strings-with-conjunction
   (clojure.core/case tag
     :and (i18n/tru "and")
     :or  (i18n/tru "or"))
   (for [clause subclauses]
     (lib.metadata.calculation/display-name query stage-number clause style))))

(defmethod lib.metadata.calculation/display-name-method ::varargs
  [query stage-number [tag _opts & exprs] style]
  (let [display-names (map #(lib.metadata.calculation/display-name query stage-number % style)
                           exprs)]
    (if (clojure.core/= (count exprs) 2)
      (let [[x y] display-names]
        (clojure.core/case tag
          :=  (i18n/tru "{0} equals {1}"         x y)
          :!= (i18n/tru "{0} does not equal {1}" x y)))
      ;; with > 2 args, `:=` works like SQL `IN`.
      ;;
      ;; with > 2 args, `:!=` works like SQL `NOT IN`.
      (let [expr   (first display-names)
            values (lib.util/join-strings-with-conjunction
                    (i18n/tru "or")
                    (rest display-names))]
        (clojure.core/case tag
          :=  (i18n/tru "{0} equals any of {1}"         expr values)
          :!= (i18n/tru "{0} does not equal any of {1}" expr values))))))

(defmethod lib.metadata.calculation/display-name-method ::binary
  [query stage-number [tag _opts x y] style]
  (let [x (lib.metadata.calculation/display-name query stage-number x style)
        y (lib.metadata.calculation/display-name query stage-number y style)]
    (clojure.core/case tag
      :<                (i18n/tru "{0} is less than {1}"                x y)
      :<=               (i18n/tru "{0} is less than or equal to {1}"    x y)
      :>                (i18n/tru "{0} is greater than {1}"             x y)
      :>=               (i18n/tru "{0} is greater than or equal to {1}" x y)
      :starts-with      (i18n/tru "{0} starts with {1}"                 x y)
      :ends-with        (i18n/tru "{0} ends with {1}"                   x y)
      :contains         (i18n/tru "{0} contains {1}"                    x y)
      :does-not-contain (i18n/tru "{0} does not contain {1}"            x y))))

(defmethod lib.metadata.calculation/display-name-method :between
  [query stage-number [_tag _opts expr x y] style]
  (i18n/tru "{0} is between {1} and {2}"
            (lib.metadata.calculation/display-name query stage-number expr style)
            (lib.metadata.calculation/display-name query stage-number x    style)
            (lib.metadata.calculation/display-name query stage-number y    style)))

(defmethod lib.metadata.calculation/display-name-method :inside
  [query stage-number [_tag opts lat-expr lon-expr lat-max lon-min lat-min lon-max] style]
  (lib.metadata.calculation/display-name query stage-number
                                         [:and opts
                                          [:between opts lat-expr lat-min lat-max]
                                          [:between opts lon-expr lon-min lon-max]]
                                         style))

(defmethod lib.metadata.calculation/display-name-method ::unary
  [query stage-number [tag _opts expr] style]
  (let [expr (lib.metadata.calculation/display-name query stage-number expr style)]
    ;; for whatever reason the descriptions of for `:is-null` and `:not-null` is "is empty" and "is not empty".
    (clojure.core/case tag
      :is-null   (i18n/tru "{0} is empty"     expr)
      :not-null  (i18n/tru "{0} is not empty" expr)
      :is-empty  (i18n/tru "{0} is empty"     expr)
      :not-empty (i18n/tru "{0} is not empty" expr)
      ;; TODO -- This description is sorta wack, we should use [[metabase.mbql.util/negate-filter-clause]] to negate
      ;; `expr` and then generate a description. That would require porting that stuff to pMBQL tho.
      :not       (i18n/tru "not {0}" expr))))

(defmethod lib.metadata.calculation/display-name-method :time-interval
  [query stage-number [_tag _opts expr n unit] style]
  (i18n/tru "{0} is within {1}"
            (lib.metadata.calculation/display-name query stage-number expr style)
            ;; this should legitimately be lowercasing in the user locale. I know system locale isn't necessarily the
            ;; same thing, but it might be. This will have to do until we have some sort of user-locale lower-case
            ;; functionality
            #_ {:clj-kondo/ignore [:discouraged-var]}
            (str/lower-case (lib.temporal-bucket/describe-temporal-interval n unit))))

(lib.common/defop and [x y & more])
(lib.common/defop or [x y & more])
(lib.common/defop not [x])
(lib.common/defop = [x y & more])
(lib.common/defop != [x y & more])
(lib.common/defop < [x y])
(lib.common/defop <= [x y])
(lib.common/defop > [x y])
(lib.common/defop >= [x y])
(lib.common/defop between [x lower upper])
(lib.common/defop inside [lat lon lat-max lon-min lat-min lon-max])
(lib.common/defop is-null [x])
(lib.common/defop not-null [x])
(lib.common/defop is-empty [x])
(lib.common/defop not-empty [x])
(lib.common/defop starts-with [whole part])
(lib.common/defop ends-with [whole part])
(lib.common/defop contains [whole part])
(lib.common/defop does-not-contain [whole part])
(lib.common/defop time-interval [x amount unit])
(lib.common/defop segment [segment-id])

(mu/defn filter :- :metabase.lib.schema/query
  "Sets `boolean-expression` as a filter on `query`."
  ([query :- :metabase.lib.schema/query
    boolean-expression]
   (metabase.lib.filter/filter query nil boolean-expression))

  ([query :- :metabase.lib.schema/query
    stage-number :- [:maybe :int]
    boolean-expression]
   ;; if this is a Segment metadata, convert it to `:segment` MBQL clause before adding
   (if (clojure.core/= (lib.dispatch/dispatch-value boolean-expression) :metadata/segment)
     (recur query stage-number (lib.ref/ref boolean-expression))
     (let [stage-number (clojure.core/or stage-number -1)
           new-filter (lib.common/->op-arg boolean-expression)]
       (lib.util/update-query-stage query stage-number update :filters (fnil conj []) new-filter)))))

(mu/defn filters :- [:maybe [:ref ::lib.schema/filters]]
  "Returns the current filters in stage with `stage-number` of `query`.
  If `stage-number` is omitted, the last stage is used. Logicaly, the
  filter attached to the query is the conjunction of the expressions
  in the returned list. If the returned list is empty, then there is no
  filter attached to the query.
  See also [[metabase.lib.util/query-stage]]."
  ([query :- :metabase.lib.schema/query] (filters query nil))
  ([query :- :metabase.lib.schema/query
    stage-number :- [:maybe :int]]
   (clojure.core/not-empty (:filters (lib.util/query-stage query (clojure.core/or stage-number -1))))))

(def ColumnWithOperators
  "Malli schema for ColumnMetadata extended with the list of applicable operators."
  [:merge
   lib.metadata/ColumnMetadata
   [:map
    [:operators {:optional true} [:sequential ::lib.schema.filter/operator]]]])

(mu/defn filterable-column-operators :- [:maybe [:sequential ::lib.schema.filter/operator]]
  "Returns the operators for which `filterable-column` is applicable."
  [filterable-column :- ColumnWithOperators]
  (:operators filterable-column))

(defn add-column-operators
  "Extend the column metadata with the available operators if any."
  [column]
  (let [operators (lib.filter.operator/filter-operators column)]
    (m/assoc-some column :operators (clojure.core/not-empty operators))))

(mu/defn filterable-columns :- [:sequential ColumnWithOperators]
  "Get column metadata for all the columns that can be filtered in
  the stage number `stage-number` of the query `query`
  If `stage-number` is omitted, the last stage is used.
  The rules for determining which columns can be broken out by are as follows:

  1. custom `:expressions` in this stage of the query

  2. Fields 'exported' by the previous stage of the query, if there is one;
     otherwise Fields from the current `:source-table`

  3. Fields exported by explicit joins

  4. Fields in Tables that are implicitly joinable."

  ([query :- ::lib.schema/query]
   (filterable-columns query -1))

  ([query        :- ::lib.schema/query
    stage-number :- :int]
   (let [stage (lib.util/query-stage query stage-number)]
     (clojure.core/not-empty
      (into []
            (comp (map add-column-operators)
                  (clojure.core/filter :operators))
            (lib.metadata.calculation/visible-columns query stage-number stage))))))

(mu/defn filter-clause :- ::lib.schema.expression/boolean
  "Returns a standalone filter clause for a `filter-operator`,
  a `column`, and arguments."
  [filter-operator :- ::lib.schema.filter/operator
   column :- lib.metadata/ColumnMetadata
   & args]
  (lib.options/ensure-uuid (into [(:short filter-operator) {} (lib.common/->op-arg column)]
                                 (map lib.common/->op-arg args))))

(mu/defn filter-operator :- ::lib.schema.filter/operator
  "Return the filter operator of the boolean expression `filter-clause`
  at `stage-number` in `query`.
  If `stage-number` is omitted, the last stage is used."
  ([query a-filter-clause]
   (filter-operator query -1 a-filter-clause))

  ([query :- ::lib.schema/query
    stage-number :- :int
    a-filter-clause :- ::lib.schema.expression/boolean]
   (let [[op _ first-arg] a-filter-clause
         stage   (lib.util/query-stage query stage-number)
         columns (lib.metadata.calculation/visible-columns query stage-number stage)
         col     (lib.equality/closest-matching-metadata query stage-number first-arg columns)]
     (clojure.core/or (m/find-first #(clojure.core/= (:short %) op)
                                    (lib.filter.operator/filter-operators col))
                      (lib.filter.operator/operator-def op)))))


(mu/defn find-filter-for-legacy-filter :- [:maybe ::lib.schema.expression/boolean]
  "Return the filter clause in `query` at stage `stage-number` matching the legacy
  filter clause `legacy-filter`, if any."
  ([query :- ::lib.schema/query
    legacy-filter]
   (find-filter-for-legacy-filter query -1 legacy-filter))

  ([query         :- ::lib.schema/query
    stage-number  :- :int
    legacy-filter :- some?]
   (let [legacy-filter    (mbql.normalize/normalize-fragment [:query :filter] legacy-filter)
         query-filters    (vec (filters query stage-number))
         matching-filters (clojure.core/filter #(clojure.core/= (mbql.normalize/normalize-fragment
                                                                 [:query :filter]
                                                                 (lib.convert/->legacy-MBQL %))
                                                                legacy-filter)
                                               query-filters)]
     (when (seq matching-filters)
       (if (next matching-filters)
         (throw (ex-info "Multiple matching filters found" {:legacy-filter    legacy-filter
                                                            :query-filters    query-filters
                                                            :matching-filters matching-filters}))
         (first matching-filters))))))

;; TODO: Refactor this away - handle legacy refs in `lib.js` and call `lib.equality` from there.
(mu/defn find-filterable-column-for-legacy-ref :- [:maybe ColumnWithOperators]
  "Given a legacy `:field` reference, return the filterable [[ColumnWithOperators]] that best fits it."
  ([query legacy-ref]
   (find-filterable-column-for-legacy-ref query -1 legacy-ref))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    legacy-ref   :- some?]
   (let [a-ref   (lib.convert/legacy-ref->pMBQL query stage-number legacy-ref)
         columns (filterable-columns query stage-number)]
     (lib.equality/closest-matching-metadata a-ref columns))))

(def ^:private FilterParts
  [:map
   [:lib/type [:= :mbql/filter-parts]]
   [:operator ::lib.schema.filter/operator]
   [:options ::lib.schema.common/options]
   [:column [:maybe ColumnWithOperators]]
   [:args [:sequential :any]]])

(mu/defn filter-parts :- FilterParts
  "Return the parts of the filter clause `a-filter-clause` in query `query` at stage `stage-number`.
  Might obsolate [[filter-operator]]."
  ([query a-filter-clause]
   (filter-parts query -1 a-filter-clause))

  ([query :- ::lib.schema/query
    stage-number :- :int
    a-filter-clause :- ::lib.schema.expression/boolean]
   (let [[op options first-arg & rest-args] a-filter-clause
         stage   (lib.util/query-stage query stage-number)
         columns (lib.metadata.calculation/visible-columns query stage-number stage)
         col     (lib.equality/closest-matching-metadata query stage-number first-arg columns)]
     {:lib/type :mbql/filter-parts
      :operator (clojure.core/or (m/find-first #(clojure.core/= (:short %) op)
                                               (lib.filter.operator/filter-operators col))
                                 (lib.filter.operator/operator-def op))
      :options  options
      :column   (some-> col add-column-operators)
      :args     (vec rest-args)})))

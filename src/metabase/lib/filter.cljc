(ns metabase.lib.filter
  (:refer-clojure
   :exclude
   [filter and or not = < <= > >= not-empty case])
  (:require
   [clojure.string :as str]
   [metabase.lib.common :as lib.common]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.filter :as lib.schema.filter]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util :as u]
   [metabase.util.malli :as mu])
  #?(:cljs (:require-macros [metabase.lib.filter])))

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
   (let [stage-number (clojure.core/or stage-number -1)
         new-filter (lib.common/->op-arg query stage-number boolean-expression)]
     (lib.util/update-query-stage query stage-number update :filters (fnil conj []) new-filter))))

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

(defmethod lib.metadata.calculation/display-name-method :mbql.filter/operator
  [_query _stage-number {:keys [display-name]} _display-name-style]
  display-name)

(defmethod lib.metadata.calculation/display-info-method :mbql.filter/operator
  [_query _stage-number {:keys [display-name] short-name :short}]
  {:short-name (u/qualified-name short-name)
   :display-name display-name})

(defn- filter-operators
  "The list of available filter operators.
   The order of operators is relevant for the front end.
   There are slight differences between names and ordering for the different base types."
  [column]
  (let [key-operators [{:short := :display-name (i18n/tru "Is")}
                       {:short :!= :display-name (i18n/tru "Is not")}
                       {:short :> :display-name (i18n/tru "Greater than")}
                       {:short :< :display-name (i18n/tru "Less than")}
                       {:short :between :display-name (i18n/tru "Between")}
                       {:short :>= :display-name (i18n/tru "Greater than or equal to")}
                       {:short :<= :display-name (i18n/tru "Less than or equal to")}
                       {:short :is-null :display-name (i18n/tru "Is empty")}
                       {:short :not-null :display-name (i18n/tru "Not empty")}]]
    ;; The order of these clauses is important since we want to match the most relevant type
    (condp #(lib.types.isa/isa? %2 %1) column
      :type/PK
      key-operators

      :type/FK
      key-operators

      :type/Location
      [{:short := :display-name (i18n/tru "Is")}
       {:short :!= :display-name (i18n/tru "Is not")}
       {:short :is-empty :display-name (i18n/tru "Is empty")}
       {:short :not-empty :display-name (i18n/tru "Not empty")}
       {:short :contains :display-name (i18n/tru "Contains")}
       {:short :does-not-contain :display-name (i18n/tru "Does not contain")}
       {:short :starts-with :display-name (i18n/tru "Starts with")}
       {:short :ends-with :display-name (i18n/tru "Ends with")}]

      :type/Temporal
      [{:short :!= :display-name (i18n/tru "Excludes")}
       {:short := :display-name (i18n/tru "Is")}
       {:short :< :display-name (i18n/tru "Before")}
       {:short :> :display-name (i18n/tru "After")}
       {:short :between :display-name (i18n/tru "Between")}
       {:short :is-null :display-name (i18n/tru "Is empty")}
       {:short :not-null :display-name (i18n/tru "Not empty")}]

      :type/Coordinate
      [{:short := :display-name (i18n/tru "Is")}
       {:short :!= :display-name (i18n/tru "Is not")}
       {:short :inside :display-name (i18n/tru "Inside")}
       {:short :> :display-name (i18n/tru "Greater than")}
       {:short :< :display-name (i18n/tru "Less than")}
       {:short :between :display-name (i18n/tru "Between")}
       {:short :>= :display-name (i18n/tru "Greater than or equal to")}
       {:short :<= :display-name (i18n/tru "Less than or equal to")}]

      :type/Number
      [{:short := :display-name (i18n/tru "Equal to")}
       {:short :!= :display-name (i18n/tru "Not equal to")}
       {:short :> :display-name (i18n/tru "Greater than")}
       {:short :< :display-name (i18n/tru "Less than")}
       {:short :between :display-name (i18n/tru "Between")}
       {:short :>= :display-name (i18n/tru "Greater than or equal to")}
       {:short :<= :display-name (i18n/tru "Less than or equal to")}
       {:short :is-null :display-name (i18n/tru "Is empty")}
       {:short :not-null :display-name (i18n/tru "Not empty")}]

      :type/Text
      [{:short := :display-name (i18n/tru "Is")}
       {:short :!= :display-name (i18n/tru "Is not")}
       {:short :contains :display-name (i18n/tru "Contains")}
       {:short :does-not-contain :display-name (i18n/tru "Does not contain")}
       {:short :is-null :display-name (i18n/tru "Is null")}
       {:short :not-null :display-name (i18n/tru "Not null")}
       {:short :is-empty :display-name (i18n/tru "Is empty")}
       {:short :not-empty :display-name (i18n/tru "Not empty")}
       {:short :starts-with :display-name (i18n/tru "Starts with")}
       {:short :ends-with :display-name (i18n/tru "Ends with")}]

      :type/TextLike
      [{:short := :display-name (i18n/tru "Is")}
       {:short :!= :display-name (i18n/tru "Is not")}
       {:short :is-null :display-name (i18n/tru "Is null")}
       {:short :not-null :display-name (i18n/tru "Not null")}
       {:short :is-empty :display-name (i18n/tru "Is empty")}
       {:short :not-empty :display-name (i18n/tru "Not empty")}]

      :type/Boolean
      [{:short := :display-name (i18n/tru "Is")}
       {:short :is-null :display-name (i18n/tru "Is empty")}
       {:short :not-null :display-name (i18n/tru "Not empty")}]

      ;; default
      [{:short := :display-name (i18n/tru "Is")}
       {:short :!= :display-name (i18n/tru "Is not")}
       {:short :is-null :display-name (i18n/tru "Is null")}
       {:short :not-null :display-name (i18n/tru "Not null")}])))

(def ^:private ColumnWithOperators
  [:merge
   lib.metadata/ColumnMetadata
   [:map
    [:operators {:optional true} [:sequential ::lib.schema.filter/operator]]]])

(mu/defn filterable-column-operators :- [:maybe [:sequential ::lib.schema.filter/operator]]
  "Returns the operators for which `filterable-column` is applicable."
  [filterable-column :- ColumnWithOperators]
  (:operators filterable-column))

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
   (let [stage (lib.util/query-stage query stage-number)
         columns (lib.metadata.calculation/visible-columns query stage-number stage)
         with-operators (fn [column]
                          (when-let [operators (->> (filter-operators column)
                                                    (mapv #(assoc % :lib/type :mbql.filter/operator))
                                                    clojure.core/not-empty)]
                            (assoc column :operators operators)))]
     (clojure.core/not-empty
       (into []
             (keep with-operators)
             columns)))))

(mu/defn filter-clause
  "Returns a standalone filter clause for a `filter-operator`,
  a `column`, and arguments."
  [filter-operator :- ::lib.schema.filter/operator
   column :- lib.metadata/ColumnMetadata
   & args]
  {:lib/type :lib/external-op
   :operator (:short filter-operator)
   :args (into [column] args)})

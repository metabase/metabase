(ns metabase.lib.filter
  (:refer-clojure :exclude [filter and or not = < <= > ->> >= not-empty case])
  (:require
   [metabase.lib.common :as lib.common]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema]
   [metabase.lib.schema.common :as schema.common]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.humanization :as u.humanization]
   [metabase.util.malli :as mu])
  #?(:cljs (:require-macros [metabase.lib.filter])))

(comment metabase.lib.schema/keep-me)

(defmethod lib.metadata.calculation/describe-top-level-key-method :filter
  [query stage-number _key]
  (when-let [filter-clause (:filter (lib.util/query-stage query stage-number))]
    (i18n/tru "Filtered by {0}" (lib.metadata.calculation/display-name query stage-number filter-clause))))

;;; Display names for filter clauses are only really used in generating descriptions for `:case` aggregations or for
;;; generating the suggested name for a query.

(defmethod lib.metadata.calculation/display-name-method :segment
  [query _stage-number [_tag _opts segment-id]]
  (let [segment-metadata (lib.metadata/segment query segment-id)]
    (clojure.core/or
     (:display_name segment-metadata)
     (some->> (:name segment-metadata) (u.humanization/name->human-readable-name :simple))
     (i18n/tru "[Unknown Segment]"))))

(defmethod lib.metadata.calculation/display-name-method :and
  [query stage-number [_tag _opts & subclauses]]
  (lib.util/join-strings-with-conjunction
   (i18n/tru "and")
   (for [clause subclauses]
     (lib.metadata.calculation/display-name query stage-number clause))))

(defmethod lib.metadata.calculation/display-name-method :or
  [query stage-number [_tag _opts & subclauses]]
  (lib.util/join-strings-with-conjunction
   (i18n/tru "or")
   (for [clause subclauses]
     (lib.metadata.calculation/display-name query stage-number clause))))

;;; the rest of the filter clauses should just use the display name for their first argument I guess. At least this is
;;; what MLv1 did. Don't want to think about this too much, we can change it later.

(defmethod lib.metadata.calculation/display-name-method :not
  [query stage-number [_tag _opts expr]]
  ;; TODO -- This description is sorta wack, we should use [[metabase.mbql.util/negate-filter-clause]] to negate
  ;; `expr` and then generate a description. That would require porting that stuff to pMBQL tho.
  (i18n/tru "not {0}" (lib.metadata.calculation/display-name query stage-number expr)))

;;; with > 2 args, `:=` works like SQL `IN`.
(defmethod lib.metadata.calculation/display-name-method :=
  [query stage-number [_tag _opts & exprs]]
  (let [display-names (map (partial lib.metadata.calculation/display-name query stage-number)
                           exprs)]
    (if (clojure.core/= (count exprs) 2)
      (i18n/tru "{0} equals {1}" (first display-names) (second display-names))
      (i18n/tru "{0} equals any of {1}"
                (first display-names)
                (lib.util/join-strings-with-conjunction
                 (i18n/tru "or")
                 (rest display-names))))))

;;; with > 2 args, `:!=` works like SQL `NOT IN`.
(defmethod lib.metadata.calculation/display-name-method :!=
  [query stage-number [_tag _opts & exprs]]
  (let [display-names (map (partial lib.metadata.calculation/display-name query stage-number)
                           exprs)]
    (if (clojure.core/= (count exprs) 2)
      (i18n/tru "{0} does not equal {1}" (first display-names) (second display-names))
      (i18n/tru "{0} does not equal any of {1}"
                (first display-names)
                (lib.util/join-strings-with-conjunction
                 (i18n/tru "or")
                 (rest display-names))))))

(defmethod lib.metadata.calculation/display-name-method :<
  [query stage-number [_tag _opts x y]]
  (i18n/tru "{0} is less than {1}"
            (lib.metadata.calculation/display-name query stage-number x)
            (lib.metadata.calculation/display-name query stage-number y)))

(defmethod lib.metadata.calculation/display-name-method :<=
  [query stage-number [_tag _opts x y]]
  (i18n/tru "{0} is less than or equal to {1}"
            (lib.metadata.calculation/display-name query stage-number x)
            (lib.metadata.calculation/display-name query stage-number y)))

(defmethod lib.metadata.calculation/display-name-method :>
  [query stage-number [_tag _opts x y]]
  (i18n/tru "{0} is greater than {1}"
            (lib.metadata.calculation/display-name query stage-number x)
            (lib.metadata.calculation/display-name query stage-number y)))

(defmethod lib.metadata.calculation/display-name-method :>=
  [query stage-number [_tag _opts x y]]
  (i18n/tru "{0} is greater than or equal to {1}"
            (lib.metadata.calculation/display-name query stage-number x)
            (lib.metadata.calculation/display-name query stage-number y)))

(defmethod lib.metadata.calculation/display-name-method :between
  [query stage-number [_tag _opts expr x y]]
  (i18n/tru "{0} is between {1} and {2}"
            (lib.metadata.calculation/display-name query stage-number expr)
            (lib.metadata.calculation/display-name query stage-number x)
            (lib.metadata.calculation/display-name query stage-number y)))

(defmethod lib.metadata.calculation/display-name-method :inside
  [query stage-number [_tag opts lat-expr lon-expr lat-max lon-min lat-min lon-max]]
  (lib.metadata.calculation/display-name query stage-number
                                         [:and opts
                                          [:between opts lat-expr lat-min lat-max]
                                          [:between opts lon-expr lon-min lon-max]]))

;;; for whatever reason the descriptions of for `:is-null` and `:not-null` is "is empty" and "is not empty".
(defmethod lib.metadata.calculation/display-name-method :is-null
  [query stage-number [_tag _opts expr]]
  (i18n/tru "{0} is empty" (lib.metadata.calculation/display-name query stage-number expr)))

(defmethod lib.metadata.calculation/display-name-method :not-null
  [query stage-number [_tag _opts expr]]
  (i18n/tru "{0} is not empty" (lib.metadata.calculation/display-name query stage-number expr)))

(defmethod lib.metadata.calculation/display-name-method :is-empty
  [query stage-number [_tag _opts expr]]
  (i18n/tru "{0} is empty" (lib.metadata.calculation/display-name query stage-number expr)))

(defmethod lib.metadata.calculation/display-name-method :not-empty
  [query stage-number [_tag _opts expr]]
  (i18n/tru "{0} is not empty" (lib.metadata.calculation/display-name query stage-number expr)))

(defmethod lib.metadata.calculation/display-name-method :starts-with
  [query stage-number [_tag _opts whole part]]
  (i18n/tru "{0} starts with {1}"
            (lib.metadata.calculation/display-name query stage-number whole)
            (lib.metadata.calculation/display-name query stage-number part)))

(defmethod lib.metadata.calculation/display-name-method :ends-with
  [[query stage-number [_tag _opts whole part]]]
  (i18n/tru "{0} ends with {1}"
            (lib.metadata.calculation/display-name query stage-number whole)
            (lib.metadata.calculation/display-name query stage-number part)))

(defmethod lib.metadata.calculation/display-name-method :contains
  [query stage-number [_tag _opts whole part]]
  (i18n/tru "{0} contains {1}"
            (lib.metadata.calculation/display-name query stage-number whole)
            (lib.metadata.calculation/display-name query stage-number part)))

(defmethod lib.metadata.calculation/display-name-method :does-not-contain
  [query stage-number [_tag _opts whole part]]
  (i18n/tru "{0} does not contain {1}"
            (lib.metadata.calculation/display-name query stage-number whole)
            (lib.metadata.calculation/display-name query stage-number part)))

(defmethod lib.metadata.calculation/display-name-method :time-interval
  [query stage-number [_tag _opts expr n unit]]
  (i18n/tru "{0} is within {1}"
            (lib.metadata.calculation/display-name query stage-number expr)
            (lib.temporal-bucket/interval->i18n n unit)))

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
     (lib.util/update-query-stage query stage-number assoc :filter new-filter))))

(defn- and-clause? [clause]
  (clojure.core/and (vector? clause)
                    (clojure.core/= (first clause) :and)))

(mu/defn current-filter :- [:maybe ::schema.common/external-op]
  "Returns the current filter in stage with `stage-number` of `query`.
  If `stage-number` is omitted, the last stage is used.
  See also [[metabase.lib.util/query-stage]]."
  ([query :- :metabase.lib.schema/query] (current-filter query nil))
  ([query :- :metabase.lib.schema/query
    stage-number :- [:maybe :int]]
   (-> (lib.util/query-stage query (clojure.core/or stage-number -1))
       :filter
       lib.common/external-op)))

(mu/defn current-filters :- [:sequential ::schema.common/external-op]
  "Returns the current filters in stage with `stage-number` of `query`.
  If `stage-number` is omitted, the last stage is used. Logicaly, the
  filter attached to the query is the conjunction of the expressions
  in the returned list. If the returned list is empty, then there is no
  filter attached to the query.
  See also [[metabase.lib.util/query-stage]]."
  ([query :- :metabase.lib.schema/query] (current-filters query nil))
  ([query :- :metabase.lib.schema/query
    stage-number :- [:maybe :int]]
   (if-let [existing-filter (:filter (lib.util/query-stage query (clojure.core/or stage-number -1)))]
     (if (and-clause? existing-filter)
       (mapv lib.common/external-op (subvec existing-filter 2))
       [(lib.common/external-op existing-filter)])
     [])))

(defn- conjoin [existing-filter new-filter]
  (-> (cond
        (nil? existing-filter)        new-filter
        (and-clause? existing-filter) (conj existing-filter new-filter)
        :else                         [:and existing-filter new-filter])
      lib.options/ensure-uuid))

(mu/defn add-filter :- :metabase.lib.schema/query
  "Adds `boolean-expression` as a filter on `query` if there is no filter
  yet, builds a conjunction with the current filter otherwise."
  ([query :- :metabase.lib.schema/query
    boolean-expression]
   (metabase.lib.filter/add-filter query nil boolean-expression))

  ([query :- :metabase.lib.schema/query
    stage-number :- [:maybe :int]
    boolean-expression]
   (let [stage-number (clojure.core/or stage-number -1)
         new-filter (lib.common/->op-arg query stage-number boolean-expression)]
     (lib.util/update-query-stage query stage-number update :filter conjoin new-filter))))

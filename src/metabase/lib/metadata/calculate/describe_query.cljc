(ns metabase.lib.metadata.calculate.describe-query
  "Generate a description for an MBQL query."
  (:require
   [clojure.string :as str]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculate.names :as calculate.names]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(defmulti ^:private describe-part
  "Describe a specific part of a specific stage of a query, e.g. the `:table` or the `:aggregations`."
  {:arglists '([query stage-number what])}
  (fn [_query _stage-number what]
    (keyword what)))

(defmethod describe-part :table
  [query stage-number _what]
  (let [stage (lib.util/query-stage query stage-number)]
    (println "stage:" (pr-str stage)) ; NOCOMMIT
    (when-let [source-table-id (:source-table stage)]
      (println "source-table-id:" source-table-id) ; NOCOMMIT
      (when-let [table-metadata (lib.metadata/table query source-table-id)]
        (println "table-metadata:" table-metadata) ; NOCOMMIT
        (calculate.names/display-name query stage-number table-metadata)))))

(defmethod describe-part :aggregations
  [query stage-number _what]
  (when-let [aggregations (not-empty (:aggregation (lib.util/query-stage query stage-number)))]
    (calculate.names/join-strings-with-conjunction
     (i18n/tru "and")
     (for [aggregation aggregations]
       (calculate.names/display-name query stage-number aggregation)))))

(defmethod describe-part :breakout
  [query stage-number _what]
  (when-let [breakouts (not-empty (:breakout (lib.util/query-stage query stage-number)))]
    (i18n/tru "Grouped by {0}"
              (str/join (str \space (i18n/tru "and") \space)
                        (for [breakout breakouts]
                          (calculate.names/display-name query stage-number breakout))))))

(defmethod describe-part :filter
  [query stage-number _what]
  (when-let [filter-clause (:filter (lib.util/query-stage query stage-number))]
    (i18n/tru "Filtered by {0}" (calculate.names/display-name query stage-number filter-clause))))

(defmethod describe-part :order-by
  [query stage-number _what]
  (when-let [order-bys (not-empty (:order-by (lib.util/query-stage query stage-number)))]
    (i18n/tru "Sorted by {0}"
              (calculate.names/join-strings-with-conjunction
               (i18n/tru "and")
               (for [order-by order-bys]
                 (calculate.names/display-name query stage-number order-by))))))

(defmethod describe-part :limit
  [query stage-number _what]
  (when-let [limit (:limit (lib.util/query-stage query stage-number))]
    (str limit \space (i18n/trun "row" "rows" limit))))

(mr/def ::describable-part
  [:enum :table :aggregations :breakout :filter :order-by :limit])

(mr/def  ::describe-query-options
  [:maybe
   [:map
    [:parts {:optional true} [:maybe [:sequential [:ref ::describable-part]]]]]])

(def ^:private default-options
  {:parts [:table :aggregations :breakout :filter :order-by :limit]})

;;;    if (!tableMetadata || (this.isNative() && !this.displayName())) {
;;;      return "";
;;;    }
;;;
;;;    options = {
;;;      sections: [
;;;        "table",
;;;        "aggregation",
;;;        "breakout",
;;;        "filter",
;;;        "order-by",
;;;        "limit",
;;;      ],
;;;      ...options,
;;;    };
;;;
;;;    const sectionFns = {
;;;      table: this._getTableDescription.bind(this),
;;;      aggregation: this._getAggregationDescription.bind(this),
;;;      breakout: this._getBreakoutDescription.bind(this),
;;;      filter: this._getFilterDescription.bind(this),
;;;      "order-by": this._getOrderByDescription.bind(this),
;;;      limit: this._getLimitDescription.bind(this),
;;;    };
;;;
;;;    // these array gymnastics are needed to support JSX formatting
;;;    const query = this.datasetQuery().query;
;;;    const sections = options.sections
;;;      .map(section =>
;;;        _.flatten(sectionFns[section](tableMetadata, query, options)).filter(
;;;          s => !!s,
;;;        ),
;;;      )
;;;      .filter(s => s && s.length > 0);
;;;
;;;    const description = _.flatten(DESCRIPTION.joinList(sections, ", "));
;;;    return description.join("");
(mu/defn describe-query :- ::lib.schema.common/non-blank-string
  "Generate a one-line description of a query, appropriate as a suggested name when saving a query.

    (describe-query query)
    ;; =>
    \"Orders, Sum of Total, Grouped by User, Sorted by User ascending, 10 rows\""
  ([query]
   (describe-query query -1 nil))

  ([query options]
   (describe-query query -1 options))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    options      :- ::describe-query-options]
   (let [parts        (or (not-empty (:parts options))
                          (:parts default-options))
         descriptions (for [part parts]
                        (describe-part query stage-number part))]
     (str/join ", " (remove str/blank? descriptions)))))

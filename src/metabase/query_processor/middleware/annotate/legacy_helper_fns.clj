(ns metabase.query-processor.middleware.annotate.legacy-helper-fns
  "Helper functions that used to live in the old implementation of [[metabase.query-processor.middleware.annotate]]
  that no longer do since we rewrote it to use MLv2. These were used by various drivers for various nefarious purposes.

  I'm keeping them around for now so drivers can continue to use them until we work on converting drivers to MLv2 (at
  which point they can use MLv2 directly)."
  (:require
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.store :as qp.store]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(defn- legacy-inner-query->mlv2-query [inner-query]
  (qp.store/cached [:mlv2-query (hash inner-query)]
    (try
      (lib/query-from-legacy-inner-query
       (qp.store/metadata-provider)
       (:id (lib.metadata/database (qp.store/metadata-provider)))
       (mbql.normalize/normalize-fragment [:query] inner-query))
      (catch Throwable e
        (throw (ex-info (tru "Error converting query to pMBQL: {0}" (ex-message e))
                        {:inner-query inner-query, :type qp.error-type/qp}
                        e))))))

(mu/defn aggregation-name :- ::lib.schema.common/non-blank-string
  "Return an appropriate aggregation name/alias *used inside a query* for an `:aggregation` subclause (an aggregation
  or expression). Takes an options map as schema won't support passing keypairs directly as a varargs.

  These names are also used directly in queries, e.g. in the equivalent of a SQL `AS` clause."
  [legacy-inner-query :- :map
   legacy-ag-clause]
  (lib/column-name
   (legacy-inner-query->mlv2-query legacy-inner-query)
   (lib/->pMBQL legacy-ag-clause)))

(mu/defn merged-column-info :- :metabase.query-processor.middleware.annotate/cols
  "Returns deduplicated and merged column metadata (`:cols`) for query results by combining (a) the initial results
  metadata returned by the driver's impl of `execute-reducible-query` and (b) column metadata inferred by logic in
  this namespace."
  [legacy-query {initial-cols :cols, :as _initial-metadata} :- [:maybe :map]]
  (let [expected-cols (requiring-resolve 'metabase.query-processor.middleware.annotate/expected-cols)
        mlv2-query    (lib/query
                       (qp.store/metadata-provider)
                       legacy-query)]
    (expected-cols mlv2-query initial-cols)))
;; In qp: `annotate/infer-expression-type`
;; In MLv2: `expression/type-of-method :case`
(defn infer-expression-type
  "Infer base-type/semantic-type information about an `expression` clause."
  [expression]
  {:base_type :type/*}
  #_(cond
    (string? expression)
    {:base_type :type/Text}

    (number? expression)
    {:base_type :type/Number}

    (boolean? expression)
    {:base_type :type/Boolean}

    (mbql.u/is-clause? :value expression)
    (let [[_ value options] expression]
      (or (not-empty (select-keys options type-info-columns))
          (select-keys (infer-expression-type value) type-info-columns)))

    (mbql.u/is-clause? :field expression)
    (col-info-for-field-clause {} expression)

    (mbql.u/is-clause? :coalesce expression)
    (select-keys (infer-expression-type (second expression)) type-info-columns)

    (mbql.u/is-clause? :length expression)
    {:base_type :type/BigInteger}

    (mbql.u/is-clause? :case expression)
    (let [[_ clauses] expression]
      (some
       (fn [[_ expression]]
         ;; get the first non-nil val
         (when (and (not= expression nil)
                    (or (not (mbql.u/is-clause? :value expression))
                        (let [[_ value] expression]
                          (not= value nil))))
           (select-keys (infer-expression-type expression) type-info-columns)))
       clauses))

    (mbql.u/is-clause? :convert-timezone expression)
    {:converted_timezone (nth expression 2)
     :base_type          :type/DateTime}

    (datetime-arithmetics? expression)
    ;; make sure converted_timezone survived if we do nested datetime operations
    ;; FIXME: this does not preverse converted_timezone for cases nested expressions
    ;; i.e:
    ;; {"expression" {"converted-exp" [:convert-timezone "created-at" "Asia/Ho_Chi_Minh"]
    ;;                "date-add-exp"  [:datetime-add [:expression "converted-exp"] 2 :month]}}
    ;; The converted_timezone metadata added for "converted-exp" will not be brought over
    ;; to ["date-add-exp"].
    ;; maybe this `infer-expression-type` should takes an `inner-query` and look up the
    ;; source expresison as well?
    (merge (select-keys (infer-expression-type (second expression)) [:converted_timezone])
           {:base_type :type/DateTime})

    (mbql.u/is-clause? mbql.s/string-functions expression)
    {:base_type :type/Text}

    (mbql.u/is-clause? mbql.s/numeric-functions expression)
    {:base_type :type/Float}

    (mbql.u/is-clause? mbql.s/boolean-functions expression)
    {:base_type :type/Boolean}

    :else
    {:base_type :type/*}))

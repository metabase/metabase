(ns metabase.query-processor-test.test-mlv2
  ;; TODO -- should this be `metabase.query-processor.middleware.test-mlv2`?
  (:require
   [clojure.test :refer :all]
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.schema :as lib.schema]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.mbql.util :as mbql.u]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn- do-with-legacy-query-testing-context [query thunk]
  (testing (format "\nlegacy query =\n%s\n" (u/pprint-to-str query))
    (thunk)))

(defn- do-with-pMBQL-query-testing-context [pMBQL thunk]
  (testing (format "\npMBQL =\n%s\n" (u/pprint-to-str pMBQL))
    (thunk)))

(defn- skip-conversion-tests? [query]
  (or
   ;; #29898: `:joins` with `:fields` other than `:all` or `:none` are not normalized correctly.
   (mbql.u/match-one query
     {:joins joins}
     (mbql.u/match-one joins
       {:fields fields}
       (mbql.u/match-one fields
         :field
         "#29898")))
   ;; #29897: `:datetime-diff` is not handled correctly.
   (mbql.u/match-one query
     :datetime-diff
     "#29897")
   ;; #29904: `:fields` in `:joins` are supposed to be returned even if `:fields` is specified.
   (mbql.u/match-one query
     {:fields fields, :joins joins}
     (mbql.u/match-one joins
       {:fields (join-fields :guard (partial not= :none))}
       "#29904"))
   ;; #29895: `:value` is not supported
   (mbql.u/match-one query
     :value
     "#29895")
   ;; #29907: wrong column name for joined columns in `:breakout`
   (mbql.u/match-one query
     {:breakout breakouts}
     (mbql.u/match-one breakouts
       [:field _id-or-name {:join-alias _join-alias}]
       "#29907"))
   ;; #29908: native queries do not round trip correctly
   (when (:native query)
     "#29908")
   ;; #29909: these clauses are not implemented yet.
   (mbql.u/match-one query
     #{:get-year :get-quarter :get-month :get-day :get-day-of-week :get-hour :get-minute :get-second}
     "#29909")
   ;; #29770: `:absolute-datetime` does not work correctly
   (mbql.u/match-one query
     :absolute-datetime
     "#29770")
   ;; #29910: `:datetime-add` and `:datetime-subtract` broken with strings literals
   (mbql.u/match-one query
     #{:datetime-add :datetime-subtract}
     (mbql.u/match-one &match
       [_tag (_literal :guard string?) & _]
       "#29910"))
   ;; #29935: metadata for an `:aggregation` with a `:case` expression not working
   (mbql.u/match-one query
     {:aggregation aggregations}
     (mbql.u/match-one aggregations
       :case
       "#29935"))
   ;; #29936: metadata for an `:aggregation` that is a `:metric`
   (mbql.u/match-one query
     {:aggregation aggregations}
     (mbql.u/match-one aggregations
       :metric
       "#28689"))
   ;; #29938: `:case` with default value does not work correctly
   (mbql.u/match-one query
     :case
     (mbql.u/match-one &match
       {:default _default}
       "#29938"))))

(defn- test-mlv2-metadata [original-query qp-metadata]
  {:pre [(map? original-query)]}
  (when-not (skip-conversion-tests? original-query)
    (do-with-legacy-query-testing-context
     original-query
     (^:once fn* []
      (let [pMBQL (-> original-query lib.convert/->pMBQL)]
        ;; don't bother doing this test if the output is invalid; [[test-mlv2-conversion]] will fail anyway, no point in
        ;; triggering an Exception here as well.
        (when (mc/validate ::lib.schema/query pMBQL)
          (do-with-pMBQL-query-testing-context
           pMBQL
           (^:once fn* []
            (try
              (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (:database original-query))
                    mlv2-query        (lib/query metadata-provider pMBQL)
                    mlv2-metadata     (lib.metadata.calculation/metadata mlv2-query)]
                (testing "Generated column names should match names in QP metadata"
                  (is (= (mapv (some-fn :qp/actual-name :name) (:cols qp-metadata))
                         (mapv :lib/desired-column-alias mlv2-metadata)))))
              (catch Throwable e
                (testing "Failed to calculated metadata for query"
                  (is (not (Throwable->map e))))))))))))))

;;; TODO -- I don't think we should need to call `normalize` at all below, since this is done after normalization.
(defn- test-mlv2-conversion [query]
  (when-not (skip-conversion-tests? query)
    (do-with-legacy-query-testing-context
     query
     (^:once fn* []
      (let [pMBQL (-> query mbql.normalize/normalize lib.convert/->pMBQL)]
        (do-with-pMBQL-query-testing-context
         pMBQL
         (^:once fn* []
          (testing "Legacy MBQL queries should round trip to pMBQL and back"
            (is (= (mbql.normalize/normalize query)
                   (-> pMBQL lib.convert/->legacy-MBQL mbql.normalize/normalize))))
          (testing "converted pMBQL query should validate against the pMBQL schema"
            (is (not (me/humanize (mc/explain ::lib.schema/query pMBQL))))))))))))

(def ^:private ^:dynamic *original-query* nil)

(defn post-processing-middleware
  [_preprocessed-query rff]
  (fn [metadata]
    {:pre [(map? *original-query*)]}
    (test-mlv2-metadata *original-query* metadata)
    (rff metadata)))

(defn around-middleware
  "Tests only: save the original legacy MBQL query immediately after normalization to `::original-query`."
  [qp]
  (fn [query rff context]
    (test-mlv2-conversion query)
    (binding [*original-query* query]
      (qp query rff context))))

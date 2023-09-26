(ns metabase.query-processor-test.test-mlv2
  (:require
   [clojure.test :as t :refer :all]
   [malli.error :as me]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(defn- do-with-legacy-query-testing-context [query thunk]
  (testing (format "\nlegacy query =\n%s\n" (u/pprint-to-str query))
    (thunk)))

(defn- do-with-pMBQL-query-testing-context [pMBQL thunk]
  (testing (format "\npMBQL =\n%s\n" (u/pprint-to-str pMBQL))
    (thunk)))

(def ^:dynamic *skip-conversion-tests*
  "Whether we should skip the => pMBQL conversion tests, for queries that we explicitly expect to fail conversion
  because they are intentionally broken. For ones that are unintentionally broken, write a rule instead.

  At the time of this writing, this is only used in one
  place, [[metabase.models.query.permissions-test/invalid-queries-test]]."
  false)

(defn- test-mlv2-metadata [original-query _qp-metadata]
  {:pre [(map? original-query)]}
  (when-not *skip-conversion-tests*
    (do-with-legacy-query-testing-context
     original-query
     (^:once fn* []
      (let [pMBQL (-> original-query lib.convert/->pMBQL)]
        ;; don't bother doing this test if the output is invalid; [[test-mlv2-conversion]] will fail anyway, no point in
        ;; triggering an Exception here as well.
        (when (mr/validate ::lib.schema/query pMBQL)
          (do-with-pMBQL-query-testing-context
           pMBQL
           (^:once fn* []
            (let [mlv2-query    (lib/query (qp.store/metadata-provider) pMBQL)
                  mlv2-metadata (lib.metadata.calculation/returned-columns mlv2-query)]
              ;; Just make sure we can calculate some metadata (any metadata, even nothing) without throwing an
              ;; Exception at this point; making sure it is CORRECT will be the next step after this.
              (is (any? mlv2-metadata)))))))))))

(defn- test-mlv2-conversion [query]
  (when-not *skip-conversion-tests*
    (do-with-legacy-query-testing-context
     query
     (^:once fn* []
      (let [pMBQL (-> query lib.convert/->pMBQL)]
        (do-with-pMBQL-query-testing-context
         pMBQL
         (^:once fn* []
          (testing "Legacy MBQL queries should round trip to pMBQL and back"
            (is (= query
                   (-> pMBQL lib.convert/->legacy-MBQL))))
          (testing "converted pMBQL query should validate against the pMBQL schema"
            (is (not (me/humanize (mr/explain ::lib.schema/query pMBQL))))))))))))

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
    ;; there seems to be a issue in Hawk JUnit output if it encounters a test assertion when [[t/*testing-vars*]] is
    ;; empty, which can be the case if the assertion happens inside of a fixture before a test is ran (e.g. queries ran
    ;; as the result of syncing a database happening inside a test fixture); in this case we still want to run our
    ;; tests, so create some fake test var context so it doesn't fail.
    (if (empty? t/*testing-vars*)
      (binding [t/*testing-vars* [#'test-mlv2-conversion]]
        (test-mlv2-conversion query))
      (test-mlv2-conversion query))
    (binding [*original-query* query]
      (qp query rff context))))

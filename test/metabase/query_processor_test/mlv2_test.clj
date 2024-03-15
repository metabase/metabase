(ns metabase.query-processor-test.mlv2-test
  (:require
   [cheshire.core :as json]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.serialize :as lib.serialize]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(def ^:dynamic *enable-mlv2-normalization-tests* true)

#_{:clj-kondo/ignore [:clojure-lsp/unused-public-var]}
(mu/defn test-mlv2-normalization :- :map
  "Preprocessing middleware that tests that [[metabase.lib.normalize]] handles everything coming back from the
  application database or REST API correctly. This middleware is resolved at runtime
  in [[metabase.query-processor.preprocess/test-mlv2-normalization]]."
  [query :- :map]
  (u/prog1 query
    (when (and *enable-mlv2-normalization-tests*
               ;; only test for H2, we don't need to test basically the same exact queries in all the driver tests.
               (contains? #{:h2 nil} driver/*driver*))
      ;; we only want to run on top-level preprocessing steps, we don't want to do this on recursive preprocesses
      ;; because lots of extra keys get added and moved around that we don't need to worry about normalizing.
      (when-not (qp.store/miscellaneous-value [::tested])
        (qp.store/store-miscellaneous-value! [::tested] true)
        (testing (str "\n\n"
                      `test-mlv2-normalization
                      "\nTest pMBQL normalization from JSON-serialized queries")
          ;; remove keys that aren't supposed to get serialized anyway (these are added at runtime by the QP or things
          ;; that call it)
          (let [query             (lib.serialize/prepare-for-serialization query)
                json              (json/generate-string query)
                test-deserialized (fn [deserialized]
                                    (let [normalized (lib/normalize :metabase.lib.schema/query deserialized {:throw? true})]
                                      (testing (str "\nquery = \n" (u/pprint-to-str query))
                                        (is (= query
                                               normalized)))))]
            ;; queries coming out of the app DB should not get keywordized anymore, make sure this works as expected.
            (testing "\napp DB style, without JSON keywordization"
              (test-deserialized (json/parse-string json)))
            ;; our server middleware (see `wrap-json-body` in [[metabase.server.handler]]) keywordizes JSON bodies by
            ;; default. We need to handle this as well..
            (testing "\nREST API style, *with* JSON keywordization"
              (test-deserialized (json/parse-string json keyword)))))))))

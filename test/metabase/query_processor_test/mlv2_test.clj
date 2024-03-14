(ns metabase.query-processor-test.mlv2-test
  (:require
   [cheshire.core :as json]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [java-time.api :as t]
   [metabase.lib.core :as lib]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

#_{:clj-kondo/ignore [:clojure-lsp/unused-public-var]}
(mu/defn test-mlv2-normalization :- :map
  "Preprocessing middleware that tests that [[metabase.lib.normalize]] handles everything coming back from the
  application database or REST API correctly. This middleware is resolved at runtime
  in [[metabase.query-processor.preprocess/test-mlv2-normalization]]."
  [query :- :map]
  (u/prog1 query
    ;; we only want to run on top-level preprocessing steps, we don't want to do this on recursive preprocesses because
    ;; lots of extra keys get added and moved around that we don't need to worry about normalizing.
    (when-not (qp.store/miscellaneous-value [::tested])
      (qp.store/store-miscellaneous-value! [::tested] true)
      (testing "Test pMBQL normalization from JSON-serialized queries"
        ;; remove keys that aren't supposed to get serialized anyway (these are added at runtime by the QP or things
        ;; that call it)
        (let [query        (dissoc query :lib/metadata :info :middleware :constraints :parameters :viz-settings)
              query        (update query :stages (fn [stages]
                                                   (mapv (fn [stage]
                                                           ;; don't worry about native query params, parameters passed
                                                           ;; in to QP, or metadata
                                                           (dissoc stage :params :parameters :lib/stage-metadata))
                                                         stages)))
              ;; serialize all the `java.time` instances to strings, because that's what JSON serialization will do and
              ;; we don't expect normalization to deserialize them back to their original class
              query        (walk/postwalk
                            (fn [x]
                              (cond
                                (instance? java.time.ZonedDateTime x)     (str (t/offset-date-time x))
                                (instance? java.time.temporal.Temporal x) (str x)
                                :else                                     x))
                            query)
              deserialized (json/parse-string (json/generate-string query))
              normalized   (lib/normalize deserialized)]
          (is (= query
                 normalized)))))))

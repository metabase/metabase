(ns metabase.query-processor-test.mlv2-test
  (:require
   [cheshire.core :as json]
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.mbql.normalize :as mbql.normalize]))

(mu/defn test-mlv2-normalization :- :map
  "Preprocessing middleware that tests that [[metabase.lib.normalize]] handles everything coming back from the
  application database or REST API correctly."
  [query :- :map]
  (u/prog1 query
    (testing "Test pMBQL normalization from JSON-serialized queries"
      ;; remove keys that aren't supposed to get serialized anyway (these are added at runtime by the QP or things that
      ;; call it)
      (let [query (dissoc query :lib/metadata :info :middleware :constraints :parameters :viz-settings)
            query (update query :stages (fn [stages]
                                          (mapv (fn [stage]
                                                  (dissoc stage :middleware)) ; also added in by the QP.
                                                stages)))]
        (with-open [pis (java.io.PipedInputStream.)
                    pos (java.io.PipedOutputStream. pis)
                    w   (java.io.OutputStreamWriter. pos)
                    rdr (java.io.InputStreamReader. pis)]
          (let [decode (future
                         (json/decode-stream rdr))]
            (json/encode-stream query w)
            (let [deserialized @decode
                  normalized   (lib/normalize deserialized)]
              (is (= normalized
                     query)))))))))

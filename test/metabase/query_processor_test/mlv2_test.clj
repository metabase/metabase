(ns metabase.query-processor-test.mlv2-test
  (:require
   [cheshire.core :as json]
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(mu/defn test-mlv2-normalization :- :map
  "Preprocessing middleware that tests that [[metabase.lib.normalize]] handles everything coming back from the
  application database or REST API correctly."
  [query :- :map]
  (u/prog1 query
    (testing "Test pMBQL normalization from JSON-serialized queries"
      ;; remove keys that aren't supposed to get serialized anyway (these are added at runtime by the QP or things that
      ;; call it)
      (let [query (dissoc query :lib/metadata :info :middleware :constraints :parameters)]
        (with-open [pis (java.io.PipedInputStream.)
                    pos (java.io.PipedOutputStream. pis)
                    w   (java.io.OutputStreamWriter. pos)
                    rdr (java.io.InputStreamReader. pis)]
          (json/encode-stream query w)
          (let [deserialized (json/decode-stream rdr)
                normalized   (lib/normalize deserialized)]
            (is (= normalized
                   query))))))))

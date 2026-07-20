(ns metabase-enterprise.transforms-verification.api-test
  "Request-parse-level tests for the transform test-run endpoints — the checks that
  fire before any warehouse work, so they need no data-warehouse driver."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms-verification.api]
   [metabase-enterprise.transforms-verification.test-util :as tu]
   [metabase.lib.core :as lib]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(deftest non-file-expected-rejected-test
  (testing "an `expected` sent as a text form field (not a file upload), with no assertions,
            is rejected with a typed 4xx — not silently treated as a vacuous pass"
    ;; A Ring multipart text field arrives as a String, whose `:tempfile` is nil —
    ;; unguarded, that lets the diff silently skip and the run report \"passed\"
    ;; having compared nothing. The reject must mirror the `input-<id>` parts'
    ;; file-upload check.
    (tu/with-test-run-features
      (mt/dataset test-data
        (let [mp (mt/metadata-provider)]
          (mt/with-temp [:model/Transform transform
                         {:source {:type  :query
                                   :query (lib/native-query mp "SELECT 1 AS n")}
                          :target {:schema (tu/test-schema)
                                   :type   "table"
                                   :name   (mt/random-name)}}]
            (let [resp (mt/user-http-request-full-response
                        :crowberto :post (tu/test-run-url (:id transform))
                        tu/multipart-content-type
                        {"expected" "state,order_count\nCA,3\n"
                         "sources"  (json/encode [])})]
              (testing "rejected with a 4xx, not a 200 pass"
                (is (= 400 (:status resp))
                    (str "Expected 400; got " (:status resp) " body " (pr-str (:body resp)))))
              (testing "the message names the file-upload requirement"
                (is (re-find #"(?i)file upload"
                             (str (:body resp))))))))))))

(ns metabase.queries.metadata-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.core :as lib-be]
   [metabase.queries.metadata :as queries.metadata]
   [metabase.util.malli :as mu]))

(deftest ^:parallel batch-fetch-card-metadata-empty-queries-test
  ;; disable Malli because we want to make sure this works in prod
  (mu/disable-enforcement
    (is (= {:databases [], :fields [], :snippets [], :tables [], :cards []}
           (queries.metadata/batch-fetch-card-metadata [{}])))))

(deftest ^:parallel batch-fetch-query-metadata-skips-unnormalizable-queries-test
  (testing "A query that can't be normalized should be skipped (metabase#78037)"
    (let [unnormalizable {:type   :native
                          :native {:query "SELECT 1"}}]
      (testing "sanity check: this query is degraded to {} by normalize-query"
        (is (= {} (lib-be/normalize-query unnormalizable))))
      (is (= {:databases [], :fields [], :snippets [], :tables [], :cards []}
             (queries.metadata/batch-fetch-query-metadata [unnormalizable]))))))


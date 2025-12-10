(ns metabase.queries.metadata-test
  (:require
   [clojure.test :refer :all]
   [metabase.queries.metadata :as queries.metadata]
   [metabase.util.malli :as mu]))

(deftest ^:parallel batch-fetch-card-metadata-empty-queries-test
  ;; disable Malli because we want to make sure this works in prod
  (mu/disable-enforcement
    (is (= {:databases [], :fields [], :snippets [], :tables []}
           (queries.metadata/batch-fetch-card-metadata [{}])))))

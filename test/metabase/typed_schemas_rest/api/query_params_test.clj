(ns metabase.typed-schemas-rest.api.query-params-test
  (:require
   [clojure.test :refer :all]
   [metabase.typed-schemas-rest.api.query-params :as query-params]))

(deftest ^:parallel query-params->options-test
  (is (= {:database                 {:name "Boba"}
          :library-collection-refs  [{:id 10} {:id 20}]
          :question-collection-refs [{:entity-id "question-entity-id-1"}]
          :include-data-library?    false
          :include-metric-library?  false
          :include-models?          true}
         (query-params/query-params->options
          {:database             " Boba "
           :library-collections  " 10, 20 "
           :question-collections " question-entity-id-1 "
           :include-models       true}))))

(deftest ^:parallel query-params->options-defaults-test
  (is (= {:database                 {:id 1}
          :library-collection-refs  [{:id 3}]
          :question-collection-refs []
          :include-data-library?    true
          :include-metric-library?  true
          :include-models?          false}
         (query-params/query-params->options
          {:database               "1"
           :library-collections    "3"
           :include-data-library   "1"
           :include-metric-library "true"}))))

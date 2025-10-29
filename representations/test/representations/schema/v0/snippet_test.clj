(ns representations.schema.v0.snippet-test
  (:require [clojure.test :refer :all]
            [representations.read :as read]))

(deftest snippet-schema-test
  (testing "snippet representation with basic fields is valid"
    (let [snippet {:type :snippet
                   :version :v0
                   :name "snippet-123"
                   :display_name "date_filter"
                   :description "Filter by date range"
                   :sql "created_at BETWEEN {{start_date}} AND {{end_date}}"
                   :template_tags {:start_date {:type "date"}
                                   :end_date {:type "date"}}}]
      (is (= snippet
             (read/parse snippet)))))
  (testing "snippet representation with collection is valid"
    (let [snippet {:type :snippet
                   :version :v0
                   :name "snippet-123"
                   :display_name "user_filter"
                   :description nil
                   :sql "user_id = {{user_id}}"
                   :collection "filters"
                   :template_tags {:user_id {:type "number"}}}]
      (is (= snippet
             (read/parse snippet))))))

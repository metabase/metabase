(ns metabase.sync.analyze.classifiers.category-test
  "Tests for the category classifier."
  (:require [clojure.test :refer :all]
            [metabase.sync.analyze.classifiers.category :as category-classifier]))

(defn- field-with-distinct-count [distinct-count]
  {:database_type       "VARCHAR"
   :semantic_type       :type/Name
   :name                "NAME"
   :fingerprint_version 1
   :has_field_values    nil
   :active              true
   :visibility_type     :normal
   :preview_display     true
   :display_name        "Name"
   :fingerprint         {:global {:distinct-count distinct-count}
                         :type
                         {:type/Text
                          {:percent-json   0.0
                           :percent-url    0.0
                           :percent-email  0.0
                           :average-length 13.516}}}
   :base_type           :type/Text})

(deftest should-be-auto-list?-test
  (testing "make sure the logic for deciding whether a Field should be a list works as expected"
    (let [field (field-with-distinct-count 2500)]
      (is (= nil
             (#'category-classifier/field-should-be-auto-list? (:fingerprint field) field))))

    (let [field (field-with-distinct-count 99)]
      (is (= true
             (#'category-classifier/field-should-be-auto-list? (:fingerprint field) field))))))

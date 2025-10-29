(ns representations.schema.v0.collection-test
  (:require [clojure.test :refer :all]
            [representations.read :as read]))

(deftest collection-schema-test
  (testing "collection representation with all fields is valid"
    (let [collection {:type :collection
                      :version :v0
                      :name "my-collection"
                      :display_name "My Collection"
                      :description "A test collection"
                      :children ["child1" "child2"]}]
      (is (= collection
             (read/parse collection)))))
  (testing "collection representation with minimal fields is valid"
    (let [collection {:type :collection
                      :version :v0
                      :name "minimal-collection"}]
      (is (= collection
             (read/parse collection))))))

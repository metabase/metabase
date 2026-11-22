(ns metabase.collections.db-test
  "Tests of the read that the content checks of other modules build on."
  (:require
   [clojure.test :refer :all]
   [metabase.collections.db :as collections.db]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest collections-outside-content-rules-test
  (mt/with-temp [:model/Collection {default :id}  {}
                 :model/Collection {snippets :id} {:namespace "snippets"}
                 :model/Collection {other :id}    {:namespace "currency"}
                 :model/Collection {archived :id} {:archived true}
                 :model/Collection {library :id}  {:type "library"}]
    (let [ids      [default snippets other archived library]
          outside  (fn [namespaces types]
                     (set (map :id (collections.db/collections-outside-content-rules ids namespaces types))))]
      (testing "a namespace set with the default namespace refuses the others and archived Collections"
        (is (= #{snippets other archived}
               (outside #{nil :analytics} []))))
      (testing "a blocked type is outside too"
        (is (= #{snippets other archived library}
               (outside #{nil} ["library"]))))
      (testing "a namespace set without the default namespace refuses the default namespace too"
        (is (= #{default other archived library}
               (outside #{:snippets} []))))
      (testing "the Collections that pass are not returned"
        (is (not (contains? (outside #{nil} []) default)))))))

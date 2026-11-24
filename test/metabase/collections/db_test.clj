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

(deftest partitioned-reads-match-whole-reads-test
  (mt/with-temp [:model/Collection {a :id}                 {}
                 :model/Collection {b :id}                 {:location (format "/%d/" a)}
                 :model/Collection {c :id}                 {:location (format "/%d/%d/" a b)}
                 :model/Collection {d :id}                 {:archived true}
                 :model/Collection {e :id}                 {}
                 :model/Collection {f :id}                 {:location (format "/%d/" e)}]
    (let [ids        [a b c d e f]
          locations  [(format "/%d/" a) (format "/%d/%d/" a b) (format "/%d/" e) (format "/%d/" d) "/999999/"]
          patterns   (mapv #(str % "%") locations)
          reads      {:map-by-ids       #(collections.db/collections-by-ids ids)
                      :set-of-archived  #(collections.db/archived-collection-ids-among (set ids))
                      :set-by-patterns  #(collections.db/collection-ids-with-location-like-any patterns)
                      :vector-below     #(set (collections.db/collections-below locations))
                      :flagged-subtree  #(set (collections.db/subtree-locations-to-flag ids locations true))}]
      (doseq [[read-name read-fn] reads]
        (testing read-name
          (let [whole (read-fn)]
            (is (seq whole))
            (is (= whole (mt/with-partition-size 2
                           (read-fn))))))))))

(deftest set-reads-answer-nil-for-no-rows-test
  (is (nil? (collections.db/collection-ids-of-type [Integer/MAX_VALUE] "instance-analytics")))
  (is (nil? (collections.db/collection-ids-with-location-like-any ["/no-such-location/%"]))))

(ns metabase.sync.analyze.table-chunks-test
  (:require
   [clojure.test :refer :all]
   [metabase.sync.analyze.table-chunks :as table-chunks]))

(defn- group-ids
  "The ids of the Tables of each group [[table-chunks/groups]] makes of Tables with `ids` and Field `counts`."
  [ids counts budget]
  (mapv #(mapv :id %) (into [] (table-chunks/groups (map #(hash-map :id %) ids) (constantly counts) budget))))

(deftest ^:parallel groups-test
  (testing "Tables stay in order, in groups whose Fields fit in the budget"
    (is (= [[1 2] [3] [4 5 6]]
           (group-ids [1 2 3 4 5 6] {1 4, 2 6, 3 7, 4 5, 6 5} 10))))
  (testing "a Table with more Fields than the budget is alone in its group"
    (is (= [[1] [2] [3]]
           (group-ids [1 2 3] {1 5, 2 50, 3 6} 10))))
  (testing "Tables with no Fields to read join any group"
    (is (= [[1 2 3]]
           (group-ids [1 2 3] {} 10))))
  (testing "Field counts are read once per chunk of Tables"
    (let [reads (atom [])]
      (run! identity (table-chunks/groups (map #(hash-map :id %) (range (inc table-chunks/tables-per-chunk)))
                                          (fn [ids] (swap! reads conj (count ids)) {})
                                          10))
      (is (= [table-chunks/tables-per-chunk 1] @reads)))))

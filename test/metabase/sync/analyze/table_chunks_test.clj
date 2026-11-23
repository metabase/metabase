(ns metabase.sync.analyze.table-chunks-test
  (:require
   [clojure.test :refer :all]
   [metabase.sync.analyze.table-chunks :as table-chunks]))

(set! *warn-on-reflection* true)

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

(defn- save-calls!
  "The row counts `save!` is called with when [[table-chunks/save-by-table!]] saves rows of Tables 1 and 2 and every
  save of more than one row throws `e`, with what it returns or the class of what it throws."
  [e]
  (let [calls  (atom [])
        save!  (fn [rows]
                 (swap! calls conj (count rows))
                 (when (next rows)
                   (throw e)))
        result (try
                 (table-chunks/save-by-table! "rows" str :table-id save! [{:table-id 1} {:table-id 2}])
                 (catch Throwable t
                   (class t)))]
    [result @calls]))

(deftest save-by-table!-fallback-test
  (testing "an Exception of the save of all rows is followed by a save of each Table's rows"
    (is (= [#{} [2 1 1]]
           (save-calls! (ex-info "write failed" {})))))
  (testing "an Error of the save of all rows is thrown without a save of each Table's rows"
    (is (= [StackOverflowError [2]]
           (save-calls! (StackOverflowError.)))))
  (testing "an interrupt of the save of all rows is thrown without a save of each Table's rows"
    (is (= [clojure.lang.ExceptionInfo [2]]
           (save-calls! (ex-info "interrupted" {} (InterruptedException.)))))))

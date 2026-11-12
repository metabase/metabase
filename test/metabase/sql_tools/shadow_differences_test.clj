(ns metabase.sql-tools.shadow-differences-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.sql-tools.db :as sql-tools.db]
   [metabase.sql-tools.shadow-differences :as shadow-differences]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(defn- difference
  [sql & {:as overrides}]
  (merge {:method          :referenced-tables
          :dialect         "postgres"
          :outcome         :mismatch
          :primary-backend :sqlglot
          :shadow-backend  :sqlglot-java
          :sql             sql
          :args            []
          :primary         {:value [[nil nil "a"]]}
          :shadow          {:value [[nil nil "b"]]}}
         overrides))

(defn- rows []
  (t2/select [:model/SqlParsingShadowDifference :method :dialect :outcome :primary_backend :shadow_backend :sql
              :arguments :primary_result :shadow_result :seen_count]
             {:order-by [[:id :asc]]}))

(deftest record-test
  (mt/with-empty-h2-app-db!
    (testing "a difference is kept with its input and both results"
      (shadow-differences/record! (difference "SELECT * FROM a"))
      (shadow-differences/record! (difference "SELECT 1" :method :add-into-clause, :args ["t"]
                                              :outcome :shadow-only-error
                                              :primary {:value "SELECT 1"}
                                              :shadow {:error "ParseError", :message "Invalid expression"}))
      (is (= [{:method          "referenced-tables"
               :dialect         "postgres"
               :outcome         "mismatch"
               :primary_backend "sqlglot"
               :shadow_backend  "sqlglot-java"
               :sql             "SELECT * FROM a"
               :arguments       nil
               :primary_result  {:value [[nil nil "a"]]}
               :shadow_result   {:value [[nil nil "b"]]}
               :seen_count      1}
              {:method          "add-into-clause"
               :dialect         "postgres"
               :outcome         "shadow-only-error"
               :primary_backend "sqlglot"
               :shadow_backend  "sqlglot-java"
               :sql             "SELECT 1"
               :arguments       ["t"]
               :primary_result  {:value "SELECT 1"}
               :shadow_result   {:error "ParseError", :message "Invalid expression"}
               :seen_count      1}]
             (map #(-> (into {} %)
                       (update :arguments (fn [s] (some-> s json/decode)))
                       (update :primary_result json/decode+kw)
                       (update :shadow_result json/decode+kw))
                  (rows)))))
    (testing "the same input again counts one more time, and keeps the newest results"
      (shadow-differences/record! (difference "SELECT * FROM a" :shadow {:value [[nil nil "c"]]}))
      (is (= [2 {:value [[nil nil "c"]]}]
             (let [{:keys [seen_count shadow_result]} (first (rows))]
               [seen_count (json/decode+kw shadow_result)])))
      (is (= 2 (count (rows)))))))

(deftest record-counts-equal-arguments-as-one-input-test
  (testing "maps with the same value but a different order are one input"
    (mt/with-empty-h2-app-db!
      (let [table-names (map #(str "t" %) (range 10))
            in-order    (apply array-map (interleave table-names (range)))
            reversed    (apply array-map (interleave (reverse table-names) (reverse (range 10))))]
        (is (= in-order reversed))
        (is (not= (pr-str in-order) (pr-str reversed)))
        (shadow-differences/record! (difference "SELECT 1" :method :validate-query, :args ["public" in-order]))
        (shadow-differences/record! (difference "SELECT 1" :method :validate-query, :args ["public" reversed]))
        (is (= [2] (map :seen_count (rows))))))))

(deftest record-keeps-inputs-with-equal-value-hashes-apart-test
  (testing "arguments whose Clojure hashes collide are two inputs"
    (mt/with-empty-h2-app-db!
      (is (= (hash ["birds_-4612623337390985549"]) (hash ["birds_-7947843842725925793"])))
      (shadow-differences/record! (difference "SELECT 1" :args ["birds_-4612623337390985549"]))
      (shadow-differences/record! (difference "SELECT 1" :args ["birds_-7947843842725925793"]))
      (is (= [1 1] (map :seen_count (rows)))))))

(deftest record-counts-a-concurrent-first-sighting-once-test
  (testing "when another writer inserts the same input first, the insert counts it on that row"
    (mt/with-empty-h2-app-db!
      (shadow-differences/record! (difference "SELECT 1"))
      (let [seen-again! sql-tools.db/shadow-difference-seen-again!
            calls       (atom 0)]
        ;; the first update sees no row, as when two writers race to insert
        (mt/with-dynamic-fn-redefs [sql-tools.db/shadow-difference-seen-again!
                                    (fn [& args]
                                      (if (= 1 (swap! calls inc))
                                        0
                                        (apply seen-again! args)))]
          (shadow-differences/record! (difference "SELECT 1"))))
      (is (= [2] (map :seen_count (rows)))))))

(deftest record-keeps-valid-json-when-truncated-test
  (mt/with-empty-h2-app-db!
    (shadow-differences/record! (difference "SELECT 1" :shadow {:value (apply str (repeat 100000 "x"))}))
    (let [shadow-result (json/decode+kw (:shadow_result (first (rows))))]
      (is (= [:truncated] (keys shadow-result)))
      (is (= 16384 (count (:truncated shadow-result)))))))

(deftest record-truncates-sql-test
  (mt/with-empty-h2-app-db!
    (shadow-differences/record! (difference (apply str "SELECT " (repeat 100000 "x"))))
    (is (= 65536 (count (:sql (first (rows))))))))

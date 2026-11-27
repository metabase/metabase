(ns metabase.funnysql.sandbox-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.funnysql.format :as funnysql.format]
   [metabase.funnysql.sandbox :as sandbox]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.malli :as mu]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(def ^:private kept
  "The value of the filter column the sandbox keeps."
  1)

(def ^:private options
  "Sandbox options keeping the rows of every test table whose `w` is [[kept]], `sbx_a` read through `sbx_v`."
  {:row-filters {:sbx_a {:column :w, :value kept}
                 :sbx_b {:column :w, :value kept}
                 :sbx_u {:column :w, :value kept}
                 :sbx_v {:column :w, :value kept}}})

(def ^:private tables
  "The test tables, each with its columns and rows of both a kept and another value of `w`."
  [{:table   :sbx_a
    :columns [[:id :integer] [:w :integer [:default kept]] [:x :integer]]
    :rows    [[1 1 10] [2 1 20] [3 2 30] [4 2 40]]}
   {:table   :sbx_b
    :columns [[:id :integer] [:w :integer [:default kept]] [:a_id :integer] [:y :integer]]
    :rows    [[1 1 1 100] [2 1 3 200] [3 2 1 300] [4 2 3 400]]}
   {:table   :sbx_v
    :columns [[:id :integer] [:w :integer [:default kept]] [:x :integer]]
    :rows    [[1 1 11] [3 2 33]]}
   {:table   :sbx_u
    :columns [[:k :integer :primary-key] [:w :integer [:default kept]] [:v :integer]]
    :rows    [[1 1 1] [2 2 2]]}])

(defn- run-query
  "The rows, or the update count, of the Funny SQL `query` run on `conn`."
  [conn query]
  (jdbc/execute! conn (funnysql.format/format query (mdb/db-type)) {:builder-fn jdbc.rs/as-unqualified-lower-maps}))

(defn- sandboxed
  "`query` rewritten by the sandbox with [[options]], and also substituting `:sbx_v` for `:sbx_a` when `substitute?`."
  ([query]
   (sandboxed query false))
  ([query substitute?]
   (sandbox/sandbox-query (mdb/db-type) query (cond-> options
                                                substitute? (assoc :table-substitutions {:sbx_a :sbx_v})))))

(defn- create-tables!
  "Create and fill the [[tables]] on `conn`."
  [conn]
  (doseq [{:keys [table columns rows]} tables]
    (run-query conn {:drop-table [:if-exists table]})
    (run-query conn {:create-table table, :with-columns columns})
    (run-query conn {:insert-into table, :columns (mapv first columns), :values rows})))

(defn- drop-tables!
  "Drop the [[tables]] on `conn`."
  [conn]
  (doseq [{:keys [table]} tables]
    (run-query conn {:drop-table [:if-exists table]})))

(defn- do-with-tables!
  "Call `f` with a connection to the app DB holding the filled [[tables]], dropping them after."
  [f]
  (t2/with-connection [^java.sql.Connection conn]
    (create-tables! conn)
    (try
      (f conn)
      (finally
        (drop-tables! conn)))))

(defn- table-rows
  "The rows of every test table on `conn`, sorted, by table."
  [conn]
  (into {}
        (for [{:keys [table]} tables]
          [table (sort-by pr-str (run-query conn {:select [:*], :from [table]}))])))

(defn- delete-other-rows!
  "Delete the rows of every test table on `conn` the sandbox leaves out."
  [conn]
  (doseq [{:keys [table]} tables]
    (run-query conn {:delete-from table, :where [:<> :w kept]})))

(defn- normalized
  "The result `rows` of a read as a sorted list of maps, or an update count as it is."
  [rows]
  (if (sequential? rows) (sort-by pr-str rows) rows))

(defn- in-rolled-back-transaction
  "The value of `f` called with a transaction on `conn` that is rolled back after."
  [conn f]
  (jdbc/with-transaction [tx conn {:rollback-only true}]
    (f tx)))

(defn- read-result!
  "`[sandboxed expected]` results of the read `query` on `conn`: through the sandbox on every row, and as it is on only
  the rows the sandbox keeps."
  ([conn query]
   (read-result! conn query false))
  ([conn query substitute?]
   [(normalized (in-rolled-back-transaction conn #(run-query % (sandboxed query substitute?))))
    (normalized (in-rolled-back-transaction conn (fn [tx]
                                                   (delete-other-rows! tx)
                                                   (run-query tx query))))]))

(defn- write-result!
  "`[kept-after expected-kept others-after others-before]` table rows of the write `query` on `conn`: the kept rows
  after the sandboxed write on every row and after the write as it is on only the kept rows, and the other rows after
  the sandboxed write and before it."
  [conn query]
  (let [kept?         #(= kept (:w %))
        split         (fn [rows-by-table pred] (update-vals rows-by-table #(vec (filter pred %))))
        before        (table-rows conn)
        after         (in-rolled-back-transaction conn (fn [tx]
                                                         (run-query tx (sandboxed query))
                                                         (table-rows tx)))
        expected      (in-rolled-back-transaction conn (fn [tx]
                                                         (delete-other-rows! tx)
                                                         (run-query tx query)
                                                         (table-rows tx)))]
    [(split after kept?) (split expected kept?) (split after (complement kept?)) (split before (complement kept?))]))

(defn- subquery
  "The query map `q` marked as a subquery."
  [q]
  (vary-meta q assoc :allow-subquery true))

(def ^:private reads
  "Reads the sandbox keeps to the kept rows, by name."
  {"select all"                  {:select [:*], :from [:sbx_a]}
   "select bare from"            {:select [:id], :from :sbx_a}
   "select where"                {:select [:id], :from [:sbx_a], :where [:> :x 15]}
   "select aliased"              {:select [:t.id], :from [[:sbx_a :t]]}
   "join"                        {:select [:sbx_a.id :sbx_b.id], :from [:sbx_a], :join [:sbx_b [:= :sbx_b.a_id :sbx_a.id]]}
   "inner join"                  {:select [:sbx_a.id :sbx_b.id], :from [:sbx_a], :inner-join [:sbx_b [:= :sbx_b.a_id :sbx_a.id]]}
   "left join"                   {:select [:sbx_a.id [:sbx_b.id :b_id]], :from [:sbx_a]
                                  :left-join [:sbx_b [:= :sbx_b.a_id :sbx_a.id]]}
   "right join"                  {:select [[:sbx_a.id :a_id] :sbx_b.id], :from [:sbx_a]
                                  :right-join [:sbx_b [:= :sbx_b.a_id :sbx_a.id]]}
   "join then right join"        {:select [[:sbx_a.id :a_id] [:b1.id :b1_id] :b2.id], :from [:sbx_a]
                                  :join [[:sbx_b :b1] [:= :b1.a_id :sbx_a.id]]
                                  :right-join [[:sbx_b :b2] [:= :b2.a_id :sbx_a.id]]}
   "self join"                   {:select [:p.id [:q.id :q_id]], :from [[:sbx_a :p]], :join [[:sbx_a :q] [:<> :p.id :q.id]]}
   "comma join"                  {:select [:sbx_a.id [:sbx_b.id :b_id]], :from [:sbx_a :sbx_b]
                                  :where [:= :sbx_b.a_id :sbx_a.id]}
   "in subquery"                 {:select [:id], :from [:sbx_a]
                                  :where [:in :id (subquery {:select [:a_id], :from [:sbx_b]})]}
   "correlated exists"           {:select [:id], :from [:sbx_a]
                                  :where [:exists (subquery {:select [1], :from [:sbx_b], :where [:= :sbx_b.a_id :sbx_a.id]})]}
   "scalar subquery in select"   {:select [:id [(subquery {:select [[[:count :*]]], :from [:sbx_b]}) :n]], :from [:sbx_a]}
   "subquery in from"            {:select [:s.id], :from [[(subquery {:select [:id], :from [:sbx_b]}) :s]]}
   "union"                       {:union [(subquery {:select [:id], :from [:sbx_a]})
                                          (subquery {:select [:id], :from [:sbx_b]})]}
   "union all"                   {:union-all [(subquery {:select [:id], :from [:sbx_a]})
                                              (subquery {:select [:id], :from [:sbx_b]})]}
   "cte"                         {:with [[:c (subquery {:select [:id], :from [:sbx_b]})]], :select [:id], :from [:c]}
   "group by having"             {:select [:a_id [[:count :*] :n]], :from [:sbx_b], :group-by [:a_id]
                                  :having [:> [:count :*] (subquery {:select [[[:min :id]]], :from [:sbx_a]})]}
   "select for update"           {:select [:id], :from [:sbx_a], :for :update}})

(deftest reads-keep-to-filtered-rows-test
  (do-with-tables!
   (fn [conn]
     (doseq [[k query] reads]
       (testing k
         (let [[actual expected] (read-result! conn query)]
           (is (= expected actual))))))))

(deftest reads-through-substitution-test
  (do-with-tables!
   (fn [conn]
     (testing "table reads its substitute's kept rows under its own name"
       (is (= [{:id 1, :x 11}]
              (normalized (run-query conn (sandboxed {:select [:sbx_a.id :sbx_a.x], :from [:sbx_a]} true))))))
     (testing "aliased table reads its substitute's kept rows under its alias"
       (is (= [{:id 1, :x 11}]
              (normalized (run-query conn (sandboxed {:select [:t.id :t.x], :from [[:sbx_a :t]]} true))))))
     (testing "joined table reads its substitute's kept rows"
       (is (= [{:id 1}]
              (normalized (run-query conn (sandboxed {:select [:sbx_b.id], :from [:sbx_b]
                                                      :join [:sbx_a [:= :sbx_a.id :sbx_b.a_id]]}
                                                     true)))))))))

(def ^:private writes
  "Writes the sandbox keeps to the kept rows, by name."
  {"update all"                  {:update :sbx_a, :set {:x [:+ :x 1]}}
   "update where"                {:update :sbx_a, :set {:x 0}, :where [:> :x 15]}
   "update aliased"              {:update [:sbx_a :t], :set {:x 0}, :where [:> :t.x 15]}
   "update setting kept value"   {:update :sbx_a, :set {:x 0, :w kept}}
   "update where in subquery"    {:update :sbx_a, :set {:x 0}
                                  :where [:in :id (subquery {:select [:a_id], :from [:sbx_b]})]}
   "update set from subquery"    {:update :sbx_a
                                  :set {:x (subquery {:select [[[:max :y]]], :from [:sbx_b]})}}
   "delete all"                  {:delete-from :sbx_a}
   "delete where"                {:delete-from :sbx_a, :where [:> :x 15]}
   "delete where in subquery"    {:delete-from :sbx_a
                                  :where [:in :id (subquery {:select [:a_id], :from [:sbx_b]})]}
   "insert row maps"             {:insert-into :sbx_a, :values [{:id 5, :x 50} {:id 6, :x 60}]}
   "insert row map with value"   {:insert-into :sbx_a, :values [{:id 5, :w kept, :x 50}]}
   "insert row vectors"          {:insert-into [:sbx_a [:id :x]], :values [[5 50]]}
   "insert columns clause"       {:insert-into :sbx_a, :columns [:id :x], :values [[5 50]]}
   "insert select"               {:insert-into [[:sbx_a [:id :x]] (subquery {:select [:id :y], :from [:sbx_b]})]}
   "insert select union"         {:insert-into [[:sbx_a [:id :x]]
                                                (subquery {:union-all [(subquery {:select [:id :y], :from [:sbx_b]})
                                                                       (subquery {:select [:id :x], :from [:sbx_v]})]})]}})

(deftest writes-keep-to-filtered-rows-test
  (do-with-tables!
   (fn [conn]
     (doseq [[k query] writes]
       (testing k
         (let [[kept-after expected-kept others-after others-before] (write-result! conn query)]
           (testing "kept rows change as they would without the other rows"
             (is (= expected-kept kept-after)))
           (testing "other rows stay as they are"
             (is (= others-before others-after)))))))))

(deftest engine-writes-keep-to-filtered-rows-test
  (do-with-tables!
   (fn [conn]
     (doseq [[k query] (case (mdb/db-type)
                         :postgres {"update from"          {:update :sbx_a, :set {:x :sbx_b.y}, :from [:sbx_b]
                                                            :where [:= :sbx_b.a_id :sbx_a.id]}
                                    "data-modifying cte"   {:with   [[:d (subquery {:delete-from :sbx_a, :returning [:id]})]]
                                                            :select [:id], :from [:d]}
                                    "insert from cte"      {:with        [[:c (subquery {:select [:id :y], :from [:sbx_b]})]]
                                                            :insert-into [[:sbx_a [:id :x]]
                                                                          (subquery {:select [:id :y], :from [:c]})]}}
                         :mysql    {"delete limit"         {:delete-from :sbx_a, :order-by [:id], :limit 1}}
                         :h2       {"merge using"          {:merge-into              [:sbx_a :t]
                                                            :using                   [(subquery {:select [:id :y], :from [:sbx_b]}) :s]
                                                            :on                      [:= :t.id :s.id]
                                                            :when-matched-update-set {:x :s.y}
                                                            :when-not-matched-insert [[:id :x] [:s.id :s.y]]}
                                    "merge key"            {:merge-into :sbx_a, :key [:id], :columns [:id :x]
                                                            :values [[1 99] [5 50]]}})]
       (testing k
         (let [[kept-after expected-kept others-after others-before] (write-result! conn query)]
           (testing "kept rows change as they would without the other rows"
             (is (= expected-kept kept-after)))
           (testing "other rows stay as they are"
             (is (= others-before others-after)))))))))

(deftest upserts-leave-other-rows-test
  (do-with-tables!
   (fn [conn]
     (let [upsert (case (mdb/db-type)
                    :postgres {:insert-into :sbx_u, :values [{:k 1, :v 10} {:k 2, :v 20} {:k 3, :v 30}]
                               :on-conflict [:k], :do-update-set {:v :excluded.v}}
                    :mysql    {:insert-into :sbx_u, :values [{:k 1, :v 10} {:k 2, :v 20} {:k 3, :v 30}]
                               :on-duplicate-key-update {:v [:values :v]}}
                    :h2       {:merge-into :sbx_u, :key [:k], :columns [:k :v], :values [[1 10] [3 30]]})]
       (is (= [{:k 1, :w 1, :v 10} {:k 2, :w 2, :v 2} {:k 3, :w 1, :v 30}]
              (in-rolled-back-transaction conn (fn [tx]
                                                 (run-query tx (sandboxed upsert))
                                                 (sort-by :k (:sbx_u (table-rows tx)))))))))))

(defn- sandboxed-sql
  "The SQL of `query` sandboxed by [[options]] for `engine`."
  [engine query]
  (first (funnysql.format/format (sandbox/sandbox-query engine query options) engine)))

(deftest ^:parallel mysql-locking-reads-filter-through-addition-test
  (testing "a statement that locks rows on MySQL compares the filter column plus 0, so that it locks only its own rows"
    (doseq [query [{:select [:id], :from [:sbx_a], :for :update}
                   {:update :sbx_a, :set {:x 0}}
                   {:delete-from :sbx_a}
                   {:update :sbx_a, :set {:x (subquery {:select [[[:max :y]]], :from [:sbx_b]})}}]]
      (is (str/includes? (sandboxed-sql :mysql query) "+ 0"))
      (is (not (str/includes? (sandboxed-sql :postgres query) "+ 0")))))
  (testing "a read that locks nothing compares the column itself"
    (is (not (str/includes? (sandboxed-sql :mysql {:select [:id], :from [:sbx_a]}) "+ 0")))))

(deftest ^:parallel refused-queries-test
  (doseq [[message query] [["\\[:param"
                            {:select [:id], :from [:sbx_a], :where [:= :id [:param :id]]}]
                           ["CTE named like a filtered table"
                            {:with [[:sbx_a (subquery {:select [:id], :from [:sbx_b]})]], :select [:id], :from [:sbx_a]}]
                           ["writing 2 into the sandbox column"
                            {:update :sbx_a, :set {:w 2}}]
                           ["writing 2 into the sandbox column"
                            {:update :sbx_a, :set {:sbx_a.w 2}}]
                           ["writing \\[:\\+ :w 1\\] into the sandbox column"
                            {:update :sbx_a, :set {:w [:+ :w 1]}}]
                           ["writing 2 into the sandbox column"
                            {:insert-into :sbx_a, :values [{:id 5, :w 2}]}]
                           ["writing 2 into the sandbox column"
                            {:insert-into [:sbx_a [:id :w]], :values [[5 2]]}]
                           ["writing 2 into the sandbox column"
                            {:merge-into :sbx_a, :key [:id], :columns [:id :w], :values [[5 2]]}]
                           ["writing 2 into the sandbox column"
                            {:merge-into [:sbx_a :t], :using [(subquery {:select [:id], :from [:sbx_b]}) :s]
                             :on [:= :t.id :s.id], :when-matched-update-set {:w 2}}]
                           ["writing 2 into the sandbox column"
                            {:insert-into :sbx_u, :values [{:k 1, :v 1}], :on-conflict [:k], :do-update-set {:w 2}}]
                           ["upsert column"
                            {:insert-into :sbx_u, :values [{:k 1, :v 1}], :on-conflict [:k], :do-update-set {:sbx_u.v 2}}]
                           ["upsert with RETURNING"
                            {:insert-into :sbx_u, :values [{:k 1, :v 1}], :on-conflict [:k], :do-update-set {:v 2}
                             :returning [:k]}]
                           ["VALUES rows whose length differs"
                            {:insert-into [:sbx_a [:id :x]], :values [[5]]}]
                           ["VALUES rows without a column list"
                            {:insert-into :sbx_a, :values [[5 1 50]]}]
                           ["selects \\*"
                            {:insert-into [[:sbx_a [:id :x]] (subquery {:select [:*], :from [:sbx_b]})]}]
                           ["without a column list or with the sandbox column"
                            {:insert-into [[:sbx_a] (subquery {:select [:id :x], :from [:sbx_b]})]}]
                           ["without a column list or with the sandbox column"
                            {:insert-into [[:sbx_a [:id :w]] (subquery {:select [:id :w], :from [:sbx_b]})]}]
                           ["INSERT without VALUES rows or a SELECT"
                            {:insert-into :sbx_a}]
                           ["MERGE that has no USING source"
                            {:merge-into :sbx_a, :columns [:id :x], :values [[5 50]]}]
                           ["CREATE TABLE of a filtered or substituted table"
                            {:create-table :sbx_a, :with-columns [[:id :integer]]}]
                           ["DROP TABLE of a filtered or substituted table"
                            {:drop-table [:if-exists :sbx_v]}]]]
    (testing message
      (is (thrown-with-msg? clojure.lang.ExceptionInfo (re-pattern message)
                            (sandbox/sandbox-query :mysql query options))))))

(deftest ^:parallel refused-shapes-outside-schema-test
  (testing "without schema checks, as in production, shapes the sandbox does not know are refused"
    (mu/disable-enforcement
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"doesn't support the clause :raw"
                            (sandbox/sandbox-query :postgres {:select [:id], :from [:sbx_a], :raw "x"} options)))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"doesn't support the table reference"
                            (sandbox/sandbox-query :postgres {:select [:id], :from ["sbx_a"]} options)))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"item that has no condition"
                            (sandbox/sandbox-query :postgres {:select [:id], :from [:sbx_a], :join [:sbx_b nil]} options)))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"item that has no condition"
                            (sandbox/sandbox-query :postgres {:select [:id], :from [:sbx_a], :left-join [:sbx_b]} options)))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"assignments that are not a map"
                            (sandbox/sandbox-query :postgres {:update :sbx_a, :set [[:x 1]]} options))))))

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
  "Sandbox options keeping the rows of every filtered test table whose `w` is [[kept]]."
  {:row-filters {:sbx_a {:column :w, :value kept}
                 :sbx_b {:column :w, :value kept}
                 :sbx_u {:column :w, :value kept}
                 :sbx_v {:column :w, :value kept}}})

(def ^:private tables
  "The test tables, each with rows of both a kept and another value of `w`, but `sbx_n`, which the sandbox does not
  filter."
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
    :rows    [[1 1 1] [2 2 2]]}
   {:table       :sbx_n
    :unfiltered? true
    :columns     [[:id :integer] [:x :integer]]
    :rows        [[1 10]]}])

(defn- subquery
  "The query map `q` marked as a subquery."
  [q]
  (vary-meta q assoc :allow-subquery true))

(defn- run-query
  "The rows, or the update count, of the Funny SQL `query` run on `conn`."
  [conn query]
  (jdbc/execute! conn (funnysql.format/format query (mdb/db-type)) {:builder-fn jdbc.rs/as-unqualified-lower-maps}))

(defn- sandboxed
  "`query` rewritten by the sandbox with [[options]], also reading `:sbx_v` in place of `:sbx_a` when `substitute?`."
  ([query]
   (sandboxed query false))
  ([query substitute?]
   (sandbox/sandbox-query (mdb/db-type) query (cond-> options
                                                substitute? (assoc :table-substitutions {:sbx_a :sbx_v})))))

(defn- do-with-tables!
  "Call `f` with a connection to the app DB holding the filled [[tables]], dropping them after."
  [f]
  (t2/with-connection [^java.sql.Connection conn]
    (doseq [{:keys [table columns rows]} tables]
      (run-query conn {:drop-table [:if-exists table]})
      (run-query conn {:create-table table, :with-columns columns})
      (run-query conn {:insert-into table, :columns (mapv first columns), :values rows}))
    (try
      (f conn)
      (finally
        (doseq [{:keys [table]} tables]
          (run-query conn {:drop-table [:if-exists table]}))))))

(defn- in-rolled-back-transaction
  "The value of `f` called with a transaction on `conn` that is rolled back after."
  [conn f]
  (jdbc/with-transaction [tx conn {:rollback-only true}]
    (f tx)))

(defn- delete-other-rows!
  "Delete the rows of every filtered test table on `conn` the sandbox leaves out."
  [conn]
  (doseq [{:keys [table unfiltered?]} tables
          :when (not unfiltered?)]
    (run-query conn {:delete-from table, :where [:<> :w kept]})))

(defn- table-rows
  "The rows of every test table on `conn`, sorted, by table."
  [conn]
  (into {} (for [{:keys [table]} tables]
             [table (sort-by pr-str (run-query conn {:select [:*], :from [table]}))])))

(defn- normalized
  "The result `rows` of a read sorted, or an update count as it is."
  [rows]
  (if (sequential? rows) (sort-by pr-str rows) rows))

(defn- read-results!
  "`[sandboxed expected]` results of the read `query` on `conn`: through the sandbox on every row, and as it is on only
  the rows the sandbox keeps."
  [conn query]
  [(normalized (in-rolled-back-transaction conn #(run-query % (sandboxed query))))
   (normalized (in-rolled-back-transaction conn (fn [tx]
                                                  (delete-other-rows! tx)
                                                  (run-query tx query))))])

(defn- write-results!
  "`[sandboxed expected]` table rows after the write `query` on `conn`, by kept and other rows: through the sandbox on
  every row, and as it is on only the kept rows with the other rows as they were, the rows of `sbx_n` counting as kept."
  [conn query]
  (let [kept?  #(contains? #{nil kept} (:w %))
        split  (fn [kept-rows other-rows]
                 {:kept   (update-vals kept-rows #(filterv kept? %))
                  :others (update-vals other-rows #(filterv (complement kept?) %))})
        before (table-rows conn)
        after  (in-rolled-back-transaction conn (fn [tx]
                                                  (run-query tx (sandboxed query))
                                                  (table-rows tx)))
        alone  (in-rolled-back-transaction conn (fn [tx]
                                                  (delete-other-rows! tx)
                                                  (run-query tx query)
                                                  (table-rows tx)))]
    [(split after after) (split alone before)]))

(defn- refused?
  "Whether the query map `query`, outside the schema as production allows, is refused for `engine` by the sandbox or by
  Funny SQL."
  [engine query]
  (mu/disable-enforcement
    (try
      (funnysql.format/format (sandbox/sandbox-query engine query options) engine)
      false
      (catch Exception _
        true))))

(defn- sandboxed-sql
  "The SQL of `query` sandboxed by [[options]] for `engine`."
  [engine query]
  (first (funnysql.format/format (sandbox/sandbox-query engine query options) engine)))

(deftest reads-keep-to-filtered-rows-test
  (do-with-tables!
   (fn [conn]
     (are [query] (apply = (read-results! conn query))
       {:select [:*], :from [:sbx_a]}
       {:select [:id], :from :sbx_a}
       {:select [:id], :from [:sbx_a], :where [:> :x 15]}
       {:select [:t.id], :from [[:sbx_a :t]]}
       {:select [:sbx_a.id :sbx_b.id], :from [:sbx_a], :join [:sbx_b [:= :sbx_b.a_id :sbx_a.id]]}
       {:select [:sbx_a.id :sbx_b.id], :from [:sbx_a], :inner-join [:sbx_b [:= :sbx_b.a_id :sbx_a.id]]}
       {:select [:sbx_a.id [:sbx_b.id :b_id]], :from [:sbx_a], :left-join [:sbx_b [:= :sbx_b.a_id :sbx_a.id]]}
       {:select [[:sbx_a.id :a_id] :sbx_b.id], :from [:sbx_a], :right-join [:sbx_b [:= :sbx_b.a_id :sbx_a.id]]}
       {:select     [[:sbx_a.id :a_id] [:b1.id :b1_id] :b2.id], :from [:sbx_a]
        :join       [[:sbx_b :b1] [:= :b1.a_id :sbx_a.id]]
        :right-join [[:sbx_b :b2] [:= :b2.a_id :sbx_a.id]]}
       {:select     [[:sbx_a.id :a_id] [:b1.id :b1_id] [:b2.id :b2_id]], :from [:sbx_a]
        :right-join [[:sbx_b :b1] [:= :b1.a_id :sbx_a.id] [:sbx_b :b2] [:= :b2.id :b1.id]]}
       {:select [:p.id [:q.id :q_id]], :from [[:sbx_a :p]], :join [[:sbx_a :q] [:<> :p.id :q.id]]}
       {:select [:sbx_a.id [:sbx_b.id :b_id]], :from [:sbx_a :sbx_b], :where [:= :sbx_b.a_id :sbx_a.id]}
       {:select [:id], :from [:sbx_a], :where [:in :id (subquery {:select [:a_id], :from [:sbx_b]})]}
       {:select [:id], :from [:sbx_a], :where [:in :id [(subquery {:select [[[:max :a_id]]], :from [:sbx_b]}) 2]]}
       {:select [:id], :from [:sbx_a]
        :where  [:exists (subquery {:select [1], :from [:sbx_b], :where [:= :sbx_b.a_id :sbx_a.id]})]}
       {:select [:id [(subquery {:select [[[:count :*]]], :from [:sbx_b]}) :n]], :from [:sbx_a]}
       {:select [[[:coalesce (subquery {:select [[[:max :y]]], :from [:sbx_b]}) 0] :m]], :from [:sbx_a]}
       {:select [:id [[:case [:exists (subquery {:select [1], :from [:sbx_b], :where [:= :sbx_b.a_id :sbx_a.id]})]
                       1 :else 0]
                      :e]]
        :from   [:sbx_a]}
       {:select [:s.id], :from [[(subquery {:select [:id], :from [:sbx_b]}) :s]]}
       {:select [:s.id]
        :from   [[(subquery {:select [:t.id], :from [[(subquery {:select [:id], :from [:sbx_a]}) :t]]}) :s]]}
       {:union [(subquery {:select [:id], :from [:sbx_a]}) (subquery {:select [:id], :from [:sbx_b]})]}
       {:union-all [(subquery {:select [:id], :from [:sbx_a]}) (subquery {:select [:id], :from [:sbx_b]})]}
       {:nest (subquery {:select [:id], :from [:sbx_a]})}
       {:with [[:c (subquery {:select [:id], :from [:sbx_b]})]], :select [:id], :from [:c]}
       {:with [[[:c {:columns [:i]}] (subquery {:select [:id], :from [:sbx_b]})]], :select [:i], :from [:c]}
       {:with-recursive [[[:r {:columns [:n]}]
                          (subquery {:union-all [(subquery {:select [[[:max :id]]], :from [:sbx_a]})
                                                 (subquery {:select [[[:+ :n 1]]], :from [:r], :where [:< :n 5]})]})]]
        :select         [:n], :from [:r]}
       {:select [:a_id [[:count :*] :n]], :from [:sbx_b], :group-by [:a_id]
        :having [:> [:count :*] (subquery {:select [[[:min :id]]], :from [:sbx_a]})]}
       {:select [:id], :from [:sbx_a], :order-by [[(subquery {:select [[[:max :y]]], :from [:sbx_b]}) :asc] :id]}
       {:select [:id [[:over [[:row_number] {:partition-by [:w], :order-by [:id]}]] :rn]], :from [:sbx_a]}
       {:select [[[:call :max :x] :m]], :from [:sbx_a]}
       {:select [:id], :from [:sbx_a], :for :update})
     (case (mdb/db-type)
       :postgres (are [query] (apply = (read-results! conn query))
                   {:select [:id], :from [:public.sbx_a]})
       :mysql    nil
       :h2       (are [query] (apply = (read-results! conn query))
                   {:select [:id], :from [:public.sbx_a]}
                   {:select [:id], :from [:SBX_A]})))))

(deftest reads-through-substitution-test
  (do-with-tables!
   (fn [conn]
     (are [expected query] (= expected (normalized (run-query conn (sandboxed query true))))
       [{:id 1, :x 11}] {:select [:sbx_a.id :sbx_a.x], :from [:sbx_a]}
       [{:id 1, :x 11}] {:select [:t.id :t.x], :from [[:sbx_a :t]]}
       [{:id 1}]        {:select [:sbx_b.id], :from [:sbx_b], :join [:sbx_a [:= :sbx_a.id :sbx_b.a_id]]}))))

(deftest writes-keep-to-filtered-rows-test
  (do-with-tables!
   (fn [conn]
     (are [query] (apply = (write-results! conn query))
       {:update :sbx_a, :set {:x [:+ :x 1]}}
       {:update :sbx_a, :set {:x 0}, :where [:> :x 15]}
       {:update [:sbx_a :t], :set {:x 0}, :where [:> :t.x 15]}
       {:update :sbx_a, :set {:x 0, :w kept}}
       {:update :sbx_a, :set {:x 0}, :where [:in :id (subquery {:select [:a_id], :from [:sbx_b]})]}
       {:update :sbx_a, :set {:x (subquery {:select [[[:max :y]]], :from [:sbx_b]})}}
       {:update :sbx_n, :set {:x (subquery {:select [[[:max :x]]], :from [:sbx_a]})}}
       {:delete-from :sbx_a}
       {:delete-from :sbx_a, :where [:> :x 15]}
       {:delete-from :sbx_a, :where [:in :id (subquery {:select [:a_id], :from [:sbx_b]})]}
       {:delete-from :sbx_n, :where [:exists (subquery {:select [1], :from [:sbx_a], :where [:= :x 30]})]}
       {:insert-into :sbx_a, :values [{:id 5, :x 50} {:id 6, :x 60}]}
       {:insert-into :sbx_a, :values [{:id 5, :w kept, :x 50}]}
       {:insert-into [:sbx_a [:id :x]], :values [[5 50]]}
       {:insert-into :sbx_a, :columns [:id :x], :values [[5 50]]}
       {:insert-into [[:sbx_a [:id :x]] (subquery {:select [:id :y], :from [:sbx_b]})]}
       {:insert-into [[:sbx_a [:id :x]] (subquery {:union-all [(subquery {:select [:id :y], :from [:sbx_b]})
                                                               (subquery {:select [:id :x], :from [:sbx_v]})]})]}
       {:insert-into [[:sbx_n [:id :x]] (subquery {:select [:id :x], :from [:sbx_a]})]})
     (case (mdb/db-type)
       :postgres (are [query] (apply = (write-results! conn query))
                   {:update :sbx_a, :set {:x :sbx_b.y}, :from [:sbx_b], :where [:= :sbx_b.a_id :sbx_a.id]}
                   {:with [[:d (subquery {:delete-from :sbx_a, :returning [:id]})]], :select [:id], :from [:d]}
                   {:with        [[:c (subquery {:select [:id :y], :from [:sbx_b]})]]
                    :insert-into [[:sbx_a [:id :x]] (subquery {:select [:id :y], :from [:c]})]})
       :mysql    (are [query] (apply = (write-results! conn query))
                   {:delete-from :sbx_a, :order-by [:id], :limit 1})
       :h2       (are [query] (apply = (write-results! conn query))
                   {:merge-into              [:sbx_a :t]
                    :using                   [(subquery {:select [:id :y], :from [:sbx_b]}) :s]
                    :on                      [:= :t.id :s.id]
                    :when-matched-update-set {:x :s.y}
                    :when-not-matched-insert [[:id :x] [:s.id :s.y]]}
                   {:merge-into :sbx_a, :key [:id], :columns [:id :x], :values [[1 99] [5 50]]})))))

(deftest upserts-leave-other-rows-test
  (do-with-tables!
   (fn [conn]
     (is (= [{:k 1, :w 1, :v 10} {:k 2, :w 2, :v 2} {:k 3, :w 1, :v 30}]
            (in-rolled-back-transaction
             conn
             (fn [tx]
               (run-query tx (sandboxed (case (mdb/db-type)
                                          :postgres {:insert-into   :sbx_u
                                                     :values        [{:k 1, :v 10} {:k 2, :v 20} {:k 3, :v 30}]
                                                     :on-conflict   [:k]
                                                     :do-update-set {:v :excluded.v}}
                                          :mysql    {:insert-into             :sbx_u
                                                     :values                  [{:k 1, :v 10} {:k 2, :v 20} {:k 3, :v 30}]
                                                     :on-duplicate-key-update {:v [:values :v]}}
                                          :h2       {:merge-into :sbx_u, :key [:k], :columns [:k :v]
                                                     :values [[1 10] [3 30]]})))
               (sort-by :k (:sbx_u (table-rows tx))))))))))

(deftest outside-schema-writes-keep-to-filtered-rows-test
  (testing "without schema checks, as in production, statements the schema leaves out keep to the kept rows"
    (do-with-tables!
     (fn [conn]
       (mu/disable-enforcement
         (are [query] (apply = (write-results! conn query))
           {:insert-into :sbx_n, :columns [:id :x], :select [:id :x], :from [:sbx_a]})
         (case (mdb/db-type)
           :postgres nil
           :mysql    (are [query] (apply = (write-results! conn query))
                       {:update :sbx_a, :set {:x 0}, :order-by [[:id :desc]], :limit 1})
           :h2       (are [query] (apply = (write-results! conn query))
                       {:merge-into :sbx_n, :columns [:id :x], :key [:id], :select [:id :x], :from [:sbx_a]})))))))

(deftest mysql-create-table-select-keeps-to-filtered-rows-test
  (when (= :mysql (mdb/db-type))
    (testing "MySQL's CREATE TABLE ... SELECT, outside the schema, copies only the kept rows"
      (do-with-tables!
       (fn [conn]
         (try
           (mu/disable-enforcement
             (run-query conn (sandboxed {:create-table :sbx_c, :select [:id], :from [:sbx_a]})))
           (is (= [{:id 1} {:id 2}] (sort-by :id (run-query conn {:select [:id], :from [:sbx_c]}))))
           (finally
             (run-query conn {:drop-table [:if-exists :sbx_c]}))))))))

(deftest ^:parallel mysql-locking-reads-filter-through-addition-test
  (testing "statement that locks rows on MySQL compares filter column plus 0, so that it locks only its own rows"
    (are [query] (and (str/includes? (sandboxed-sql :mysql query) "+ 0")
                      (not (str/includes? (sandboxed-sql :postgres query) "+ 0")))
      {:select [:id], :from [:sbx_a], :for :update}
      {:update :sbx_a, :set {:x 0}}
      {:delete-from :sbx_a}
      {:update :sbx_a, :set {:x (subquery {:select [[[:max :y]]], :from [:sbx_b]})}}))
  (testing "read that locks nothing compares column itself"
    (is (not (str/includes? (sandboxed-sql :mysql {:select [:id], :from [:sbx_a]}) "+ 0")))))

(deftest ^:parallel refused-queries-test
  (are [message query] (thrown-with-msg? clojure.lang.ExceptionInfo message (sandbox/sandbox-query :mysql query options))
    #"\[:param"
    {:select [:id], :from [:sbx_a], :where [:= :id [:param :id]]}

    #"CTE named like a filtered table"
    {:with [[:sbx_a (subquery {:select [:id], :from [:sbx_b]})]], :select [:id], :from [:sbx_a]}

    #"CTE named like a filtered table"
    {:with [[:SBX_A (subquery {:select [:id], :from [:sbx_b]})]], :select [:id], :from [:SBX_A]}

    #"CTE named like a filtered table"
    {:with-recursive [[[:sbx_b {:columns [:id]}] (subquery {:select [:id], :from [:sbx_n]})]], :select [:id], :from [:sbx_b]}

    #"writing 2 into the sandbox column"
    {:update :sbx_a, :set {:w 2}}

    #"writing 2 into the sandbox column"
    {:update :sbx_a, :set {:sbx_a.w 2}}

    #"writing \[:\+ :w 1\] into the sandbox column"
    {:update :sbx_a, :set {:w [:+ :w 1]}}

    #"writing 2 into the sandbox column"
    {:insert-into :sbx_a, :values [{:id 5, :w 2}]}

    #"writing 2 into the sandbox column"
    {:insert-into [:sbx_a [:id :w]], :values [[5 2]]}

    #"writing 2 into the sandbox column"
    {:merge-into :sbx_a, :key [:id], :columns [:id :w], :values [[5 2]]}

    #"writing 2 into the sandbox column"
    {:merge-into [:sbx_a :t], :using [(subquery {:select [:id], :from [:sbx_b]}) :s]
     :on [:= :t.id :s.id], :when-matched-update-set {:w 2}}

    #"writing 2 into the sandbox column"
    {:merge-into [:sbx_a :t], :using [(subquery {:select [:id], :from [:sbx_b]}) :s]
     :on [:= :t.id :s.id], :when-not-matched-insert [[:id :w] [:s.id 2]]}

    #"writing 2 into the sandbox column"
    {:insert-into :sbx_u, :values [{:k 1, :v 1}], :on-conflict [:k], :do-update-set {:w 2}}

    #"upsert column"
    {:insert-into :sbx_u, :values [{:k 1, :v 1}], :on-conflict [:k], :do-update-set {:sbx_u.v 2}}

    #"upsert with RETURNING"
    {:insert-into :sbx_u, :values [{:k 1, :v 1}], :on-conflict [:k], :do-update-set {:v 2}, :returning [:k]}

    #"VALUES rows whose length differs"
    {:insert-into [:sbx_a [:id :x]], :values [[5]]}

    #"VALUES rows without a column list"
    {:insert-into :sbx_a, :values [[5 1 50]]}

    #"selects \*"
    {:insert-into [[:sbx_a [:id :x]] (subquery {:select [:*], :from [:sbx_b]})]}

    #"without a column list or with the sandbox column"
    {:insert-into [[:sbx_a] (subquery {:select [:id :x], :from [:sbx_b]})]}

    #"without a column list or with the sandbox column"
    {:insert-into [[:sbx_a [:id :w]] (subquery {:select [:id :w], :from [:sbx_b]})]}

    #"INSERT without VALUES rows or a SELECT"
    {:insert-into :sbx_a}

    #"MERGE that has no USING source"
    {:merge-into :sbx_a, :columns [:id :x], :values [[5 50]]}

    #"CREATE TABLE of a filtered or substituted table"
    {:create-table :sbx_a, :with-columns [[:id :integer]]}

    #"DROP TABLE of a filtered or substituted table"
    {:drop-table [:if-exists :sbx_v]}

    #"subquery in CREATE TABLE columns"
    {:create-table :sbx_c, :with-columns [[:id :integer [:default (subquery {:select [[[:max :id]]], :from [:sbx_a]})]]]}))

(deftest ^:parallel refused-shapes-outside-schema-test
  (testing "without schema checks, as in production, sandbox refuses shapes it cannot rewrite"
    (are [message query] (thrown-with-msg? clojure.lang.ExceptionInfo message
                                           (mu/disable-enforcement (sandbox/sandbox-query :h2 query options)))
      #"USING source other than a subquery"
      {:merge-into [:sbx_n :t], :using [:sbx_b :s], :on [:= :t.id :s.id], :when-matched-update-set {:x :s.y}}

      #"USING source other than a subquery"
      {:merge-into :sbx_n, :using :sbx_b, :on [:= :sbx_n.id :sbx_b.id], :when-matched-update-set {:x 1}}

      #"clause :raw"
      {:select [:id], :from [:sbx_a], :raw "x"}

      #"table reference"
      {:select [:id], :from ["sbx_a"]}

      #"item that has no condition"
      {:select [:id], :from [:sbx_a], :join [:sbx_b nil]}

      #"item that has no condition"
      {:select [:id], :from [:sbx_a], :left-join [:sbx_b]}

      #"assignments that are not a map"
      {:update :sbx_a, :set [[:x 1]]}

      #"DROP TABLE of a filtered or substituted table"
      {:drop-table :sbx_a}

      #"INSERT without VALUES rows or a SELECT"
      {:insert-into :sbx_a, :columns [:id :x], :select [:id :y], :from [:sbx_b]}

      #"MERGE that has no USING source"
      {:merge-into :sbx_a, :key [:id], :columns [:id :x], :select [:id :y], :from [:sbx_b]}))
  (testing "without schema checks, as in production, sandbox or Funny SQL refuses on every app DB"
    (doseq [engine [:postgres :mysql :h2]]
      (testing engine
        (are [query] (refused? engine query)
          {:select [:id], :from [:sbx_a], :where [:raw "true"]}
          {:select [[[:pg_read_file "x"] :f]], :from [:sbx_a]}
          {:select [[[:call :query_to_xml "x"] :f]], :from [:sbx_a]}
          {:select [[:%count.* :n]], :from [:sbx_a]}
          {:select [:%pg_read_file.x], :from [:sbx_a]}
          {:update :sbx_n, :set {:x :%now}}
          {:select [:id], :from [:%lower.sbx_a]}
          {:select [:id], :from [[{:select [:id], :from [:sbx_a]} :s]]}
          {:select [:id], :from (subquery {:select [:id], :from [:sbx_a]})}
          {:union (subquery {:select [:id], :from [:sbx_a]})}
          {:select [:id], :from [:sbx_n], :limit (subquery {:select [[[:count :*]]], :from [:sbx_a]})}
          {:insert-into (subquery {:select [:id], :from [:sbx_a]}), :values [[1]]}
          {:insert-into :sbx_u, :values [{:k 1}], :on-conflict [:k], :do-update-set [[:v 1]]})))))

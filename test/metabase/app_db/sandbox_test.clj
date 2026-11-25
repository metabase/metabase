(ns metabase.app-db.sandbox-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.sandbox :as sandbox]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- sandboxed
  "`query` sandboxed to the rows of `sandbox_a` and `sandbox_b` whose `scope` is 1."
  [query]
  (sandbox/sandbox-query query {:table-names #{:sandbox_a :sandbox_b}, :column-name :scope, :column-value 1}))

(defn- unchanged?
  "Whether sandboxing `query` leaves it as it is."
  [query]
  (= query (sandboxed query)))

(defn- unsupported-message
  "The message of the exception that sandboxing `query` throws, or nil when it throws none."
  [query]
  (try (sandboxed query) nil (catch clojure.lang.ExceptionInfo e (ex-message e))))

(deftest ^:parallel reads-filter-sandboxed-tables-test
  (testing "table without alias is filtered by its name as written"
    (is (= {:select [:*] :from [:sandbox_a] :where [:= :sandbox_a.scope 1]}
           (sandboxed {:select [:*] :from [:sandbox_a]})))
    (is (= {:select [:*] :from :SANDBOX_A :where [:= :SANDBOX_A.scope 1]}
           (sandboxed {:select [:*] :from :SANDBOX_A}))))
  (testing "empty WHERE means no condition"
    (is (= {:select [:*] :from [:sandbox_a] :where [:= :sandbox_a.scope 1]}
           (sandboxed {:select [:*] :from [:sandbox_a] :where []}))))
  (testing "aliased table is filtered by its alias, after the query's own WHERE"
    (is (= {:select [:a.id] :from [[:sandbox_a :a]] :where [:and [:= :a.id 2] [:= :a.scope 1]]}
           (sandboxed {:select [:a.id] :from [[:sandbox_a :a]] :where [:= :a.id 2]}))))
  (testing "schema-qualified, namespaced and identifier forms of table are filtered by table name"
    (is (= {:select [:*] :from [:public.sandbox_a] :where [:= :sandbox_a.scope 1]}
           (sandboxed {:select [:*] :from [:public.sandbox_a]})))
    (is (= {:select [:*] :from [:public/sandbox_a] :where [:= :sandbox_a.scope 1]}
           (sandboxed {:select [:*] :from [:public/sandbox_a]})))
    (doseq [identifier [(h2x/identifier :table "sandbox_a") (h2x/identifier :field "public" "sandbox_a")]]
      (is (= {:select [:*] :from [identifier] :where [:= :sandbox_a.scope 1]}
             (sandboxed {:select [:*] :from [identifier]})))))
  (testing "every sandboxed table in FROM is filtered"
    (is (= {:select [:*] :from [[:sandbox_a :a] :sandbox_c [:sandbox_b :b]] :where [:and [:= :a.scope 1] [:= :b.scope 1]]}
           (sandboxed {:select [:*] :from [[:sandbox_a :a] :sandbox_c [:sandbox_b :b]]}))))
  (testing "other tables are left alone"
    (is (unchanged? {:select [:*] :from [:sandbox_c [:sandbox_d :d]]})))
  (testing "aliases other than plain keywords throw"
    (doseq [alias [(h2x/identifier :table-alias "x") :a.b]]
      (is (re-find #"the alias" (unsupported-message {:select [:*] :from [[:sandbox_a alias]]}))))))

(deftest ^:parallel joins-place-conditions-by-join-type-test
  (testing "JOIN, LEFT JOIN and INNER JOIN filter joined table in their ON"
    (doseq [join-type [:join :left-join :inner-join]]
      (is (= {:select [:*] :from [:sandbox_c] join-type [[:sandbox_b :b] [:and [:= :b.c_id :sandbox_c.id] [:= :b.scope 1]]]}
             (sandboxed {:select [:*] :from [:sandbox_c] join-type [[:sandbox_b :b] [:= :b.c_id :sandbox_c.id]]})))))
  (testing "RIGHT JOIN filters tables before it in its ON and joined table in WHERE"
    (is (= {:select     [:*]
            :from       [[:sandbox_a :a]]
            :right-join [[:sandbox_b :b] [:and [:= :b.a_id :a.id] [:= :a.scope 1]]]
            :where      [:= :b.scope 1]}
           (sandboxed {:select [:*] :from [[:sandbox_a :a]] :right-join [[:sandbox_b :b] [:= :b.a_id :a.id]]}))))
  (testing "RIGHT JOIN after several FROM tables filters only last one in its ON"
    (is (= {:select     [:*]
            :from       [[:sandbox_a :a] [:sandbox_b :c]]
            :right-join [[:sandbox_b :b] [:and [:= :b.c_id :c.id] [:= :c.scope 1]]]
            :where      [:and [:= :a.scope 1] [:= :b.scope 1]]}
           (sandboxed {:select     [:*]
                       :from       [[:sandbox_a :a] [:sandbox_b :c]]
                       :right-join [[:sandbox_b :b] [:= :b.c_id :c.id]]}))))
  (testing "join without condition throws"
    (doseq [joins [[:sandbox_a nil] [:sandbox_a] [[:sandbox_b :b] []]]]
      (is (re-find #"item that has no condition" (unsupported-message {:select [:*] :from [:sandbox_c] :join joins})))))
  (testing "RIGHT JOIN after LEFT JOIN leaves left-joined table filtered in its own ON"
    (is (= {:select     [:*]
            :from       [[:sandbox_a :a]]
            :left-join  [[:sandbox_b :l] [:and [:= :l.a_id :a.id] [:= :l.scope 1]]]
            :right-join [[:sandbox_b :r] [:and [:= :r.a_id :a.id] [:= :a.scope 1]]]
            :where      [:= :r.scope 1]}
           (sandboxed {:select     [:*]
                       :from       [[:sandbox_a :a]]
                       :left-join  [[:sandbox_b :l] [:= :l.a_id :a.id]]
                       :right-join [[:sandbox_b :r] [:= :r.a_id :a.id]]})))))

(deftest ^:parallel subqueries-are-sandboxed-test
  (let [subquery ^:allow-subquery {:select [:a_id] :from [:sandbox_b]}
        expected {:select [:a_id] :from [:sandbox_b] :where [:= :sandbox_b.scope 1]}
        result   (sandboxed {:select [:id [subquery :first_b]]
                             :from   [[^:allow-subquery {:select [:*] :from [:sandbox_a]} :s]]
                             :where  [:and [:in :id subquery] [:in :id #{subquery}] [:not-exists subquery]]
                             :having [:exists subquery]})]
    (is (= {:select [:id [expected :first_b]]
            :from   [[{:select [:*] :from [:sandbox_a] :where [:= :sandbox_a.scope 1]} :s]]
            :where  [:and [:in :id expected] [:in :id #{expected}] [:not-exists expected]]
            :having [:exists expected]}
           result))
    (testing "subqueries keep their metadata"
      (is (:allow-subquery (meta (get-in result [:select 1 0]))))
      (is (:allow-subquery (meta (get-in result [:from 0 0]))))))
  (testing "unions, VALUES subqueries and window specs are sandboxed"
    (is (= {:union-all [{:select [:id] :from [:sandbox_a] :where [:= :sandbox_a.scope 1]}
                        {:select [:id] :from [:sandbox_b] :where [:= :sandbox_b.scope 1]}]}
           (sandboxed {:union-all [{:select [:id] :from [:sandbox_a]} {:select [:id] :from [:sandbox_b]}]})))
    (is (= {:select [:*] :from [[{:values [[{:select [:id] :from [:sandbox_a] :where [:= :sandbox_a.scope 1]}]]} :v]]}
           (sandboxed {:select [:*] :from [[{:values [[{:select [:id] :from [:sandbox_a]}]]} :v]]})))
    (is (= {:select [[[:over [[:row_number] {:order-by [[{:select [:id] :from [:sandbox_a] :where [:= :sandbox_a.scope 1]}]]}]]]]}
           (sandboxed {:select [[[:over [[:row_number] {:order-by [[{:select [:id] :from [:sandbox_a]}]]}]]]]}))))
  (testing "subquery in [:inline ...] is sandboxed"
    (is (= {:select [[[:inline {:select [:name] :from [:sandbox_a] :where [:= :sandbox_a.scope 1]}] :x]]}
           (sandboxed {:select [[[:inline {:select [:name] :from [:sandbox_a]}] :x]]}))))
  (testing "literal values are left alone"
    (is (unchanged? {:select [[::h2x/typed :sandbox_a {:database-type "text"}] [:lift {:select 1}] [:inline 1]]
                     :from   [:sandbox_c]}))))

(deftest ^:parallel ctes-are-sandboxed-test
  (testing "CTE bodies are sandboxed and recursive CTEs keep their own names"
    (is (= {:with [[:x {:select [:*] :from [:sandbox_a] :where [:= :sandbox_a.scope 1]}]] :select [:*] :from [:x]}
           (sandboxed {:with [[:x {:select [:*] :from [:sandbox_a]}]] :select [:*] :from [:x]})))
    (is (unchanged? {:with-recursive [[[:r {:columns [:n]}]
                                       {:union-all [{:select [[[:inline 1] :n]]}
                                                    {:select [[[:+ :n 1] :n]] :from [:r] :where [:< :n 3]}]}]]
                     :select         [:n]
                     :from           [:r]})))
  (testing "CTE named like sandboxed table throws"
    (doseq [cte-name [:sandbox_a :SANDBOX_B (h2x/identifier :field "sandbox_a")]]
      (is (re-find #"CTE named like the sandboxed table"
                   (unsupported-message {:with [[cte-name {:select [[[:inline 9] :id]]}]] :select [:*] :from [:x]}))))))

(deftest ^:parallel updates-and-deletes-touch-sandbox-rows-only-test
  (is (= {:update :sandbox_a :set {:name "x"} :where [:= :sandbox_a.scope 1]}
         (sandboxed {:update :sandbox_a :set {:name "x"}})))
  (is (= {:update [:sandbox_a :a] :set {:name "x" :scope 1} :where [:and [:= :a.id 2] [:= :a.scope 1]]}
         (sandboxed {:update [:sandbox_a :a] :set {:name "x" :scope 1} :where [:= :a.id 2]})))
  (is (= {:delete-from :public/SANDBOX_B
          :where       [:and
                        [:in :id {:select [:a_id] :from [:sandbox_a] :where [:= :sandbox_a.scope 1]}]
                        [:= :SANDBOX_B.scope 1]]}
         (sandboxed {:delete-from :public/SANDBOX_B :where [:in :id {:select [:a_id] :from [:sandbox_a]}]})))
  (testing "subquery in assignment is sandboxed"
    (is (= {:update :sandbox_c :set {:n {:select [[[:count :*]]] :from [:sandbox_a] :where [:= :sandbox_a.scope 1]}}}
           (sandboxed {:update :sandbox_c :set {:n {:select [[[:count :*]]] :from [:sandbox_a]}}}))))
  (testing "assignments that are not a map throw"
    (is (re-find #":set assignments that are not a map" (unsupported-message {:update :sandbox_a :set [[:name "x"]]}))))
  (testing "update writing another value into sandbox column throws"
    (doseq [column [:scope :SCOPE]]
      (is (re-find #"writing 2 into the sandbox column"
                   (unsupported-message {:update :sandbox_a :set {column 2} :where [:= :id 1]}))))))

(deftest ^:parallel inserts-write-sandbox-value-test
  (testing "map rows get sandbox value"
    (is (= {:insert-into :sandbox_a :values [{:id 4 :scope 1} {:id 5 :SCOPE 1}]}
           (sandboxed {:insert-into :sandbox_a :values [{:id 4} {:id 5 :SCOPE 1}]}))))
  (testing "vector rows get sandbox column at end of their column list and sandbox value at end of each row"
    (is (= {:insert-into :sandbox_a :columns [:id :scope] :values [[4 1]]}
           (sandboxed {:insert-into :sandbox_a :columns [:id] :values [[4]]})))
    (is (= {:insert-into [:sandbox_a [:id :scope]] :values [[4 1]]}
           (sandboxed {:insert-into [:sandbox_a [:id]] :values [[4]]})))
    (is (= {:insert-into :sandbox_a :columns [:id :scope] :values [[4 1]]}
           (sandboxed {:insert-into :sandbox_a :columns :id :values [[4]]}))))
  (testing "INSERT ... SELECT sources select sandbox value as inline literal"
    (is (= {:insert-into [[:sandbox_b [:id :a_id :scope]]
                          {:select [:id :id [[:inline 1] :scope]] :from [:sandbox_a] :where [:= :sandbox_a.scope 1]}]}
           (sandboxed {:insert-into [[:sandbox_b [:id :a_id]] {:select [:id :id] :from [:sandbox_a]}]})))
    (doseq [select [[:id] :id]]
      (is (= {:insert-into :sandbox_b :columns [:id :scope] :select [:id [[:inline 1] :scope]] :from [:sandbox_c]}
             (sandboxed {:insert-into :sandbox_b :columns [:id] :select select :from [:sandbox_c]}))))
    (is (= {:insert-into [[:sandbox_b [:id :scope]]
                          {:union-all [{:select [:id [[:inline 1] :scope]] :from [:sandbox_c]}
                                       {:select-distinct [:id [[:inline 1] :scope]] :from [:sandbox_c]}]}]}
           (sandboxed {:insert-into [[:sandbox_b [:id]]
                                     {:union-all [{:select [:id] :from [:sandbox_c]}
                                                  {:select-distinct [:id] :from [:sandbox_c]}]}]}))))
  (testing "inserts into other tables are left alone"
    (is (unchanged? {:insert-into :sandbox_c :values [{:id 4}]})))
  (testing "writing another value into sandbox column throws"
    (is (re-find #"writing 2 into the sandbox column"
                 (unsupported-message {:insert-into :sandbox_a :values [{:id 4 :scope 2}]})))
    (is (re-find #"writing 2 into the sandbox column"
                 (unsupported-message {:insert-into :sandbox_a :columns [:id :scope] :values [[4 2]]})))
    (is (re-find #"writing 2 into the sandbox column"
                 (unsupported-message {:insert-into :sandbox_a :columns #{:scope} :values [[2]]}))))
  (testing "inserts whose sandbox column sandbox-query cannot add throw"
    (is (re-find #"VALUES rows without a column list"
                 (unsupported-message {:insert-into :sandbox_a :values [[4 "x"]]})))
    (is (re-find #"without a column list or with the sandbox column"
                 (unsupported-message {:insert-into [[:sandbox_b] {:select [:id] :from [:sandbox_c]}]})))
    (is (re-find #"without a column list or with the sandbox column"
                 (unsupported-message {:insert-into :sandbox_b :columns [:id :scope] :select [:id :scope] :from [:sandbox_c]})))
    (doseq [star [:* :sandbox_c.*]]
      (is (re-find #"selects \*"
                   (unsupported-message {:insert-into [[:sandbox_b [:id :a_id]] {:select [star] :from [:sandbox_c]}]}))))))

(deftest ^:parallel upserts-leave-rows-outside-sandbox-test
  (is (= {:insert-into   :sandbox_a
          :values        [{:id 2 :name "x" :scope 1}]
          :on-conflict   [:id]
          :do-update-set {:name [:case [:= :sandbox_a.scope 1] :excluded.name :else :sandbox_a.name]}}
         (sandboxed {:insert-into   :sandbox_a
                     :values        [{:id 2 :name "x"}]
                     :on-conflict   [:id]
                     :do-update-set {:name :excluded.name}})))
  (is (= {:insert-into             :sandbox_a
          :values                  [{:id 2 :name "x" :scope 1}]
          :on-duplicate-key-update {:name [:case [:= :sandbox_a.scope 1] [:values :name] :else :sandbox_a.name]}}
         (sandboxed {:insert-into             :sandbox_a
                     :values                  [{:id 2 :name "x"}]
                     :on-duplicate-key-update {:name [:values :name]}})))
  (testing "assignments keep their metadata"
    (is (:allow-subquery (meta (:do-update-set (sandboxed {:insert-into   :sandbox_a
                                                           :values        [{:id 2}]
                                                           :on-conflict   [:id]
                                                           :do-update-set ^:allow-subquery {:id :excluded.id}}))))))
  (testing "upsert writing another value into sandbox column, or returning rows, throws"
    (is (re-find #"writing \[:inline 2\] into the sandbox column"
                 (unsupported-message {:insert-into   :sandbox_a
                                       :values        [{:id 2}]
                                       :on-conflict   [:id]
                                       :do-update-set {:scope [:inline 2]}})))
    (is (re-find #"upsert with RETURNING"
                 (unsupported-message {:insert-into   :sandbox_a
                                       :values        [{:id 2}]
                                       :on-conflict   [:id]
                                       :do-update-set {:name :excluded.name}
                                       :returning     [:*]})))))

(deftest ^:parallel merges-match-sandbox-rows-only-test
  (testing "merge from source matches and inserts sandbox rows only"
    (is (= {:merge-into              [:sandbox_a :t]
            :using                   [{:select [:id :name] :from [:sandbox_b] :where [:= :sandbox_b.scope 1]} :s]
            :on                      [:and [:= :t.id :s.id] [:= :t.scope 1]]
            :when-matched-update-set {:name :s.name}
            :when-not-matched-insert [[:id :name :scope] [:s.id :s.name 1]]}
           (sandboxed {:merge-into              [:sandbox_a :t]
                       :using                   [{:select [:id :name] :from [:sandbox_b]} :s]
                       :on                      [:= :t.id :s.id]
                       :when-matched-update-set {:name :s.name}
                       :when-not-matched-insert [[:id :name] [:s.id :s.name]]}))))
  (testing "merge by key adds sandbox column to its key and rows"
    (is (= {:merge-into :sandbox_a :columns [:id :name :scope] :key [:id :scope] :values [[2 "x" 1]]}
           (sandboxed {:merge-into :sandbox_a :columns [:id :name] :key [:id] :values [[2 "x"]]})))
    (is (= {:merge-into :sandbox_a :columns [:id :scope] :key [:id :scope] :values [[2 1]]}
           (sandboxed {:merge-into :sandbox_a :columns :id :key :id :values [[2]]}))))
  (testing "merges that sandbox-query cannot rewrite throw"
    (is (re-find #"MERGE that has no USING source and lacks a KEY"
                 (unsupported-message {:merge-into :sandbox_a :columns [:id :name] :values [[5 "merged"]]})))
    (is (re-find #"MERGE that has no USING source and lacks a KEY"
                 (unsupported-message {:merge-into :sandbox_a :columns [:id] :key [:id] :select [:id] :from [:sandbox_c]})))
    (is (re-find #"writing 2 into the sandbox column"
                 (unsupported-message {:merge-into              [:sandbox_a :t]
                                       :using                   [{:select [:id] :from [:sandbox_c]} :s]
                                       :on                      [:= :t.id :s.id]
                                       :when-matched-update-set {:scope 2}})))))

(deftest ^:parallel unsupported-shapes-throw-test
  (is (re-find #"the clause :window" (unsupported-message {:select [:*] :from [:sandbox_a] :window {}})))
  (is (re-find #"\[:param \.\.\.\] value" (unsupported-message {:select [:*] :from [:sandbox_c] :where [:in :id [:param :ids]]})))
  (is (re-find #"PersistentQueue in a query"
               (unsupported-message {:select [:*] :from [:sandbox_c] :where [:in :id (conj clojure.lang.PersistentQueue/EMPTY 1)]})))
  (is (re-find #"the upsert column"
               (unsupported-message {:insert-into   :sandbox_a
                                     :values        [{:id 2}]
                                     :on-conflict   [:id]
                                     :do-update-set {(h2x/identifier :field "name") :excluded.name}})))
  (is (re-find #"VALUES rows whose length differs"
               (unsupported-message {:insert-into :sandbox_a :columns [:id :name] :values [[4]]})))
  (is (re-find #"the table reference \"sandbox_a\"" (unsupported-message {:select [:*] :from ["sandbox_a"]})))
  (is (re-find #"the table reference" (unsupported-message {:update "sandbox_a" :set {:name "x"}}))))

(defn- drop-tables!
  "Drop `sandbox_b` and `sandbox_a` when they exist."
  []
  (doseq [table ["sandbox_b" "sandbox_a"]]
    (t2/query [(str "DROP TABLE IF EXISTS " table)])))

(defn- create-tables-and-run!
  "Create `sandbox_a` and `sandbox_b` with rows in and outside the sandbox, call `thunk`, and drop the tables."
  [thunk]
  (drop-tables!)
  (try
    (t2/query ["CREATE TABLE sandbox_a (id INTEGER PRIMARY KEY, scope INTEGER NOT NULL, name VARCHAR(32))"])
    (t2/query ["CREATE TABLE sandbox_b (id INTEGER PRIMARY KEY, scope INTEGER NOT NULL, a_id INTEGER)"])
    (t2/query {:insert-into :sandbox_a :values [{:id 1 :scope 1 :name "a1"}
                                                {:id 2 :scope 2 :name "a2"}
                                                {:id 3 :scope 1 :name "a3"}]})
    (t2/query {:insert-into :sandbox_b :values [{:id 1 :scope 1 :a_id 1}
                                                {:id 2 :scope 2 :a_id 1}
                                                {:id 3 :scope 1 :a_id 2}
                                                {:id 4 :scope 2 :a_id 3}]})
    (thunk)
    (finally
      (drop-tables!))))

(defn- run
  "The rows of the sandboxed `query`, each as a vector of the values of `ks`."
  [ks query]
  (mapv (apply juxt ks) (t2/query (sandboxed query))))

(defn- stored
  "The stored rows of `table`, unsandboxed and by id, each as a vector of the values of `ks`."
  [table ks]
  (mapv (apply juxt ks) (t2/query {:select ks :from [table] :order-by [:id]})))

(deftest sandboxed-queries-run-test
  (create-tables-and-run!
   (fn []
     (testing "select reads sandbox rows only"
       (is (= [[1] [3]] (run [:id] {:select [:id] :from [:sandbox_a] :order-by [:id]}))))
     (testing "inner join pairs sandbox rows only"
       (is (= [[1 1]] (run [:a_id :b_id] {:select   [[:a.id :a_id] [:b.id :b_id]]
                                          :from     [[:sandbox_a :a]]
                                          :join     [[:sandbox_b :b] [:= :b.a_id :a.id]]
                                          :order-by [:a.id :b.id]}))))
     (testing "left join keeps sandbox rows without sandbox match"
       (is (= [[1 1] [3 nil]] (run [:a_id :b_id] {:select    [[:a.id :a_id] [:b.id :b_id]]
                                                  :from      [[:sandbox_a :a]]
                                                  :left-join [[:sandbox_b :b] [:= :b.a_id :a.id]]
                                                  :order-by  [:a.id]}))))
     (testing "right join keeps sandbox rows of right side only, with sandbox matches only"
       (is (= [[1 1] [nil 3]] (run [:a_id :b_id] {:select     [[:a.id :a_id] [:b.id :b_id]]
                                                  :from       [[:sandbox_a :a]]
                                                  :right-join [[:sandbox_b :b] [:= :b.a_id :a.id]]
                                                  :order-by   [:b.id]}))))
     (testing "anti joins see sandbox rows only"
       (is (= [[3]] (run [:id] {:select   [:a.id]
                                :from     [[:sandbox_a :a]]
                                :where    [:not [:exists ^:allow-subquery {:select [:b.id]
                                                                           :from   [[:sandbox_b :b]]
                                                                           :where  [:= :b.a_id :a.id]}]]
                                :order-by [:a.id]})))
       (is (= [[3]] (run [:id] {:select    [:a.id]
                                :from      [[:sandbox_a :a]]
                                :left-join [[:sandbox_b :b] [:= :b.a_id :a.id]]
                                :where     [:= :b.id nil]
                                :order-by  [:a.id]}))))
     (testing "IN subquery and scalar subquery see sandbox rows only"
       (is (= [[1 1] [3 0]]
              (run [:id :bs] {:select   [:sandbox_a.id
                                         [^:allow-subquery {:select [[[:count :*]]]
                                                            :from   [:sandbox_b]
                                                            :where  [:= :sandbox_b.a_id :sandbox_a.id]}
                                          :bs]]
                              :from     [:sandbox_a]
                              :where    [:or
                                         [:in :sandbox_a.id ^:allow-subquery {:select [:a_id] :from [:sandbox_b]}]
                                         [:= :sandbox_a.id 3]]
                              :order-by [:sandbox_a.id]}))))
     (testing "union reads sandbox rows of each table only"
       (is (= #{[1] [3]} (set (run [:id] {:union [^:allow-subquery {:select [:id] :from [:sandbox_a]}
                                                  ^:allow-subquery {:select [:id] :from [:sandbox_b]}]})))))
     (testing "CTE reads sandbox rows only"
       (is (= [[1] [3]] (run [:id] {:with     [[:x ^:allow-subquery {:select [:id] :from [:sandbox_a]}]]
                                    :select   [:id]
                                    :from     [:x]
                                    :order-by [:id]}))))
     (testing "grouping by primary key reads sandbox rows only"
       (is (= [[1 "a1"] [3 "a3"]] (run [:id :name] {:select   [:sandbox_a.id :sandbox_a.name]
                                                    :from     [:sandbox_a]
                                                    :group-by [:sandbox_a.id]
                                                    :order-by [:sandbox_a.id]}))))
     (testing "locking select reads sandbox rows only"
       (t2/with-transaction [_conn]
         (is (= [[1] [3]] (run [:id] {:select [:id] :from [:sandbox_a] :order-by [:id] :for :update})))))
     (testing "update changes sandbox rows only"
       (t2/query (sandboxed {:update [:sandbox_a :a] :set {:name "changed"}}))
       (is (= [[1 "changed"] [2 "a2"] [3 "changed"]] (stored :sandbox_a [:id :name]))))
     (testing "delete removes sandbox rows only"
       (t2/query (sandboxed {:delete-from :sandbox_b :where [:> :id 0]}))
       (is (= [[2] [4]] (stored :sandbox_b [:id]))))
     (testing "inserts write sandbox value"
       (t2/query (sandboxed {:insert-into :sandbox_a :values [{:id 4 :name "a4"}]}))
       (t2/query (sandboxed {:insert-into :sandbox_a :columns [:id :name] :values [[5 "a5"]]}))
       (t2/query (sandboxed {:insert-into [[:sandbox_b [:id :a_id]]
                                           ^:allow-subquery {:select [[[:+ :id 10] :id] :id] :from [:sandbox_a]}]}))
       (t2/query (sandboxed {:insert-into :sandbox_b
                             :columns     [:id :a_id]
                             :union-all   [^:allow-subquery {:select [[[:+ :id 20] :id] :id] :from [:sandbox_a]}
                                           ^:allow-subquery {:select [[[:inline 30] :id] [[:inline 0] :a_id]]}]}))
       (is (= [[1 1 "changed"] [2 2 "a2"] [3 1 "changed"] [4 1 "a4"] [5 1 "a5"]] (stored :sandbox_a [:id :scope :name])))
       (is (= [[2 2 1] [4 2 3] [11 1 1] [13 1 3] [14 1 4] [15 1 5] [21 1 1] [23 1 3] [24 1 4] [25 1 5] [30 1 0]]
              (stored :sandbox_b [:id :scope :a_id]))))
     (when (= :postgres (mdb/db-type))
       (testing "upsert conflicting with row outside sandbox leaves it as it is"
         (doseq [id [2 1]]
           (t2/query (sandboxed {:insert-into   :sandbox_a
                                 :values        [{:id id :name "upserted"}]
                                 :on-conflict   [:id]
                                 :do-update-set ^:allow-subquery {:name :excluded.name}})))
         (is (= [[1 "upserted"] [2 "a2"]] (take 2 (stored :sandbox_a [:id :name])))))))))

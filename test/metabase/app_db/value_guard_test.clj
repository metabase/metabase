(ns metabase.app-db.value-guard-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.value-guard :as value-guard]
   [metabase.util.honey-sql-2 :as h2x]
   [honey.sql :as sql]))

(defn- rejects?
  ([query] (rejects? query false))
  ([query strict?]
   (try
     (value-guard/assert-values-wrapped! query {} strict?)
     false
     (catch clojure.lang.ExceptionInfo _ true))))

(deftest auto-param-lifts-inline-values-test
  (testing "a marked value is lifted into HoneySQL's params map and binds as ?"
    (let [[form params] (value-guard/auto-param
                         {:select [:*] :from [:t] :where [:= :id [:auto/param 4]]})]
      (is (= ["SELECT * FROM t WHERE id = ?" 4]
             (sql/format form {:params params})))))
  (testing "a hostile non-scalar passed through [:param*] binds opaquely instead of compiling to SQL"
    (let [evil          {:raw "(SELECT password FROM core_user)"}
          [form params] (value-guard/auto-param {:select [:*] :from [:t] :where [:= :id [:auto/param evil]]})
          [sql & args]  (sql/format form {:params params})]
      (is (= "SELECT * FROM t WHERE id = ?" sql))
      (is (= [evil] args) "the value is a bound parameter, not SQL text"))))

(deftest rejects-values-that-can-become-sql-test
  (testing "raw/inline/subquery maps in a value slot are rejected"
    (are [query] (rejects? query)
      {:where [:= :id {:raw "(SELECT password FROM core_user)"}]}
      {:where [:= :id {:inline "1=1"}]}
      {:where [:= :id {:select [:x] :from :core_user}]}
      {:where [:and [:= :a 1] [:= :b {:raw "x"}]]}
      {:where [:in :id [1 {:raw "x"}]]}
      {:set {:name {:raw "x"}}}
      {:values [{:name {:raw "x"}}]}))
  (testing "a bare keyword in a value slot is rejected -- it is indistinguishable from a column reference"
    (is (rejects? {:where [:= :id :evil]})))
  (testing "an unclassified operator fails closed"
    (is (rejects? {:where [:unknown-op :id 1]}))))

(deftest checks-every-clause-that-can-hold-a-value-test
  (testing "a join's ON condition is checked -- it is the most common clause in the codebase"
    (are [q] (rejects? q)
      {:join       [[:collection :c] [:= :c.id {:raw "(SELECT 1)"}]]}
      {:left-join  [[:collection :c] [:= :c.id {:raw "(SELECT 1)"}]]}
      {:inner-join [[:collection :c] [:= :c.id :evil]]}))
  (testing "upsert value maps are checked like :set"
    (are [q] (rejects? q)
      {:do-update-set            {:name {:raw "(SELECT 1)"}}}
      {:on-duplicate-key-update  {:name {:raw "(SELECT 1)"}}}))
  (testing "a clause holding only structure is left alone"
    (are [q] (not (rejects? q))
      {:select [:*] :from [[:Card]] :order-by [[:name :asc]]}
      {:limit 10 :offset 5}
      {:returning [:id :name]}
      {:group-by [:name] :partition-by [:id]}))
  (testing "the join target is structure and is not mistaken for a condition"
    (is (not (rejects? {:left-join [[:collection :c] [:= :c.id [:param :p]]]}))))
  (testing "a column-to-column join condition is rejected, like any other bare keyword in a value slot"
    ;; Both sides are keywords and the second sits in a value slot, so the walk cannot tell a column
    ;; reference from a user-supplied keyword. These sites need an explicit marker when their
    ;; namespace adopts the check.
    (is (rejects? {:left-join [[:collection :c] [:= :c.id :report_card.collection_id]]}))))

(deftest allows-real-queries-test
  (testing "forms produced by the Toucan compile pipeline today are accepted"
    (are [query] (not (rejects? query))
      {:select [:*] :from [[:User]] :where [:= :id 1]}
      {:select [:*] :from [[:Card]] :where [:and [:= :archived false] [:= :name "x"]]}
      {:select [:*] :from [[:Card]] :where [:in :id [1 2 3]]}
      {:select [:*] :from [[:Card]] :where [:like :description "%z%"]}
      {:where [:= :id [:param :k]]}))
  (testing "structure clauses are not inspected -- structure safety is a separate concern"
    (is (not (rejects? {:select [:*] :from [[:Card]] :order-by [[:name :asc]]})))))

(deftest h2x-wrappers-are-checked-by-payload-test
  (testing "a hardcoded literal is allowed outside strict mode"
    (is (not (rejects? {:where [:= :r.model (h2x/literal "Document")]}))))
  (testing "but a literal wrapping a raw form is still rejected"
    (is (rejects? {:where [:= :x [:metabase.util.honey-sql-2/literal {:raw "evil"}]]})))
  (testing "h2x/literal splices into SQL rather than binding, so strict mode rejects it"
    (is (rejects? {:where [:= :r.model (h2x/literal "Document")]} true))))

(deftest temporal-values-are-accepted-test
  (testing "java.time values reach the compile step from insert/update hooks and bind as parameters"
    (are [v] (not (rejects? {:values [{:created_at v}]}))
      (java.time.ZonedDateTime/now)
      (java.time.OffsetDateTime/now)
      (java.time.LocalDateTime/now)
      (java.time.LocalDate/now)
      (java.time.Instant/now)
      (java.util.Date.)))
  (testing "and in a where clause"
    (is (not (rejects? {:where [:> :created_at (java.time.ZonedDateTime/now)]})))))

(deftest dev-authored-markers-bless-structure-not-values-test
  (testing "a subquery marked ^:allow-subquery is allowed to be SQL"
    (is (not (rejects? {:where [:exists ^:allow-subquery {:select [1] :from [:report_card]
                                                          :where [:= :collection_id 5]}]}))))
  (testing "but the values inside it are still checked -- the marker blesses the SQL, not the data"
    (is (rejects? {:where [:exists ^:allow-subquery {:select [1] :from [:report_card]
                                                     :where [:= :collection_id {:raw "(SELECT pw FROM core_user)"}]}]}))
    (is (rejects? {:where [:exists ^:allow-subquery {:select [1] :from [:t]
                                                     :where [:= :id :evil]}]})))
  (testing "an unmarked subquery in a value slot is still rejected"
    (is (rejects? {:where [:= :id {:select [:x] :from :core_user}]}))))

(deftest unresolved-auto-param-is-rejected-test
  (testing "a marker that reached the check unlifted throws"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"unresolved"
                          (value-guard/assert-values-wrapped!
                           {:where [:= :locale [:auto/param "de"]]} {} false))))
  (testing "including one carrying a payload HoneySQL would splice into the SQL"
    ;; HoneySQL does not know the marker, so it compiles it as a function call over its argument:
    ;;   (sql/format {:where [:= :id [:auto/param {:raw "(SELECT ...)"}]]})
    ;;   => ["WHERE id = PARAM ((SELECT ...))"]   -- an injection, not merely wrong SQL
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"unresolved"
                          (value-guard/assert-values-wrapped!
                           {:where [:= :id [:auto/param {:raw "(SELECT password FROM core_user)"}]]}
                           {} false)))))

(deftest strict-mode-requires-bound-params-test
  (testing "strict mode rejects a bare scalar and accepts a bound param"
    (is (rejects? {:where [:= :id 1]} true))
    (is (not (rejects? {:where [:= :id [:param :k]]} true)))))

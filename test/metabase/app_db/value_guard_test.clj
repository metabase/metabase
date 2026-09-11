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
                         {:select [:*] :from [:t] :where [:= :id [:param* 4]]})]
      (is (= ["SELECT * FROM t WHERE id = ?" 4]
             (sql/format form {:params params})))))
  (testing "a hostile non-scalar passed through [:param*] binds opaquely instead of compiling to SQL"
    (let [evil          {:raw "(SELECT password FROM core_user)"}
          [form params] (value-guard/auto-param {:select [:*] :from [:t] :where [:= :id [:param* evil]]})
          [sql & args]  (sql/format form {:params params})]
      (is (= "SELECT * FROM t WHERE id = ?" sql))
      (is (= [evil] args) "the value is a bound parameter, not SQL text"))))

(deftest coercions-reject-non-numbers-test
  (is (= 5 (value-guard/long* 5)))
  (is (= [1 2 3] (value-guard/longs [1 2 3])))
  (are [x] (thrown? Exception (value-guard/long* x))
    "1 OR 1=1"
    {}
    nil))

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

(deftest strict-mode-requires-bound-params-test
  (testing "strict mode rejects a bare scalar and accepts a bound param"
    (is (rejects? {:where [:= :id 1]} true))
    (is (not (rejects? {:where [:= :id [:param :k]]} true)))))

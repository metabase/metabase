(ns metabase.sql-parsing.shadow-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.sql-parsing.common :as common]
   [metabase.sql-parsing.protocol :as protocol]
   [metabase.sql-parsing.shadow :as shadow]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- stub-parser
  "A SqlParser whose every method calls `(f method-keyword args)`."
  [f]
  (reify protocol/SqlParser
    (referenced-tables [_ dialect sql] (f :referenced-tables [dialect sql]))
    (referenced-fields [_ dialect sql] (f :referenced-fields [dialect sql]))
    (returned-columns-lineage [_ dialect sql schema sqlglot-schema]
      (f :returned-columns-lineage [dialect sql schema sqlglot-schema]))
    (validate-query [_ dialect sql schema sqlglot-schema] (f :validate-query [dialect sql schema sqlglot-schema]))
    (simple-query [_ dialect sql] (f :simple-query [dialect sql]))
    (add-into-clause [_ dialect sql table-name] (f :add-into-clause [dialect sql table-name]))
    (field-references [_ dialect sql] (f :field-references [dialect sql]))
    (replace-names [_ dialect sql replacements] (f :replace-names [dialect sql replacements]))
    (single-stmt-of-type [_ dialect sql stmt-type] (f :single-stmt-of-type [dialect sql stmt-type]))
    (transpile-sql [_ sql from-dialect to-dialect] (f :transpile-sql [sql from-dialect to-dialect]))))

(defn- shadow-parser
  [primary shadow & {:keys [sample?] :or {sample? (constantly true)}}]
  (shadow/parser {:primary-backend :sqlglot, :primary primary
                  :shadow-backend :sqlglot-java, :shadow shadow
                  :sample? sample?}))

(defn- comparisons
  [system method outcome]
  (or (mt/metric-value system :metabase-sql-parsing/shadow-comparisons
                       {:method method, :dialect "postgres", :outcome outcome})
      0))

(defn- wait-for-comparisons
  "Wait until `n` comparisons of `method` have finished, whatever their outcome."
  [system method n]
  (let [deadline (+ (System/currentTimeMillis) 10000)]
    (loop []
      (let [done (reduce + (map #(comparisons system method %)
                                ["match" "mismatch" "error-type-mismatch" "primary-only-error" "shadow-only-error"]))]
        (when (and (< done n) (< (System/currentTimeMillis) deadline))
          (Thread/sleep 10)
          (recur))))))

(defn- call-every-method
  [parser]
  {:referenced-tables        (protocol/referenced-tables parser "postgres" "sql")
   :referenced-fields        (protocol/referenced-fields parser "postgres" "sql")
   :returned-columns-lineage (protocol/returned-columns-lineage parser "postgres" "sql" "public" {})
   :validate-query           (protocol/validate-query parser "postgres" "sql" "public" {})
   :simple-query             (protocol/simple-query parser "postgres" "sql")
   :add-into-clause          (protocol/add-into-clause parser "postgres" "sql" "t")
   :field-references         (protocol/field-references parser "postgres" "sql")
   :replace-names            (protocol/replace-names parser "postgres" "sql" {})
   :single-stmt-of-type      (protocol/single-stmt-of-type parser "postgres" "sql" "read")
   :transpile-sql            (protocol/transpile-sql parser "sql" "postgres" "mysql")})

(deftest every-method-answers-with-the-primary-test
  (mt/with-prometheus-system! [_ system]
    (let [calls  (atom [])
          ;; a map, so that every method's normalization accepts it
          answer (fn [method args] {:method method, :args args})
          parser (shadow-parser (stub-parser answer)
                                (stub-parser (fn [method args] (swap! calls conj [method args]) (answer method args))))
          result (call-every-method parser)]
      (testing "the caller gets the primary's value for every protocol method"
        (is (= (set (map (comp keyword name) (keys (:sigs protocol/SqlParser))))
               (set (keys result))))
        (doseq [[method value] result]
          (is (= method (:method value)))))
      (testing "and every method runs on the shadow parser with the same arguments"
        (doseq [method (keys result)]
          (wait-for-comparisons system (name method) 1)
          (is (== 1 (comparisons system (name method) "match")) (name method)))
        (is (= (set (map (fn [[method value]] [method (:args value)]) result))
               (set @calls)))))))

(deftest primary-exception-is-rethrown-unchanged-test
  (mt/with-prometheus-system! [_ system]
    (let [error  (common/call-failed-ex "ParseError: Invalid expression")
          parser (shadow-parser (stub-parser (fn [_ _] (throw error)))
                                (stub-parser (fn [_ _] [])))]
      (is (identical? error (try (protocol/referenced-tables parser "postgres" "sql")
                                 (catch Exception e e))))
      (wait-for-comparisons system "referenced-tables" 1)
      (is (== 1 (comparisons system "referenced-tables" "primary-only-error"))))))

(deftest no-comparison-unless-sampled-test
  (mt/with-prometheus-system! [_ system]
    (let [shadow-calls (atom 0)
          parser       (shadow-parser (stub-parser (fn [_ _] []))
                                      (stub-parser (fn [_ _] (swap! shadow-calls inc) []))
                                      :sample? (constantly false))]
      (protocol/referenced-tables parser "postgres" "sql")
      (Thread/sleep 100)
      (is (zero? @shadow-calls))
      (is (zero? (comparisons system "referenced-tables" "match"))))))

(deftest slow-shadow-drops-comparisons-test
  (testing "a shadow parser that does not return never delays the caller; comparisons past the queue are dropped"
    (mt/with-prometheus-system! [_ system]
      (let [release (promise)
            parser  (shadow-parser (stub-parser (fn [_ _] []))
                                   (stub-parser (fn [_ _] @release [])))]
        (try
          (dotimes [_ 100]
            (is (= [] (protocol/referenced-tables parser "postgres" "sql"))))
          ;; two running, 64 waiting
          (is (== 34 (comparisons system "referenced-tables" "dropped")))
          (finally
            (deliver release true)))))))

(deftest comparison-that-throws-is-counted-test
  (mt/with-prometheus-system! [_ system]
    ;; lineage normalization destructures each column; a number cannot be
    (let [parser (shadow-parser (stub-parser (fn [_ _] [1])) (stub-parser (fn [_ _] [1])))]
      (is (= [1] (protocol/returned-columns-lineage parser "postgres" "sql" nil {})))
      (let [deadline (+ (System/currentTimeMillis) 10000)]
        (while (and (zero? (comparisons system "returned-columns-lineage" "comparison-failed"))
                    (< (System/currentTimeMillis) deadline))
          (Thread/sleep 10)))
      (is (== 1 (comparisons system "returned-columns-lineage" "comparison-failed"))))))

(defn- outcome [value] {:value value})
(defn- thrown [error] {:thrown (common/call-failed-ex error)})

(deftest classify-test
  (testing "values"
    (is (= :match (shadow/classify :referenced-tables (outcome [[nil nil "a"]]) (outcome [[nil nil "a"]]))))
    (is (= :mismatch (shadow/classify :referenced-tables (outcome [[nil nil "a"]]) (outcome [])))))
  (testing "errors are compared by type, not message"
    (is (= :match (shadow/classify :simple-query (thrown "ParseError: Expected ]") (thrown "ParseError: Expecting ]"))))
    (is (= :error-type-mismatch (shadow/classify :simple-query (thrown "ParseError: x") (thrown "TokenError: x"))))
    (is (= :primary-only-error (shadow/classify :simple-query (thrown "ParseError: x") (outcome {:is_simple true}))))
    (is (= :shadow-only-error (shadow/classify :simple-query (outcome {:is_simple true}) (thrown "ParseError: x")))))
  (testing "differences callers do not see are not mismatches"
    (testing "field-references: the order of used fields, at every level"
      (let [a {:type "single_column" :column "a"}
            b {:type "single_column" :column "b"}]
        (is (= :match (shadow/classify :field-references
                                       (outcome {:used_fields [a b]
                                                 :returned_fields [{:type "custom_field" :used_fields [a b]}]
                                                 :errors []})
                                       (outcome {:used_fields [b a]
                                                 :returned_fields [{:type "custom_field" :used_fields [b a]}]
                                                 :errors []}))))
        (is (= :mismatch (shadow/classify :field-references
                                          (outcome {:used_fields [] :returned_fields [a b] :errors []})
                                          (outcome {:used_fields [] :returned_fields [b a] :errors []}))))))
    (testing "returned-columns-lineage: the order of a column's dependencies"
      (is (= :match (shadow/classify :returned-columns-lineage
                                     (outcome [["x" false [[nil "s" "t" "a"] [nil "s" "t" "b"]]]])
                                     (outcome [["x" false [[nil "s" "t" "b"] [nil "s" "t" "a"]]]])))))
    (testing "transpile-sql: layout"
      (is (= :match (shadow/classify :transpile-sql
                                     (outcome {:status "success" :transpiled_sql "SELECT\n  a\nFROM t\nJOIN b\n  ON x"})
                                     (outcome {:status "success" :transpiled_sql "SELECT\n  a\nFROM t\nJOIN b ON x"}))))
      (is (= :mismatch (shadow/classify :transpile-sql
                                        (outcome {:status "success" :transpiled_sql "SELECT a FROM t TABLESAMPLE (1)"})
                                        (outcome {:status "success" :transpiled_sql "SELECT a FROM t"})))))))

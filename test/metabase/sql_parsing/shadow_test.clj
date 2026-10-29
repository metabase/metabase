(ns metabase.sql-parsing.shadow-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.analytics-interface.core :as analytics]
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
          ;; the methods that rewrite SQL answer with SQL, the others with a map
          answer (fn [method args]
                   (if (#{:add-into-clause :replace-names} method)
                     (pr-str {:method method, :args args})
                     {:method method, :args args}))
          parser (shadow-parser (stub-parser answer)
                                (stub-parser (fn [method args] (swap! calls conj [method args]) (answer method args))))
          result (call-every-method parser)]
      (testing "the caller gets the primary's value for every protocol method"
        (is (= (set (map (comp keyword name) (keys (:sigs protocol/SqlParser))))
               (set (keys result))))
        (doseq [[method value] result]
          (is (= method (:method (cond-> value (string? value) read-string))))))
      (testing "and every method runs on the shadow parser with the same arguments"
        (doseq [method (keys result)]
          (wait-for-comparisons system (name method) 1)
          (is (== 1 (comparisons system (name method) "match")) (name method)))
        (is (= (set (map (fn [[method value]] [method (:args (cond-> value (string? value) read-string))]) result))
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
    (is (= :shadow-only-error (shadow/classify :simple-query (outcome {:is_simple true}) (thrown "ParseError: x"))))))

(deftest classify-logical-value-test
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
    (testing "transpile-sql: layout, but not what is inside literals, quoted names or comments"
      (doseq [[a b] [["SELECT\n  a\nFROM t\nJOIN b\n  ON x" "SELECT\n  a\nFROM t\nJOIN b ON x"]
                     ["WHERE (\n  a = 1\n)" "WHERE (a = 1)"]]]
        (is (= :match (shadow/classify :transpile-sql
                                       (outcome {:status "success" :transpiled_sql a})
                                       (outcome {:status "success" :transpiled_sql b})))))
      (doseq [[a b] [["SELECT a FROM t TABLESAMPLE (1)" "SELECT a FROM t"]
                     ["SELECT 'a  b'" "SELECT 'a b'"]
                     ["SELECT \"a  b\"" "SELECT \"a b\""]
                     ["SELECT 1 /* a  b */" "SELECT 1 /* a b */"]
                     ["SELECT 'it''s  x'" "SELECT 'it''s x'"]]]
        (is (= :mismatch (shadow/classify :transpile-sql
                                          (outcome {:status "success" :transpiled_sql a})
                                          (outcome {:status "success" :transpiled_sql b})))
            a)))
    (testing "transpile-sql: the error message, when both report an error"
      (is (= :match (shadow/classify :transpile-sql
                                     (outcome {:status "error" :reason "parse_error" :error_message "Expected ]"})
                                     (outcome {:status "error" :reason "parse_error" :error_message "Expecting ]"}))))
      (is (= :mismatch (shadow/classify :transpile-sql
                                        (outcome {:status "error" :reason "multiple_statements"})
                                        (outcome {:status "error" :reason "parse_error"})))))
    (testing "field-references: the shape of an error, as the parsers return it"
      (is (= :match (shadow/classify :field-references
                                     (outcome {:used_fields [] :returned_fields [] :errors [[["type" "syntax_error"]]]})
                                     (outcome {:used_fields [] :returned_fields [] :errors [{:type "syntax_error"}]})))))
    (testing "simple-query: the wording of the reason"
      (is (= :match (shadow/classify :simple-query
                                     (outcome {:is_simple false :reason "Contains a Union"})
                                     (outcome {:is_simple false :reason "Contains a UNION"}))))
      (is (= :mismatch (shadow/classify :simple-query (outcome {:is_simple false}) (outcome {:is_simple true})))))
    (testing "validate-query: the wording of the message"
      (is (= :match (shadow/classify :validate-query
                                     (outcome {:status "error" :type "column_not_resolved" :column "a" :message "x"})
                                     (outcome {:status "error" :type "column_not_resolved" :column "a" :message "y"}))))
      (is (= :mismatch (shadow/classify :validate-query
                                        (outcome {:status "error" :type "column_not_resolved" :column "a"})
                                        (outcome {:status "error" :type "column_not_resolved" :column "b"})))))))

(deftest sampling-failure-answers-with-the-primary-test
  (mt/with-prometheus-system! [_ system]
    (let [error  (common/call-failed-ex "ParseError: x")
          parser (fn [primary]
                   (shadow-parser (stub-parser primary)
                                  (stub-parser (fn [_ _] []))
                                  :sample? (fn [_] (throw (ex-info "Error parsing Setting" {})))))]
      (is (= [[nil nil "t"]] (protocol/referenced-tables (parser (fn [_ _] [[nil nil "t"]])) "postgres" "sql")))
      (is (identical? error (try (protocol/referenced-tables (parser (fn [_ _] (throw error))) "postgres" "sql")
                                 (catch Exception e e))))
      (Thread/sleep 100)
      (is (zero? (comparisons system "referenced-tables" "match"))))))

(deftest metric-failure-answers-with-the-primary-test
  (testing "a metric that cannot be written does not replace the primary's value or exception"
    (let [error  (common/call-failed-ex "ParseError: x")
          parser (fn [primary shadow]
                   (shadow-parser (stub-parser primary) (stub-parser shadow)))]
      (mt/with-dynamic-fn-redefs [analytics/inc!       (fn [& _] (throw (RuntimeException. "error when updating metric")))
                                  analytics/observe!   (fn [& _] (throw (RuntimeException. "error when updating metric")))
                                  analytics/set-gauge! (fn [& _] (throw (RuntimeException. "error when updating metric")))]
        (is (= [] (protocol/referenced-tables (parser (fn [_ _] []) (fn [_ _] [])) "postgres" "sql")))
        (is (identical? error (try (protocol/referenced-tables (parser (fn [_ _] (throw error)) (fn [_ _] []))
                                                               "postgres" "sql")
                                   (catch Exception e e))))
        (let [release (promise)
              stuck   (parser (fn [_ _] []) (fn [_ _] @release []))]
          (try
            ;; past two threads and 64 waiting, so the comparison is dropped
            (dotimes [_ 70]
              (is (= [] (protocol/referenced-tables stuck "postgres" "sql"))))
            (finally
              (deliver release true))))))))

(deftest in-flight-gauge-shows-a-stuck-shadow-test
  (mt/with-prometheus-system! [_ system]
    (let [release (promise)
          started (atom 0)
          parser  (shadow-parser (stub-parser (fn [_ _] []))
                                 (stub-parser (fn [_ _] (swap! started inc) @release [])))]
      (try
        (dotimes [_ 5]
          (protocol/referenced-tables parser "postgres" "sql"))
        (is (== 5 (mt/metric-value system :metabase-sql-parsing/shadow-in-flight {:parser "sqlglot-java"})))
        (testing "both threads take a comparison, rather than one waiting behind the other"
          (let [deadline (+ (System/currentTimeMillis) 10000)]
            (while (and (< @started 2) (< (System/currentTimeMillis) deadline))
              (Thread/sleep 10)))
          (Thread/sleep 50)
          (is (= 2 @started)))
        (finally
          (deliver release true)))
      (wait-for-comparisons system "referenced-tables" 5)
      (Thread/sleep 50)
      (is (zero? (mt/metric-value system :metabase-sql-parsing/shadow-in-flight {:parser "sqlglot-java"}))))))

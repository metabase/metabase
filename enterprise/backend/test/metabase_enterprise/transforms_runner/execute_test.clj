(ns metabase-enterprise.transforms-runner.execute-test
  "Tests for the shared runner execution infrastructure.
  Covers pure functions: source-table-value->dependency, message-log state, table-schema."
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.transforms-runner.execute :as runner.execute]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ source-table-value->dependency --------------------------------

(deftest source-table-value->dependency-int-test
  (testing "integer table ID returns {:table id}"
    (is (= {:table 42} (runner.execute/source-table-value->dependency 42)))
    (is (= {:table 1} (runner.execute/source-table-value->dependency 1)))))

(deftest source-table-value->dependency-ref-with-table-id-test
  (testing "map with :table_id returns {:table table_id}"
    (is (= {:table 100}
           (runner.execute/source-table-value->dependency
            {:database_id 1 :schema "public" :table "foo" :table_id 100})))))

(deftest source-table-value->dependency-ref-without-table-id-test
  (testing "map without :table_id returns {:table-ref ...} with only the relevant keys"
    (is (= {:table-ref {:database_id 1 :schema "public" :table "foo"}}
           (runner.execute/source-table-value->dependency
            {:database_id 1 :schema "public" :table "foo"})))
    (testing "extra keys are stripped"
      (is (= {:table-ref {:database_id 1 :schema nil :table "bar"}}
             (runner.execute/source-table-value->dependency
              {:database_id 1 :schema nil :table "bar" :extra "ignored"}))))))

(defspec source-table-value->dependency-int-prop 100
  (prop/for-all [n gen/nat]
    (let [result (runner.execute/source-table-value->dependency n)]
      (and (= {:table n} result)
           (int? (:table result))))))

(def ^:private gen-source-table-ref
  "Generator for source table ref maps (without :table_id)."
  (gen/let [db-id gen/nat
            schema (gen/one-of [(gen/return nil) gen/string-alphanumeric])
            table gen/string-alphanumeric]
    {:database_id db-id :schema schema :table table}))

(defspec source-table-value->dependency-ref-no-table-id-prop 100
  (prop/for-all [ref gen-source-table-ref]
    (let [result (runner.execute/source-table-value->dependency ref)]
      (and (contains? result :table-ref)
           (= (select-keys ref [:database_id :schema :table])
              (:table-ref result))))))

(defspec source-table-value->dependency-ref-with-table-id-prop 100
  (prop/for-all [ref gen-source-table-ref
                 tid gen/nat]
    (let [result (runner.execute/source-table-value->dependency (assoc ref :table_id tid))]
      (= {:table tid} result))))

;;; ------------------------------------------------ Message Log ---------------------------------------------------

(deftest empty-message-log-test
  (let [ml (#'runner.execute/empty-message-log)]
    (is (= {:pre [] :runner nil :post []} @ml))))

(deftest log!-before-runner-test
  (testing "log! appends to :pre before runner logs arrive"
    (let [ml (#'runner.execute/empty-message-log)]
      (#'runner.execute/log! ml "first")
      (#'runner.execute/log! ml "second")
      (is (= ["first" "second"] (:pre @ml)))
      (is (nil? (:runner @ml)))
      (is (= [] (:post @ml))))))

(deftest log!-after-runner-test
  (testing "log! appends to :post after runner logs are set"
    (let [ml (#'runner.execute/empty-message-log)]
      (#'runner.execute/log! ml "before")
      (#'runner.execute/replace-runner-logs! ml [{:message "runner msg"}])
      (#'runner.execute/log! ml "after")
      (is (= ["before"] (:pre @ml)))
      (is (= [{:message "runner msg"}] (:runner @ml)))
      (is (= ["after"] (:post @ml))))))

(deftest replace-runner-logs!-test
  (testing "replace-runner-logs! overwrites previous runner logs"
    (let [ml (#'runner.execute/empty-message-log)]
      (#'runner.execute/replace-runner-logs! ml [{:message "old"}])
      (#'runner.execute/replace-runner-logs! ml [{:message "new1"} {:message "new2"}])
      (is (= [{:message "new1"} {:message "new2"}] (:runner @ml))))))

(deftest message-log->transform-run-message-test
  (testing "concatenates pre, runner messages, and post"
    (let [ml (#'runner.execute/empty-message-log)]
      (#'runner.execute/log! ml "Loading tables")
      (#'runner.execute/replace-runner-logs! ml [{:message "Processing..."} {:message "Done"}])
      (#'runner.execute/log! ml "Writing output")
      (is (= "Loading tables\nProcessing...\nDone\nWriting output"
             (#'runner.execute/message-log->transform-run-message ml)))))
  (testing "works with empty log"
    (let [ml (#'runner.execute/empty-message-log)]
      (is (= "" (#'runner.execute/message-log->transform-run-message ml)))))
  (testing "works with only pre messages"
    (let [ml (#'runner.execute/empty-message-log)]
      (#'runner.execute/log! ml "only pre")
      (is (= "only pre" (#'runner.execute/message-log->transform-run-message ml))))))

(deftest exceptional-run-message-test
  (testing "combines log and exception message"
    (let [ml (#'runner.execute/empty-message-log)]
      (#'runner.execute/log! ml "Started")
      (#'runner.execute/replace-runner-logs! ml [{:message "Running"}])
      (let [ex (ex-info "boom" {:transform-message "Python execution failure (exit code 1)"})]
        (is (= "Started\nRunning\nPython execution failure (exit code 1)"
               (#'runner.execute/exceptional-run-message ml ex))))))
  (testing "uses generic message when no :transform-message"
    (let [ml (#'runner.execute/empty-message-log)
          ex (ex-info "boom" {})]
      (is (string? (#'runner.execute/exceptional-run-message ml ex))))))

;;; ------------------------------------------------ table-schema -------------------------------------------------

(deftest table-schema-test
  (testing "builds schema from table name and metadata"
    (let [metadata {:fields [{:name "id" :base_type "Integer"}
                             {:name "name" :base_type "Text"}]}
          result (#'runner.execute/table-schema "my_table" metadata)]
      (is (= :my_table (:name result)))
      (is (= 2 (count (:columns result))))
      (is (= "id" (-> result :columns first :name)))
      (is (true? (-> result :columns first :nullable?)))))
  (testing "keyword table name passes through"
    (let [result (#'runner.execute/table-schema :already_keyword {:fields []})]
      (is (= :already_keyword (:name result)))
      (is (= [] (:columns result))))))

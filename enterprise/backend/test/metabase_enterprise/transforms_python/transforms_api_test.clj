(ns ^:mb/driver-tests metabase-enterprise.transforms-python.transforms-api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.transforms-python.execute :as transforms-python.execute]
   [metabase-enterprise.transforms.test-dataset :as transforms-dataset]
   [metabase-enterprise.transforms.test-util :as transforms.tu :refer [with-transform-cleanup! get-test-schema]]
   [metabase.driver :as driver]
   [metabase.test :as mt]
   [toucan2.core :as t2])
  (:import
   (clojure.lang IDeref)
   (java.io Closeable)
   (java.time Duration)))

(set! *warn-on-reflection* true)

(deftest create-python-transform-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/with-premium-features #{:transforms}
      (mt/dataset transforms-dataset/transforms-test
        (with-transform-cleanup! [table-name "gadget_products"]
          (let [schema            (get-test-schema)
                transform-payload {:name   "My beautiful python runner"
                                   :source {:type          "python"
                                            :body          "print('hello world')"
                                            :source-tables {}}
                                   :target {:type     "table"
                                            :schema   schema
                                            :name     table-name
                                            :database (mt/id)}}
                transform         (mt/user-http-request :crowberto :post 200 "ee/transform"
                                                        transform-payload)]
            (is (= "print('hello chris')"
                   (-> (mt/user-http-request :crowberto :put 200 (format "ee/transform/%s" (:id transform))
                                             (assoc-in transform-payload [:source :body] "print('hello chris')"))
                       :source :body)))))))))

(deftest execute-python-transform-test
  (testing "transform execution with :transforms/table target"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/with-premium-features #{:transforms}
        (mt/dataset transforms-dataset/transforms-test
          (let [schema (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))]
            (with-transform-cleanup! [{table-name :name :as target} {:type   "table"
                                                                     :schema schema
                                                                     :name   "target_table"}]
              (let [original           {:name   "Gadget Products"
                                        :source {:type  "python"
                                                 :source-database (mt/id)
                                                 :source-tables {"transforms_customers" (mt/id :transforms_customers)}
                                                 :body  (str "import pandas as pd\n"
                                                             "\n"
                                                             "def transform():\n"
                                                             "    return pd.DataFrame({'name': ['Alice', 'Bob'], 'age': [25, 30]})")}
                                        :target  (assoc target :database (mt/id))}
                    {transform-id :id} (mt/user-http-request :crowberto :post 200 "ee/transform" original)]
                (transforms.tu/test-run transform-id)
                (transforms.tu/wait-for-table table-name 5000)
                (is (true? (driver/table-exists? driver/*driver* (mt/db) target)))
                (is (= [["Alice" 25] ["Bob" 30]]
                       (transforms.tu/table-rows table-name)))))))))))

(deftest python-transform-logging-test
  (letfn [(program->source [program]
            (->> (concat ["import pandas as pd"
                          "def transform():"]
                         (for [s program] (str "  " s))
                         ["  return pd.DataFrame({'x': [42]})"])
                 (str/join "\n")))

          (create-transform [{:keys [program]} target]
            {:post [(integer? %)]}
            (:id (mt/user-http-request :crowberto :post 200 "ee/transform"
                                       {:name   "Python logging test"
                                        :source {:type            "python"
                                                 :body            (program->source program)
                                                 :source-tables   {}}
                                        :target (assoc target :database (mt/id))})))

          (block-on-run [{:keys [expect-status]} target transform-id]
            (try
              (transforms.tu/test-run transform-id)
              (catch Throwable e
                ;; test-run throws for non success, but we want to test failures too
                (when-not (= expect-status (:status (ex-data e)))
                  (throw e))))
            (when (= :succeeded expect-status)
              (transforms.tu/wait-for-table (:name target) 5000)))

          (get-last-run [transform-id]
            (:last_run (mt/user-http-request :crowberto :get 200 (format "ee/transform/%d" transform-id))))

          (open-message-value-observer [transform-id]
            (let [states (atom [])
                  fut    (future
                           (try
                             (loop []
                               (let [{:keys [message]} (get-last-run transform-id)]
                                 (cond
                                   (.isInterrupted (Thread/currentThread))
                                   nil

                                  ;; same message as last time
                                   (= message (peek @states))
                                   (recur)

                                  ;; new message value
                                   :else (do (swap! states conj message)
                                             (recur)))))
                             (catch InterruptedException _ nil)))]
              (reify IDeref
                (deref [_] @states)
                Closeable
                (close [_]
                  (future-cancel fut)
                  (assert (not= :timeout (try (deref fut 1000 :timeout) (catch Throwable _))) "Observation thread did not exit!")))))

          (run-scenario [scenario schema]
            (with-redefs [transforms-python.execute/python-message-loop-sleep-duration Duration/ZERO
                          transforms-python.execute/transfer-file-to-db                (if-some [e (:writeback-ex scenario)]
                                                                                         (fn [& _] (throw e))
                                                                                         @#'transforms-python.execute/transfer-file-to-db)]
              (with-transform-cleanup! [target {:type   "table"
                                                :schema schema
                                                :name   "result"}]
                (let [transform-id      (create-transform scenario target)
                      observed-messages (with-open [observer ^Closeable (open-message-value-observer transform-id)]
                                          (block-on-run scenario target transform-id)
                                          @observer)
                      last-run          (get-last-run transform-id)]
                  {:observed-messages observed-messages
                   :last-run          last-run}))))]
    (let [scenarios [{:desc          "stdin"
                      :program       ["print(\"hello, world\")"]
                      :expect-status :succeeded
                      :expected      ["hello, world"]}
                     {:desc          "stderr"
                      :program       ["import sys" "print(\"hello, world\", file=sys.stderr)"]
                      :expect-status :succeeded
                      :expected      ["hello, world"]}
                     {:desc          "interleaved streams"
                      :program       ["import sys"
                                      "print(\"1\", file=sys.stderr)"
                                      "print(\"2\", file=sys.stderr)"
                                      "print(\"3\", file=sys.stdout)"
                                      "print(\"4\", file=sys.stderr)"]
                      :expect-status :succeeded
                      :expected      ["1" "2" "3" "4"]}
                     {:desc          "syntax error"
                      :program       ["print(40 + 2)"
                                      "this is not valid code"]
                      :expect-status :failed
                      :expected      ["SyntaxError: invalid syntax"]}
                     {:desc                  "takes time, early feedback possible"
                      :program               ["import time"
                                              "print(\"a\")"
                                              "time.sleep(0.1)"
                                              "print(\"b\")"
                                              "time.sleep(0.1)"
                                              "print(\"c\")"]
                      :expect-early-feedback true
                      :expect-status         :succeeded
                      :expected              ["a" "b" "c"]}
                     {:desc "crash during writeback"
                      :program ["print(42)" "print(\"is the answer\")"]
                      :expect-status :failed
                      :expected ["42", "is the answer"]
                      :writeback-ex (Exception. "Boom!")}]]
      (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
        (mt/with-premium-features #{:transforms}
          (mt/dataset transforms-dataset/transforms-test
            (let [schema (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))]
              (doseq [{:keys [expected
                              expect-early-feedback
                              expect-status
                              desc] :as scenario}
                      scenarios]
                (testing desc
                  (let [{:keys [last-run observed-messages]} (run-scenario scenario schema)
                        {:keys [status message]} last-run]
                    (testing "sanity: status is what we expect"
                      (is (= expect-status (some-> status keyword))))
                    (testing "sanity: message has a value"
                      (is message))
                    (when message
                      (is (str/starts-with? message "Executing Python transform"))
                      (testing "all observed values of message reflect a prefix of the final message (ordering consistent)"
                        (doseq [observed-message observed-messages]
                          (is (str/starts-with? message observed-message))))
                      (when expect-early-feedback
                        (testing "scenario takes time, we should see partial messages for immediate feedback"
                          (is (< 1 (count observed-messages)))))
                      (testing "message includes the expected lines"
                        (is (str/includes? message (str/join "\n" expected)))))))))))))))

(deftest get-python-transform-with-different-target-database-test
  (testing "GET /api/ee/transform/:id correctly fetches target table from different database"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Database target-db {:engine :h2
                                                :details {:db "mem:target-db"}}
                     :model/Table target-table {:db_id (:id target-db)
                                                :schema "PUBLIC"
                                                :name "python_target_table"
                                                :active true}
                     :model/Transform transform {:name "Python Transform Cross DB"
                                                 :source {:type "python"
                                                          :source-database (mt/id)
                                                          :source-tables {}
                                                          :body "def transform():\n    pass"}
                                                 :target {:type "table"
                                                          :schema "PUBLIC"
                                                          :name "python_target_table"
                                                          :database (:id target-db)}}]
        (let [response (mt/user-http-request :crowberto :get 200 (format "ee/transform/%s" (:id transform)))]
          (is (=? {:id     (:id target-table)
                   :name   "python_target_table"
                   :schema "PUBLIC"
                   :db_id  (:id target-db)}
                  (:table response))))))))

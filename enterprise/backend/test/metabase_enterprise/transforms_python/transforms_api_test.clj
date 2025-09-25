(ns ^:mb/driver-tests ^:mb/transforms-python-test metabase-enterprise.transforms-python.transforms-api-test
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
    (mt/dataset transforms-dataset/transforms-test
      (letfn [(create-transform! []
                (let [schema            (get-test-schema)
                      transform-payload {:name   "My beautiful python runner"
                                         :source {:type          "python"
                                                  :body          "print('hello world')"
                                                  :source-tables {}}
                                         :target {:type     "table"
                                                  :schema   schema
                                                  :name     "gadget_products"
                                                  :database (mt/id)}}]
                  (mt/user-http-request :crowberto :post "ee/transform"
                                        transform-payload)))]

        (testing "without any feature flags"
          (mt/with-premium-features #{}
            (testing "creating python transform without any features fails"
              (is (= "error-premium-feature-not-available"
                     (:status (mt/user-http-request :crowberto :post 402 "ee/transform"
                                                    {:name   "My beautiful python runner"
                                                     :source {:type          "python"
                                                              :body          "print('hello world')"
                                                              :source-tables {}}
                                                     :target {:type     "table"
                                                              :schema   (get-test-schema)
                                                              :name     "gadget_products"
                                                              :database (mt/id)}})))))))

        (testing "with only transforms feature flag (no transforms-python)"
          (mt/with-premium-features #{:transforms}
            (testing "creating python transform without transforms-python feature fails"
              (is (= "Premium features required for this transform type are not enabled."
                     (mt/user-http-request :crowberto :post 402 "ee/transform"
                                           {:name   "My beautiful python runner"
                                            :source {:type          "python"
                                                     :body          "print('hello world')"
                                                     :source-tables {}}
                                            :target {:type     "table"
                                                     :schema   (get-test-schema)
                                                     :name     "gadget_products"
                                                     :database (mt/id)}}))))))

        (testing "with transforms-python feature flag"
          (mt/with-premium-features #{:transforms :transforms-python}
            (with-transform-cleanup! [table-name "gadget_products"]
              (let [transform         (create-transform!)]
                (is (= "print('hello chris')"
                       (-> (mt/user-http-request :crowberto :put 200 (format "ee/transform/%s" (:id transform))
                                                 {:name   "My beautiful python runner"
                                                  :source {:type          "python"
                                                           :body          "print('hello chris')"
                                                           :source-tables {}}
                                                  :target {:type     "table"
                                                           :schema   (get-test-schema)
                                                           :name     table-name
                                                           :database (mt/id)}})
                           :source :body)))))))))))

(deftest update-python-transform-feature-flag-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (testing "Updating a python transform requires both :transforms and :transforms-python features"
      (mt/with-temp [:model/Transform {id :id
                                       :as transform} {:name   "Original Python Transform"
                                                       :source {:type          "python"
                                                                :body          "print('original')"
                                                                :source-tables {}}
                                                       :target {:type     "table"
                                                                :schema   "scheam"
                                                                :name     "table"
                                                                :database (mt/id)}}]
        (mt/with-premium-features #{}
          (let [response (mt/user-http-request :crowberto :put
                                               (format "ee/transform/%d" id)
                                               (assoc-in transform [:source :body] "print('no features')"))]
            (is (= "error-premium-feature-not-available" (:status response))
                "Should return 403 without any features")))))))

(deftest run-python-transform-feature-flag-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (testing "Running a python transform requires both :transforms and :transforms-python features"
      (mt/with-premium-features #{:transforms :transforms-python}
        (mt/dataset transforms-dataset/transforms-test
          (with-transform-cleanup! [table-name "test_run_python"]
            (let [schema (get-test-schema)
                  transform-payload {:name   "Test Run Python Transform"
                                     :source {:type          "python"
                                              :body          "def transform():\n    pass"
                                              :source-tables {}}
                                     :target {:type     "table"
                                              :schema   schema
                                              :name     table-name
                                              :database (mt/id)}}
                  created (mt/user-http-request :crowberto :post 200 "ee/transform" transform-payload)]
              (mt/with-premium-features #{}
                (let [response (mt/user-http-request :crowberto :post 402
                                                     (format "ee/transform/%d/run" (:id created)))]
                  (is (= "error-premium-feature-not-available" (:status response)))))
              (mt/with-premium-features #{:transforms}
                (let [response (mt/user-http-request :crowberto :post
                                                     (format "ee/transform/%d/run" (:id created)))]
                  (is (= "Premium features required for this transform type are not enabled." response)
                      "Should return 403 without :transforms-python feature"))))))))))

(deftest execute-python-transform-test
  (testing "transform execution with :transforms/table target"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/with-premium-features #{:transforms :transforms-python}
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

(defn- subsequence?
  "Returns true if sequence ys is a subsequence of xs:
  every element of ys appears in xs in the same order,
  though not necessarily contiguously."
  [xs ys]
  (cond
    (empty? ys) true
    (empty? xs) false
    (= (first xs) (first ys)) (recur (rest xs) (rest ys))
    :else (recur (rest xs) ys)))

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
                      :expected ["42" "is the answer" "Failed to create the resulting table"]
                      :writeback-ex (Exception. "Boom!")}]]
      (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
        (mt/with-premium-features #{:transforms :transforms-python}
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
                          ;; hmmm, sometimes the order seems flipped
                          (is (str/starts-with? message observed-message))))
                      (when expect-early-feedback
                        (testing "scenario takes time, we should see partial messages for immediate feedback"
                          (is (< 1 (count observed-messages)))))
                      (testing "message includes the expected lines"
                        (is (subsequence? (str/split-lines message) expected))))))))))))))

(deftest get-python-transform-with-different-target-database-test
  (testing "GET /api/ee/transform/:id correctly fetches target table from different database"
    (mt/with-premium-features #{:transforms :transforms-python}
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

(deftest python-transform-schema-change-integration-test
  (testing "Python transform handles schema changes using appropriate rename strategy"
    (mt/test-drivers (disj (mt/normal-drivers-with-feature :transforms/python)
                           ;; takes too long on CI
                           :bigquery-cloud-sdk)
      (mt/with-premium-features #{:transforms :transforms-python}
        (mt/dataset transforms-dataset/transforms-test
          (let [schema (get-test-schema)]
            (with-transform-cleanup! [{table-name :name :as target} {:type   "table"
                                                                     :schema schema
                                                                     :name   "schema_change_test"}]

              (let [initial-transform {:name   "Schema Change Integration Test"
                                       :source {:type          "python"
                                                :source-tables {}
                                                :body          (str "import pandas as pd\n"
                                                                    "\n"
                                                                    "def transform():\n"
                                                                    "    return pd.DataFrame({'name': ['Alice', 'Bob'], 'age': [25, 30]})")}
                                       :target (assoc target :database (mt/id))}
                    ;; Create initial transform via API
                    {transform-id :id} (mt/user-http-request :crowberto :post 200 "ee/transform" initial-transform)]

                ;; Run initial transform and validate
                (transforms.tu/test-run transform-id)
                (transforms.tu/wait-for-table table-name 10000)
                (let [initial-rows (transforms.tu/table-rows table-name)]
                  (is (= [["Alice" 25] ["Bob" 30]] initial-rows) "Initial data should be Alice and Bob with ages"))

                ;; Update transform with different schema via API endpoint
                (let [updated-transform (assoc initial-transform
                                               :source {:type          "python"
                                                        :source-tables {}
                                                        :body          (str "import pandas as pd\n"
                                                                            "\n"
                                                                            "def transform():\n"
                                                                            "    return pd.DataFrame({'name': ['Alice', 'Bob'], 'friend': ['Bob', 'Alice']})")})
                      update-response (mt/user-http-request :crowberto :put 200 (format "ee/transform/%d" transform-id)
                                                            updated-transform)]
                  (is (some? update-response) "Transform update should succeed"))

                ;; Run updated transform and validate schema change
                (transforms.tu/test-run transform-id)
                (transforms.tu/wait-for-transform-completion transform-id 10000)

                ;; hmmm, looks like QP needs a bit more time to update metadata
                (Thread/sleep 2000)
                (let [updated-rows (transforms.tu/table-rows table-name)]
                  (is (= [["Alice" "Bob"] ["Bob" "Alice"]] updated-rows)
                      "Updated data should show Alice/Bob with friends instead of ages"))))))))))

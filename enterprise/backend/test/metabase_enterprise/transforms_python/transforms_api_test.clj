(ns ^:mb/driver-tests ^:mb/transforms-python-test metabase-enterprise.transforms-python.transforms-api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.transforms-python.execute :as transforms-python.execute]
   [metabase-enterprise.transforms-python.init]
   [metabase-enterprise.transforms-python.python-runner :as transforms-python.python-runner]
   [metabase.driver :as driver]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.transforms.test-dataset :as transforms-dataset]
   [metabase.transforms.test-util :as transforms.tu :refer [with-transform-cleanup! get-test-schema]]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (clojure.lang IDeref)
   (java.io Closeable)
   (java.time Duration Instant)))

(set! *warn-on-reflection* true)

(def fast-log-polling-ms "A bit of time to wait for when running periodic processes" 50)

(deftest create-python-transform-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/dataset transforms-dataset/transforms-test
      (mt/with-data-analyst-role! (mt/user->id :lucky)
        (mt/with-db-perm-for-group! (perms-group/all-users) (mt/id) :perms/transforms :yes
          (letfn [(create-transform! []
                    (let [schema            (get-test-schema)
                          transform-payload {:name   "My beautiful python runner"
                                             :source {:type            "python"
                                                      :body            "print('hello world')"
                                                      :source-tables   {}
                                                      :source-database (mt/id)}
                                             :target {:type     "table"
                                                      :schema   schema
                                                      :name     "gadget_products"
                                                      :database (mt/id)}}]
                      (mt/user-http-request :lucky :post "ee/transform"
                                            transform-payload)))]

            (testing "without any feature flags"
              (mt/with-premium-features #{}
                (testing "creating python transform without any features fails"
                  (is (= "error-premium-feature-not-available"
                         (:status (mt/user-http-request :lucky :post 402 "ee/transform"
                                                        {:name   "My beautiful python runner"
                                                         :source {:type            "python"
                                                                  :body            "print('hello world')"
                                                                  :source-tables   {}
                                                                  :source-database (mt/id)}
                                                         :target {:type     "table"
                                                                  :schema   (get-test-schema)
                                                                  :name     "gadget_products"
                                                                  :database (mt/id)}})))))))

            (testing "with only transforms feature flag (no transforms-python)"
              (mt/with-premium-features #{:transforms}
                (testing "creating python transform without transforms-python feature fails"
                  (is (= "Premium features required for this transform type are not enabled."
                         (mt/user-http-request :lucky :post 402 "ee/transform"
                                               {:name   "My beautiful python runner"
                                                :source {:type            "python"
                                                         :body            "print('hello world')"
                                                         :source-tables   {}
                                                         :source-database (mt/id)}
                                                :target {:type     "table"
                                                         :schema   (get-test-schema)
                                                         :name     "gadget_products"
                                                         :database (mt/id)}}))))))

            (testing "with transforms-python feature flag"
              (mt/with-premium-features #{:transforms :transforms-python}
                (with-transform-cleanup! [table-name "gadget_products"]
                  (let [transform         (create-transform!)]
                    (is (= "print('hello chris')"
                           (-> (mt/user-http-request :lucky :put 200 (format "ee/transform/%s" (:id transform))
                                                     {:name   "My beautiful python runner"
                                                      :source {:type            "python"
                                                               :body            "print('hello chris')"
                                                               :source-tables   {}
                                                               :source-database (mt/id)}
                                                      :target {:type     "table"
                                                               :schema   (get-test-schema)
                                                               :name     table-name
                                                               :database (mt/id)}})
                               :source :body)))))))))))))

(deftest update-python-transform-feature-flag-test
  (mt/with-premium-features #{:transforms}
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (testing "Updating a python transform requires both :transforms and :transforms-python features"
        (mt/with-temp [:model/Transform {id :id
                                         :as transform} {:name   "Original Python Transform"
                                                         :source {:type            "python"
                                                                  :body            "print('original')"
                                                                  :source-tables   {}
                                                                  :source-database (mt/id)}
                                                         :target {:type     "table"
                                                                  :schema   "scheam"
                                                                  :name     "table"
                                                                  :database (mt/id)}}]
          (mt/with-premium-features #{}
            (let [response (mt/user-http-request :crowberto :put
                                                 (format "ee/transform/%d" id)
                                                 (assoc-in transform [:source :body] "print('no features')"))]
              (is (= "error-premium-feature-not-available" (:status response))
                  "Should return 403 without any features"))))))))

(deftest run-python-transform-feature-flag-test
  (mt/with-premium-features #{:transforms}
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (testing "Running a python transform requires both :transforms and :transforms-python features"
        (mt/with-premium-features #{:transforms :transforms-python}
          (mt/dataset transforms-dataset/transforms-test
            (with-transform-cleanup! [table-name "test_run_python"]
              (let [schema (get-test-schema)
                    transform-payload {:name   "Test Run Python Transform"
                                       :source {:type            "python"
                                                :body            "def transform():\n    pass"
                                                :source-tables   {}
                                                :source-database (mt/id)}
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
                        "Should return 403 without :transforms-python feature")))))))))))

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
                (transforms.tu/wait-for-table table-name 10000)
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

(defn- get-last-run [transform-id]
  (:last_run (mt/user-http-request :crowberto :get 200 (format "ee/transform/%d" transform-id))))

(defn- open-message-value-observer
  "Polls the `:message` state of the last run and stores the value every time it is different to the last observation.
  Close with .close, grab the vector of values with deref."
  ^Closeable [transform-id]
  (let [states   (atom [])
        stopped? (atom false)
        fut      (future
                   (try
                     (loop []
                       (Thread/sleep ^long fast-log-polling-ms) ; avoid hammering the API
                       (when-not @stopped?
                         (let [{:keys [message]} (get-last-run transform-id)]
                           (cond
                             (.isInterrupted (Thread/currentThread))
                             nil

                             ;; same message as last time
                             (= message (peek @states))
                             (recur)

                             ;; new message value
                             :else (do (swap! states conj message)
                                       (recur))))))
                     (catch InterruptedException _ nil)))]
    (reify IDeref
      (deref [_] @states)
      Closeable
      (close [_]
        (reset! stopped? true)
        (future-cancel fut)
        (assert (not= :timeout (try (deref fut 1000 :timeout) (catch Throwable _))) "Observation thread did not exit!")))))

(deftest python-transform-logging-test
  (mt/with-premium-features #{:transforms}
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
                                                   :source-database (mt/id)
                                                   :source-tables   {:test (t2/select-one-pk :model/Table :db_id (mt/id))}}
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

            (run-scenario [scenario schema]
              (with-redefs [transforms-python.execute/python-message-loop-sleep-duration (Duration/ofMillis fast-log-polling-ms)
                            transforms-python.execute/transfer-file-to-db                (if-some [e (:writeback-ex scenario)]
                                                                                           (fn [& _] (throw e))
                                                                                           @#'transforms-python.execute/transfer-file-to-db)]
                (with-transform-cleanup! [target {:type   "table"
                                                  :schema schema
                                                  :name   "result"}]
                  (let [transform-id      (create-transform scenario target)
                        observed-messages (with-open [observer (open-message-value-observer transform-id)]
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
        (mt/test-drivers (-> (mt/normal-drivers-with-feature :transforms/table)
                             ;; certain drivers are slow/unpredictable enough that the generous timings in this test are not enough
                             (disj :snowflake :redshift :bigquery-cloud-sdk))
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
                          (is (subsequence? (str/split-lines message) expected)))))))))))))))

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
                                                          :source-tables {:test (t2/select-one-pk :model/Table :db_id (mt/id))}
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

;; NOTE: The test does not simulate a multi-node setup.
;; In the general case we should expect the signal some time after the /cancel API call, so smaller runs may never see the signal.
;; If you extend the size of the tables / run time then any behaviour this test exposes should also be possible for delayed signals.
#_{:clj-kondo/ignore [:metabase/i-like-making-cams-eyes-bleed-with-horrifically-long-tests]} ; todo factor to maybe some private helpers or share test impl for multiple top-level tests
(deftest python-cancellation-test
  (letfn [(create-transform [{:keys [desc program]} target]
            (mt/user-http-request :crowberto :post 200 "ee/transform"
                                  {:name   (format "Python cancellation test: %s" desc)
                                   :source {:type            "python"
                                            :body            (str/join "\n" program)
                                            :source-database (mt/id)
                                            :source-tables   {"transforms_customers" (mt/id :transforms_customers)}}
                                   :target (assoc target :database (mt/id))}))

          ;; using clojure-ey coordination with promises (I know j.u.c could be better here)
          ;; goal is blocking at the right point during the run so that we can test the cancellation behaviour
          ;; for a particular stage during the run or area of interest (e.g. during a table copy out to shared storage)

          (await-signal [wait-signal]
            (when-not (deref wait-signal 5000 nil)
              (throw (ex-info "Expected delivery of wait signal within a reasonable amount of time" {}))))

          (rf-proxy [ready-signal
                     wait-signal
                     rf]
            (fn
              ([] (rf))
              ([w] (rf w))
              ([w e]
               (deliver ready-signal true)
               (await-signal wait-signal)
               (rf w e))))

          (blocking-redefs [{:keys [block]} ready-signal wait-signal]
            (case block
              :read
              (let [f-ref #'transforms-python.python-runner/write-jsonl-row-to-os-rff
                    f     @f-ref]
                {f-ref
                 (fn [os fields-meta col-meta]
                   (rf-proxy ready-signal wait-signal (f os fields-meta col-meta)))})
              :write
              (let [f-ref #'transforms-python.execute/transfer-file-to-db
                    f     @f-ref]
                {f-ref
                 (fn [& args]
                   (deliver ready-signal true)
                   (await-signal wait-signal)
                   (apply f args))})
              nil))

          (run-scenario [{:keys [expect-script] :as scenario} target]
            (let [ready-signal    (promise)                 ; test blocks: until the run is ready to be cancelled
                  wait-signal     (promise)                 ; run blocks:  until the test has cancelled
                  finished-signal (promise)                 ; test blocks: until the run has finished (exceptionally or not)
                  exec-fn         @#'transforms-python.execute/execute-python-transform!
                  redefs          (blocking-redefs scenario ready-signal wait-signal)]
              (with-redefs-fn
                (merge
                 {#'transforms-python.execute/execute-python-transform!
                  (fn [& args]
                    (try
                      (apply exec-fn args)
                      (finally
                        (deliver finished-signal true))))}
                 redefs)
                (fn []
                  (let [{transform-id :id} (create-transform scenario target)]
                    (with-open [message-observer (open-message-value-observer transform-id)]
                      (let [_          (mt/user-http-request :crowberto :post 202 (format "ee/transform/%d/run" transform-id))
                            ;; Cancellation currently overwrites the message, so we should wait for some log output if we expect it
                            ;; Ideally we would not use the message field for log output, or otherwise avoid having logs being lost on cancellation.
                            _          (when expect-script
                                         (u/poll {:thunk       #(deref message-observer)
                                                  :done?       #(some #{"script started"} %)
                                                  :interval-ms 1
                                                  :timeout-ms  5000}))
                            _          (when redefs (await-signal ready-signal))
                            _          (get-last-run transform-id)
                            _          (mt/user-http-request :crowberto :post 204 (format "ee/transform/%d/cancel" transform-id))
                            _          (deliver wait-signal true)
                            _          (await-signal finished-signal)
                            last-run   (get-last-run transform-id)]
                        {:messages     @message-observer
                         :last-run     last-run})))))))]

    (let [blocking-script
          ["import time"
           "import pandas as pd"
           "def transform(transforms_customers):"
           "  print(\"script started\")"
           ;; longer sleep gives more room for slow CI when checking for 'how quickly should a trivial run complete'
           ;; this is important for figuring out whether new runs can happen after a cancelled job that might have blocked the runner
           ;; N.B. if cancellation works, we do not pay the timeout during the test, the test does not always wait 30 seconds!
           "  time.sleep(30)"
           "  return pd.DataFrame({'x': [42]})"]

          non-blocking-script
          ["import pandas as pd"
           "def transform(transforms_customers):"
           "  print(\"script started\")"
           "  return pd.DataFrame({'x': [42]})"]

          scenarios
          [{:desc          "during python eval"
            :program       blocking-script
            :expect-script true
            :expect-write  false
            :expect-status :canceled}
           {:desc          "during table read"
            :program       non-blocking-script
            :block         :read
            :expect-script false
            :expect-write  false
            :expect-status :canceled}
           {:desc          "during table write"
            :program       non-blocking-script
            :block         :write,
            :expect-script true
            :expect-write  true                             ; note: the cancellation signal is currently ignored during the write phase
            :expect-status :canceled}]]

      (doseq [{:keys [desc expect-status expect-script expect-write] :as scenario} scenarios]
        (mt/test-drivers (-> (mt/normal-drivers-with-feature :transforms/python)
                             ; these drivers cause timing issues, could be fixed if we change timeout / time variables in test
                             (disj :snowflake :bigquery-cloud-sdk :redshift :mongo))
          (mt/with-premium-features #{:transforms :transforms-python}
            (mt/dataset transforms-dataset/transforms-test
              (let [schema (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))]
                (with-redefs [transforms-python.execute/python-message-loop-sleep-duration (Duration/ofMillis fast-log-polling-ms)]
                  (with-transform-cleanup! [target {:type   "table"
                                                    :schema schema
                                                    :name   "result"}]
                    (testing desc
                      (testing "initial cancellation"
                        (let [scenario-result (run-scenario scenario target)
                              {:keys [messages last-run]} scenario-result]
                          (is (= (name expect-status) (:status last-run)))

                          (when (some? expect-script)
                            (if expect-script
                              (testing "script should have started"
                                (is (some #(str/includes? % "script started") messages)))
                              (testing "script should not have started"
                                (is (not-any? #(str/includes? % "script started") messages))
                                (is (not (str/includes? (str (:message last-run)) "script started"))))))

                          (when (some? expect-write)
                            (testing "table existence"
                              (is (= expect-write (driver/table-exists? driver/*driver* (mt/db) target)))))))))

                  ; todo We have not yet covered the case where we rerun the same transform while there might be some hangover.
                  ;      Cancellation addresses the transform and not the run, there is shared mutable state and races on it are possible
                  (testing "the runner is not blocked for a new run"
                    (with-transform-cleanup! [target {:type   "table"
                                                      :schema schema
                                                      :name   "result"}]
                      (let [{transform-id :id} (create-transform {:desc "normal run", :program non-blocking-script} target)
                            _          (transforms.tu/test-run transform-id)
                            {:keys [status start_time end_time]} (get-last-run transform-id)
                            start-inst (some-> start_time Instant/parse)
                            end-inst   (some-> end_time Instant/parse)
                            duration   (when (and start-inst end-inst) (Duration/between start-inst end-inst))]
                        (is (= "succeeded" status))
                        (when duration
                          ;; 10 seconds is an estimate of the maximum time we should expect the normal run to take.
                          ;; if the runner was blocked for 30 seconds, and only then did the new run get scheduled - we would exceed this time.
                          (is (< (.toSeconds duration) 10)))))))))))))))

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
                                       :source {:type            "python"
                                                :source-database (mt/id)
                                                :source-tables   {:test (t2/select-one-pk :model/Table :db_id (mt/id))}
                                                :body            (str "import pandas as pd\n"
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
                                               :source {:type            "python"
                                                        :source-database (mt/id)
                                                        :source-tables   {:test (t2/select-one-pk :model/Table :db_id (mt/id))}
                                                        :body            (str "import pandas as pd\n"
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

(deftest create-python-transform-with-table-ref-source-test
  (testing "Creating a Python transform with name-based source table refs is allowed"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/with-premium-features #{:transforms :transforms-python}
        (mt/dataset transforms-dataset/transforms-test
          (with-transform-cleanup! [target {:type   "table"
                                            :schema (get-test-schema)
                                            :name   "table_ref_test"}]
            (let [;; Use a name-based ref instead of table ID
                  source-tables {"input" {:database_id (mt/id)
                                          :schema      (get-test-schema)
                                          :table       "transforms_products"}}
                  transform-payload {:name   "Transform with table ref"
                                     :source {:type            "python"
                                              :body            "def transform(input):\n    return input"
                                              :source-database (mt/id)
                                              :source-tables   source-tables}
                                     :target (assoc target :database (mt/id))}
                  response (mt/user-http-request :crowberto :post 200 "ee/transform" transform-payload)]
              (testing "Transform is created successfully"
                (is (integer? (:id response)))
                (is (= "python" (:source_type response))))

              ;; currently not allowed and used on UI so we're still converting this back to integer
              #_(testing "Source tables are preserved in response"
                  (is (map? (get-in response [:source :source-tables :input])))
                  (is (= "transforms_products"
                         (get-in response [:source :source-tables :input :table])))))))))))

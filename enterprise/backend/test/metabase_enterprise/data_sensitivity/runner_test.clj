(ns metabase-enterprise.data-sensitivity.runner-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.data-sensitivity.core :as core]
   [metabase-enterprise.data-sensitivity.core-test :as core-test]
   [metabase-enterprise.data-sensitivity.runner :as runner]
   [metabase.api.common :as api]
   [metabase.metabot.scope :as scope]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime)
   (java.util.concurrent CountDownLatch TimeUnit)))

(set! *warn-on-reflection* true)

(defn- do-with-temp-tables
  "Run `(f db tables)` with a temp database of `n` active tables of one text field each, in name order."
  [n f]
  (mt/with-temp [:model/Database db {}]
    (let [tables (mapv (fn [i]
                         (let [table (t2/insert-returning-instance! :model/Table {:db_id  (:id db) :schema "S"
                                                                                  :name   (format "ds_%02d" i)
                                                                                  :active true})]
                           (t2/insert! :model/Field {:table_id (:id table) :name (format "ds_%02d_field" i)
                                                     :base_type :type/Text :database_type "TEXT"})
                           table))
                       (range n))]
      (f db tables))))

(defn- run-row [run-id]
  (t2/select-one :model/MetadataGenerationRun :id run-id))

(defn- wait-for-run
  "Poll the run until `pred` holds, for at most 10 s."
  [run-id pred]
  (loop [n 0]
    (let [run (run-row run-id)]
      (cond
        (pred run) run
        (> n 200)  (throw (ex-info "Timed out waiting for the run" {:run run}))
        :else      (do (Thread/sleep 50) (recur (inc n)))))))

(defn- wait-ended [run-id]
  (wait-for-run run-id #(nil? (:is_active %))))

(defn- suggestions [run-id]
  (t2/select :model/MetadataGenerationSuggestion :run_id run-id {:order-by [[:id :asc]]}))

(defn- table-name-in-message [messages]
  (second (re-find #"(?m)^name: (\S+)$" (:content (last messages)))))

(defn- start! [db request]
  (runner/start-run! db request (mt/user->id :crowberto)))

(deftest start-progress-succeed-test
  (testing "a run classifies every table, records progress and usage, and writes suggestions instead of metadata"
    (do-with-temp-tables
     3
     (fn [db tables]
       (core-test/do-with-llm!
        (core-test/canned-llm (constantly {:data_sensitivity "PII" :semantic_type "type/Name" :confidence "medium"}))
        (fn []
          (let [run (start! db {})]
            (is (= {:status :pending :total_tables 3 :scope {:type :database}
                    :attributes [:data_sensitivity :semantic_type]}
                   (select-keys run [:status :total_tables :scope :attributes])))
            (let [ended (wait-ended (:id run))]
              (is (=? {:status        :succeeded
                       :done_tables   3
                       :failed_tables 0
                       :table_errors  []
                       :started_at    some?
                       :ended_at      some?
                       :usage         {:input_tokens 300 :output_tokens 60 :total_tokens 360}}
                      ended)))
            (is (= (set (for [table tables
                              [attribute proposed] [[:data_sensitivity "PII"] [:semantic_type "type/Name"]]]
                          {:table_id       (:id table)
                           :attribute      attribute
                           :source         :none
                           :current_value  nil
                           :proposed_value proposed
                           :confidence     :medium
                           :status         :pending}))
                   (set (map #(select-keys % [:table_id :attribute :source :current_value :proposed_value
                                              :confidence :status])
                             (suggestions (:id run))))))
            (is (every? (fn [table]
                          (= [[nil nil]] (t2/select-fn-vec (juxt :data_sensitivity :semantic_type)
                                                           :model/Field :table_id (:id table))))
                        tables)
                "a run writes no field metadata"))))))))

(deftest suggestion-source-and-attributes-test
  (mt/with-temp [:model/Database db    {}
                 :model/Table    table {:db_id (:id db) :name "ds_sources" :active true}
                 :model/Field    _     {:table_id (:id table) :name "ds_agree" :base_type :type/Text
                                        :data_sensitivity :PII}
                 :model/Field    _     {:table_id (:id table) :name "ds_disagree" :base_type :type/Text
                                        :data_sensitivity :PUBLIC :semantic_type :type/Name}
                 :model/Field    _     {:table_id (:id table) :name "ds_abstain" :base_type :type/Text}]
    (let [entries {"ds_agree"    {:data_sensitivity "PII" :semantic_type "type/Email"}
                   "ds_disagree" {:data_sensitivity "PII" :semantic_type "type/Email"}
                   "ds_abstain"  {:data_sensitivity "UNSURE"}}]
      (core-test/do-with-llm!
       (core-test/canned-llm entries)
       (fn []
         (testing "agreeing and abstaining labels make no suggestion; the current value and its layer are recorded"
           (let [run (start! db {:attributes [:data_sensitivity :semantic_type]})]
             (wait-ended (:id run))
             (is (= #{["ds_disagree" :data_sensitivity :deterministic "PUBLIC" "PII"]
                      ["ds_agree" :semantic_type :none nil "type/Email"]
                      ["ds_disagree" :semantic_type :deterministic "type/Name" "type/Email"]}
                    (set (for [s (suggestions (:id run))]
                           [(t2/select-one-fn :name :model/Field :id (:field_id s))
                            (:attribute s) (:source s) (:current_value s) (:proposed_value s)]))))))
         (testing "a run writes only the requested attributes"
           (let [run (start! db {:attributes [:semantic_type]})]
             (wait-ended (:id run))
             (is (= #{:semantic_type} (set (map :attribute (suggestions (:id run))))))))
         (testing "descriptions are not supported yet"
           (is (thrown-with-msg? clojure.lang.ExceptionInfo #"not supported"
                                 (start! db {:attributes [:description]})))))))))

(deftest cancel-via-run-row-test
  (testing "a cancel written to the run row from elsewhere stops the run within one chunk call"
    (do-with-temp-tables
     4
     (fn [db tables]
       (let [calls   (atom [])
             started (CountDownLatch. 1)
             llm     (fn [& [_model messages :as args]]
                       (swap! calls conj (table-name-in-message messages))
                       (.countDown started)
                       (Thread/sleep 30000)
                       (apply (core-test/canned-llm (constantly {})) args))]
         (core-test/do-with-llm!
          llm
          (fn []
            (let [run (start! db {})]
              (is (.await started 10 TimeUnit/SECONDS))
              @(future (t2/update! :model/MetadataGenerationRun (:id run) {:status :canceling}))
              (let [timer (u/start-timer)
                    ended (wait-ended (:id run))]
                (is (< (u/since-ms timer) (* 3 runner/poll-ms))
                    "the run does not wait for the chunk call in flight")
                (is (=? {:status :canceled :done_tables 0 :failed_tables 0} ended))
                (is (= (mapv :id tables) (mapv :table_id (:table_errors ended))))
                (is (every? #(= "not_processed" (:error_code %)) (:table_errors ended))))
              (Thread/sleep 200)
              (is (= [(:name (first tables))] @calls) "no chunk call starts after the cancel")
              (is (empty? (suggestions (:id run))))))))))))

(deftest cancel-run-test
  (do-with-temp-tables
   2
   (fn [db _tables]
     (let [started (CountDownLatch. 1)
           llm     (fn [& args]
                     (.countDown started)
                     (Thread/sleep 30000)
                     (apply (core-test/canned-llm (constantly {})) args))]
       (core-test/do-with-llm!
        llm
        (fn []
          (let [run (start! db {})]
            (is (.await started 10 TimeUnit/SECONDS))
            (testing "a second start on the same database is refused while a run is active"
              (is (= 409 (:status-code (try (start! db {}) (catch clojure.lang.ExceptionInfo e (ex-data e)))))))
            (testing "cancel from another thread marks the run canceling, then canceled"
              (is (=? {:status :canceling :is_active true} @(future (runner/cancel-run! (:id run)))))
              (is (=? {:status :canceled} (wait-ended (:id run)))))
            (testing "canceling an ended run is a 409"
              (is (= 409 (:status-code (try (runner/cancel-run! (:id run))
                                            (catch clojure.lang.ExceptionInfo e (ex-data e))))))))))))))

(deftest table-error-recorded-and-run-continues-test
  (do-with-temp-tables
   3
   (fn [db tables]
     (core-test/do-with-llm!
      (fn [& [_model messages :as args]]
        (if (= "ds_01" (table-name-in-message messages))
          (throw (ex-info "Provider said no" {:error-code "provider_error"}))
          (apply (core-test/canned-llm (constantly {:data_sensitivity "PII"})) args)))
      (fn []
        (let [run   (start! db {:attributes [:data_sensitivity]})
              ended (wait-ended (:id run))]
          (is (=? {:status        :succeeded
                   :done_tables   2
                   :failed_tables 1
                   :table_errors  [{:table_id   (:id (second tables))
                                    :table_name "ds_01"
                                    :message    "Provider said no"
                                    :error_code "provider_error"}]}
                  ended))
          (is (= #{(:id (first tables)) (:id (nth tables 2))}
                 (set (map :table_id (suggestions (:id run))))))
          (testing "retry-failed starts a run over the failed tables"
            (let [retry (runner/retry-failed! db ended (mt/user->id :crowberto))]
              (is (=? {:scope {:type :tables :table_ids [(:id (second tables))]} :attributes [:data_sensitivity]}
                      retry))
              (wait-ended (:id retry))))))))))

(deftest usage-limit-stop-test
  (testing "a usage limit ends the run with status usage_limit and leaves the remaining tables unprocessed"
    (do-with-temp-tables
     4
     (fn [db tables]
       (let [calls (atom [])]
         (core-test/do-with-llm!
          (fn [& [_model messages :as args]]
            (let [table-name (table-name-in-message messages)]
              (swap! calls conj table-name)
              (if (= "ds_01" table-name)
                (throw (ex-info "You have reached your AI usage limit."
                                {:type    :metabot/usage-limit-reached
                                 :message "You have reached your AI usage limit."}))
                (apply (core-test/canned-llm (constantly {})) args))))
          (fn []
            (let [run   (start! db {})
                  ended (wait-ended (:id run))]
              (is (=? {:status        :usage_limit
                       :message       "You have reached your AI usage limit."
                       :done_tables   1
                       :failed_tables 0}
                      ended))
              (is (= (mapv :id (rest tables)) (mapv :table_id (:table_errors ended))))
              (is (every? #(= "not_processed" (:error_code %)) (:table_errors ended)))
              (is (= ["ds_00" "ds_01"] @calls) "no table after the limit is sent")))))))))

(deftest reaper-test
  (mt/with-temp [:model/Database db1 {}
                 :model/Database db2 {}]
    (let [stale-at (.minusMinutes (OffsetDateTime/now) 10)
          stale    (t2/insert-returning-instance! :model/MetadataGenerationRun
                                                  {:database_id (:id db1) :scope {:type :database}
                                                   :attributes [:data_sensitivity] :status :running
                                                   :last_heartbeat stale-at})
          fresh    (t2/insert-returning-instance! :model/MetadataGenerationRun
                                                  {:database_id (:id db2) :scope {:type :database}
                                                   :attributes [:data_sensitivity] :status :running
                                                   :last_heartbeat (OffsetDateTime/now)})]
      (testing "a run with a stale heartbeat becomes failed with a reason"
        (is (= [(:id stale)] (mapv :id (runner/reap-orphaned-runs! runner/heartbeat-stale-minutes))))
        (is (=? {:status    :failed
                 :is_active nil
                 :ended_at  some?
                 :message   #".*heartbeats.*"}
                (run-row (:id stale)))))
      (testing "a run with a fresh heartbeat is left alone"
        (is (=? {:status :running :is_active true} (run-row (:id fresh))))))))

(deftest heartbeat-tick-test
  (testing "the node heartbeat stamps the runs this node executes"
    (do-with-temp-tables
     1
     (fn [db _tables]
       (let [started (CountDownLatch. 1)]
         (core-test/do-with-llm!
          (fn [& args]
            (.countDown started)
            (Thread/sleep 30000)
            (apply (core-test/canned-llm (constantly {})) args))
          (fn []
            (let [run (start! db {})]
              (is (.await started 10 TimeUnit/SECONDS))
              (t2/update! :model/MetadataGenerationRun (:id run) {:last_heartbeat (.minusMinutes (OffsetDateTime/now) 10)})
              (runner/heartbeat-tick!)
              (is (empty? (runner/reap-orphaned-runs! runner/heartbeat-stale-minutes)))
              (runner/cancel-run! (:id run))
              (is (=? {:status :canceled} (wait-ended (:id run))))))))))))

(deftest pool-thread-bindings-test
  (testing "chunk calls run as the user who started the run, with all Metabot permissions granted"
    (do-with-temp-tables
     2
     (fn [db _tables]
       (let [seen (atom [])]
         (core-test/do-with-llm!
          (fn [& args]
            (swap! seen conj [api/*current-user-id* scope/*current-user-metabot-permissions*])
            (apply (core-test/canned-llm (constantly {})) args))
          (fn []
            (mt/with-current-user (mt/user->id :rasta)
              (let [run (runner/start-run! db {} (mt/user->id :crowberto))]
                (is (=? {:status :succeeded :creator_id (mt/user->id :crowberto)} (wait-ended (:id run))))))
            (is (= 2 (count @seen)))
            (is (every? #{[(mt/user->id :crowberto) scope/all-yes-permissions]} @seen)))))))))

(deftest sensitivity-only-prompt-parity-test
  (testing "a sensitivity-only run sends the same messages as the synchronous classifier"
    (let [table    (t2/select-one :model/Table :id (mt/id :people))
          messages (atom [])
          llm      (fn [& [_model msgs :as args]]
                     (swap! messages conj (mapv :content msgs))
                     (apply (core-test/canned-llm (constantly {})) args))
          capture  (fn [thunk]
                     (reset! messages [])
                     (core-test/do-with-llm! llm thunk)
                     (sort-by str @messages))
          classic  (capture #(core/classify-table! table))
          run-id   (atom nil)
          run      (capture (fn []
                              (let [run (runner/start-run! (mt/db) {:table_ids [(:id table)] :attributes [:data_sensitivity]}
                                                           (mt/user->id :crowberto))]
                                (reset! run-id (:id run))
                                (wait-ended (:id run)))))]
      (try
        (is (seq classic))
        (is (str/includes? (second (first classic)) "values:") "the packet carries sampled values")
        (is (= classic run))
        (finally
          (t2/delete! :model/MetadataGenerationRun :id @run-id))))))

(ns metabase-enterprise.data-sensitivity.runner-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.data-sensitivity.context :as context]
   [metabase-enterprise.data-sensitivity.core :as core]
   [metabase-enterprise.data-sensitivity.core-test :as core-test]
   [metabase-enterprise.data-sensitivity.db :as ds.db]
   [metabase-enterprise.data-sensitivity.llm :as llm]
   [metabase-enterprise.data-sensitivity.runner :as runner]
   [metabase.api.common :as api]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.self.core :as metabot.self.core]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]
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

(defn- suggestions
  "The proposals that run `run-id` wrote last."
  [run-id]
  (t2/select :model/MetadataGenerationProposal :last_run_id run-id {:order-by [[:id :asc]]}))

(defn- table-name-in-message [messages]
  (second (re-find #"(?m)^name: (\S+)$" (:content (last messages)))))

(defn- start! [db request]
  (runner/start-run! db request (mt/user->id :crowberto)))

(deftest start-progress-succeed-test
  (testing "a run classifies every table, records progress and usage, and writes proposals instead of metadata"
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
                       :usage         {:input_tokens 300 :output_tokens 60 :total_tokens 360 :cost_usd nil}}
                      ended)))
            (is (= (set (for [table tables
                              [attribute proposed] [[:data_sensitivity "PII"] [:semantic_type "type/Name"]]]
                          {:table_id       (:id table)
                           :attribute      attribute
                           :proposed_value proposed
                           :confidence     :medium
                           :status         :pending}))
                   (set (map #(select-keys % [:table_id :attribute :proposed_value :confidence :status])
                             (suggestions (:id run))))))
            (is (every? (fn [table]
                          (= [[nil nil]] (t2/select-fn-vec (juxt :data_sensitivity :semantic_type)
                                                           :model/Field :table_id (:id table))))
                        tables)
                "a run writes no field metadata"))))))))

(deftest run-cost-test
  (testing "a run on a priced model records the USD cost of its token usage"
    (do-with-temp-tables
     3
     (fn [db _tables]
       (core-test/do-with-llm!
        (core-test/canned-llm (constantly {:data_sensitivity "PII"}))
        (fn []
          (mt/with-dynamic-fn-redefs [metabot.settings/llm-mini-model (constantly "anthropic/claude-haiku-4-5")]
            ;; Per table: 95 uncached input at $1, 5 cache-read at $0.10 and 20 output at $5 per million tokens.
            (is (=? {:status :succeeded
                     :usage  {:total_tokens 360
                              :cost_usd     #(< (abs (- % (* 3 195.5e-6))) 1e-12)}}
                    (wait-ended (:id (start! db {}))))))))))))

(deftest semantic-type-suggestion-rules-test
  (mt/with-temp [:model/Database db    {}
                 :model/Table    table {:db_id (:id db) :name "ds_semantic_rules" :active true}
                 :model/Field    _     {:table_id (:id table) :name "ds_count" :base_type :type/Integer}
                 :model/Field    _     {:table_id (:id table) :name "ds_email" :base_type :type/Text}
                 :model/Field    _     {:table_id (:id table) :name "ds_id" :base_type :type/Integer
                                        :semantic_type :type/PK}]
    (core-test/do-with-llm!
     (core-test/canned-llm {"ds_count" {:data_sensitivity "PUBLIC" :semantic_type "type/Email"}
                            "ds_email" {:data_sensitivity "PII" :semantic_type "type/Email"}
                            "ds_id"    {:data_sensitivity "PUBLIC" :semantic_type "type/Category"}})
     (fn []
       (testing "a semantic type that does not fit the field's type, or would replace a key type, makes no proposal"
         (let [run (start! db {:attributes [:semantic_type]})]
           (wait-ended (:id run))
           (is (= [["ds_email" "type/Email"]]
                  (for [s (suggestions (:id run))]
                    [(t2/select-one-fn :name :model/Field :id (:field_id s)) (:proposed_value s)])))))
       (testing "a run without the semantic_type attribute makes no semantic_type proposal"
         (let [run (start! db {:attributes [:data_sensitivity]})]
           (wait-ended (:id run))
           (is (= #{:data_sensitivity} (set (map :attribute (suggestions (:id run))))))))))))

(deftest proposal-attributes-test
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
         (testing "agreeing and abstaining labels make no proposal"
           (let [run (start! db {:attributes [:data_sensitivity :semantic_type]})]
             (wait-ended (:id run))
             (is (= #{["ds_disagree" :data_sensitivity "PII"]
                      ["ds_agree" :semantic_type "type/Email"]
                      ["ds_disagree" :semantic_type "type/Email"]}
                    (set (for [s (suggestions (:id run))]
                           [(t2/select-one-fn :name :model/Field :id (:field_id s))
                            (:attribute s) (:proposed_value s)]))))))
         (testing "a run writes only the requested attributes"
           (let [run (start! db {:attributes [:semantic_type]})]
             (wait-ended (:id run))
             (is (= #{:semantic_type} (set (map :attribute (suggestions (:id run))))))))
         (testing "an attribute outside the run attributes is refused"
           (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid input"
                                 (start! db {:attributes [:display_name]})))))))))

(deftest description-proposal-test
  (mt/with-temp [:model/Database db    {}
                 :model/Table    table {:db_id (:id db) :name "ds_descriptions" :active true}
                 :model/Field    _     {:table_id (:id table) :name "ds_none" :base_type :type/Text}
                 :model/Field    _     {:table_id (:id table) :name "ds_comment" :base_type :type/Text
                                        :description "old comment"}
                 :model/Field    _     {:table_id (:id table) :name "ds_same" :base_type :type/Text
                                        :description "Same text"}
                 :model/Field    human {:table_id (:id table) :name "ds_human" :base_type :type/Text}
                 :model/Field    clear {:table_id (:id table) :name "ds_cleared" :base_type :type/Text
                                        :description "comment a person cleared"}]
    (field-user-settings/upsert-user-settings human {:description "Written by a person"})
    (field-user-settings/upsert-user-settings clear {:description nil})
    (let [messages (atom [])
          llm      (fn [& [_model msgs :as args]]
                     (swap! messages conj msgs)
                     (apply (core-test/canned-llm
                             {"ds_none"    {:description "Customer email address."}
                              "ds_comment" {:description "Shipping note."}
                              "ds_same"    {:description "Same text"}
                              "ds_human"   {:description "Another text."}
                              "ds_cleared" {:description "Another text."}})
                            args))]
      (core-test/do-with-llm!
       llm
       (fn []
         (let [run (start! db {:attributes [:description]})]
           (is (=? {:status :succeeded :attributes [:description]} (wait-ended (:id run))))
           (testing "a description is proposed only where it is new or differs, never over a human-set one"
             (is (= #{["ds_none" :description "Customer email address."]
                      ["ds_comment" :description "Shipping note."]}
                    (set (for [s (suggestions (:id run))]
                           [(t2/select-one-fn :name :model/Field :id (:field_id s))
                            (:attribute s) (:proposed_value s)])))))
           (testing "the call asks only for descriptions and shows the cleared description as human-set"
             (let [[system user] (map :content (first @messages))]
               (is (= (llm/system-prompt-for #{:description}) system))
               (is (str/includes? user "- ds_cleared (type/Text, VARCHAR; description: none [human-set])"))
               (is (str/includes? user "- ds_human (type/Text, VARCHAR; description: \"Written by a person\" [human-set])"))))))))))

(defn- table-proposals
  "The proposals of `table-id` as a map of [field name, attribute] to [proposed value, status, last run id]."
  [table-id]
  (into {}
        (map (fn [p]
               [[(t2/select-one-fn :name :model/Field :id (:field_id p)) (:attribute p)]
                [(:proposed_value p) (:status p) (:last_run_id p)]]))
        (t2/select :model/MetadataGenerationProposal :table_id table-id)))

(deftest runs-upsert-proposals-test
  (mt/with-temp [:model/Database db    {}
                 :model/Table    table {:db_id (:id db) :name "ds_upsert" :active true}
                 :model/Field    _     {:table_id (:id table) :name "ds_a" :base_type :type/Text}
                 :model/Field    b     {:table_id (:id table) :name "ds_b" :base_type :type/Text}
                 :model/Field    _     {:table_id (:id table) :name "ds_c" :base_type :type/Text
                                        :data_sensitivity :PUBLIC}
                 :model/Field    _     {:table_id (:id table) :name "ds_d" :base_type :type/Text}]
    (let [entries (atom {"ds_a" {:data_sensitivity "PII"}
                         "ds_b" {:data_sensitivity "PII"}
                         "ds_c" {:data_sensitivity "PII"}
                         "ds_d" {:data_sensitivity "PII"}})]
      (core-test/do-with-llm!
       (fn [& args] (apply (core-test/canned-llm @entries) args))
       (fn []
         (let [run-1 (:id (start! db {:attributes [:data_sensitivity]}))]
           (wait-ended run-1)
           (is (= {["ds_a" :data_sensitivity] ["PII" :pending run-1]
                   ["ds_b" :data_sensitivity] ["PII" :pending run-1]
                   ["ds_c" :data_sensitivity] ["PII" :pending run-1]
                   ["ds_d" :data_sensitivity] ["PII" :pending run-1]}
                  (table-proposals (:id table))))
           (t2/update! :model/MetadataGenerationProposal {:field_id (:id b)}
                       {:status :rejected :decided_by (mt/user->id :crowberto) :decided_at :%now})
           (reset! entries {"ds_a" {:data_sensitivity "PHI"}
                            "ds_b" {:data_sensitivity "PHI"}
                            "ds_c" {:data_sensitivity "PUBLIC"}
                            "ds_d" {:data_sensitivity "UNSURE"}})
           (let [run-2 (:id (start! db {:attributes [:data_sensitivity]}))]
             (wait-ended run-2)
             (testing "a second run replaces pending and rejected proposals, and deletes those it no longer makes"
               (is (= {["ds_a" :data_sensitivity] ["PHI" :pending run-2]
                       ["ds_b" :data_sensitivity] ["PHI" :pending run-2]}
                      (table-proposals (:id table)))))
             (testing "a replaced rejection loses its decision"
               (is (=? {:decided_by nil :decided_at nil}
                       (t2/select-one :model/MetadataGenerationProposal :field_id (:id b))))))
           (testing "a run of other attributes leaves the proposals of the run's attributes alone"
             (reset! entries {"ds_a" {:data_sensitivity "PII" :semantic_type "type/Email"}})
             (let [run-3 (:id (start! db {:attributes [:semantic_type]}))]
               (wait-ended run-3)
               (is (=? {["ds_a" :data_sensitivity] ["PHI" :pending some?]
                        ["ds_b" :data_sensitivity] ["PHI" :pending some?]
                        ["ds_a" :semantic_type]    ["type/Email" :pending run-3]}
                       (table-proposals (:id table))))))))))))

(deftest record-table-keeps-proposal-of-concurrently-applied-row-test
  (testing "a run records its proposal for a field whose old proposal row an apply deletes during the upsert"
    (mt/with-temp [:model/Database                db    {}
                   :model/Table                   table {:db_id (:id db) :name "ds_race" :active true}
                   :model/Field                   field {:table_id (:id table) :name "ds_a" :base_type :type/Text}
                   :model/MetadataGenerationRun   run   {:database_id (:id db) :scope {:type :database}
                                                         :attributes [:description] :total_tables 1
                                                         :status :running}
                   :model/MetadataGenerationProposal old {:table_id (:id table) :field_id (:id field)
                                                          :attribute :description :proposed_value "old"
                                                          :status :pending}]
      (let [select (mt/original-fn #'t2/select)]
        (mt/with-dynamic-fn-redefs [t2/select (fn [model & args]
                                                (let [result (apply select model args)]
                                                  (when (= [:model/MetadataGenerationProposal :id :field_id :attribute]
                                                           model)
                                                    (t2/delete! :model/MetadataGenerationProposal :id (:id old)))
                                                  result))]
          (is (true? (ds.db/record-table! (:id run) {:done_tables 1}
                                          {:table_id   (:id table)
                                           :attributes #{:description}
                                           :proposals  [{:last_run_id    (:id run)
                                                         :table_id       (:id table)
                                                         :field_id       (:id field)
                                                         :attribute      :description
                                                         :proposed_value "new"
                                                         :confidence     :high
                                                         :reasoning      "r"}]})))))
      (is (= {["ds_a" :description] ["new" :pending (:id run)]}
             (table-proposals (:id table)))))))

(deftest table-scoped-run-keeps-other-tables-test
  (do-with-temp-tables
   2
   (fn [db [table-1 table-2]]
     (let [label (atom "PII")]
       (core-test/do-with-llm!
        (fn [& args] (apply (core-test/canned-llm (constantly {:data_sensitivity @label})) args))
        (fn []
          (let [run-1 (:id (start! db {:attributes [:data_sensitivity]}))]
            (wait-ended run-1)
            (reset! label "PHI")
            (let [run-2 (:id (start! db {:attributes [:data_sensitivity] :table_ids [(:id table-1)]}))]
              (wait-ended run-2)
              (testing "the run replaces the proposals of its table"
                (is (= {["ds_00_field" :data_sensitivity] ["PHI" :pending run-2]}
                       (table-proposals (:id table-1)))))
              (testing "the proposals of other tables do not change"
                (is (= {["ds_01_field" :data_sensitivity] ["PII" :pending run-1]}
                       (table-proposals (:id table-2)))))))))))))

(deftest failed-table-keeps-proposals-test
  (do-with-temp-tables
   1
   (fn [db [table]]
     (let [fail? (atom false)]
       (core-test/do-with-llm!
        (fn [& args]
          (if @fail?
            (throw (ex-info "provider down" {}))
            (apply (core-test/canned-llm (constantly {:data_sensitivity "PII"})) args)))
        (fn []
          (let [run-1 (:id (start! db {:attributes [:data_sensitivity]}))]
            (wait-ended run-1)
            (reset! fail? true)
            (is (=? {:failed_tables 1} (wait-ended (:id (start! db {:attributes [:data_sensitivity]})))))
            (testing "a table that fails keeps its proposals"
              (is (= {["ds_00_field" :data_sensitivity] ["PII" :pending run-1]}
                     (table-proposals (:id table))))))))))))

(deftest cancel-via-run-row-test
  (testing "a cancel written to the run row from elsewhere stops the run without waiting for the chunk call in flight"
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

(deftest retry-failed-skips-inactive-tables-test
  (do-with-temp-tables
   3
   (fn [db tables]
     (core-test/do-with-llm!
      (fn [& [_model messages :as args]]
        (if (#{"ds_01" "ds_02"} (table-name-in-message messages))
          (throw (ex-info "Provider said no" {:error-code "provider_error"}))
          (apply (core-test/canned-llm (constantly {:data_sensitivity "PII"})) args)))
      (fn []
        (let [ended (wait-ended (:id (start! db {:attributes [:data_sensitivity]})))]
          (t2/update! :model/Table (:id (nth tables 2)) {:active false})
          (testing "retry-failed starts a run over the failed tables that are still active"
            (let [retry (runner/retry-failed! db ended (mt/user->id :crowberto))]
              (is (=? {:scope {:type :tables :table_ids [(:id (second tables))]}} retry))
              (wait-ended (:id retry))))
          (t2/update! :model/Table (:id (second tables)) {:active false})
          (testing "retry-failed is a 400 when no failed table is still active"
            (is (= 400 (:status-code (try (runner/retry-failed! db ended (mt/user->id :crowberto))
                                          (catch clojure.lang.ExceptionInfo e (ex-data e)))))))))))))

(deftest failed-table-usage-test
  (testing "the usage of the chunks that finished in a table that failed counts in the run's usage"
    (mt/with-temp [:model/Database db    {}
                   :model/Table    table {:db_id (:id db) :name "ds_chunks" :active true}
                   :model/Field    _     {:table_id (:id table) :name "ds_ok" :base_type :type/Text}
                   :model/Field    _     {:table_id (:id table) :name "ds_fail" :base_type :type/Text}]
      (core-test/do-with-llm!
       (fn [& [_model messages :as args]]
         (if (re-find #"(?m)^- ds_fail \(" (:content (last messages)))
           (throw (ex-info "Provider said no" {:error-code "provider_error"}))
           (apply (core-test/canned-llm (constantly {:data_sensitivity "PII"})) args)))
       (fn []
         (mt/with-dynamic-fn-redefs [llm/chunk-size-for (constantly 1)]
           (is (=? {:status        :succeeded
                    :done_tables   0
                    :failed_tables 1
                    :usage         {:input_tokens 100 :output_tokens 20 :total_tokens 120}}
                   (wait-ended (:id (start! db {:attributes [:data_sensitivity]})))))))))))

(deftest call-timeout-test
  (testing "a chunk call that runs past the call timeout fails its table, and the run goes on to the next table"
    (do-with-temp-tables
     2
     (fn [db tables]
       (let [blocked? (atom true)]
         (core-test/do-with-llm!
          (fn [& [_model messages :as args]]
            (when (and (= "ds_00" (table-name-in-message messages)) @blocked?)
              (Thread/sleep 30000))
            (apply (core-test/canned-llm (constantly {:data_sensitivity "PII"})) args))
          (fn []
            (mt/with-dynamic-fn-redefs [runner/call-timeout-ms (constantly 200)]
              (let [timer (u/start-timer)
                    run   (start! db {:attributes [:data_sensitivity]})
                    ended (wait-ended (:id run))]
                (is (< (u/since-ms timer) 10000) "the run does not wait for the blocked call")
                (is (=? {:status        :succeeded
                         :done_tables   1
                         :failed_tables 1
                         :table_errors  [{:table_id   (:id (first tables))
                                          :error_code "llm_call_timeout"
                                          :elapsed_ms #(>= % 200)}]
                         :usage         {:max_table_ms #(>= % 200)}}
                        ended))
                (is (= [(:id (second tables))] (distinct (map :table_id (suggestions (:id run))))))
                (testing "retry-failed classifies the timed-out table when the provider answers"
                  (reset! blocked? false)
                  (let [retry (wait-ended (:id (runner/retry-failed! db ended (mt/user->id :crowberto))))]
                    (is (=? {:status :succeeded :done_tables 1 :failed_tables 0} retry))
                    (is (= [(:id (first tables))] (distinct (map :table_id (suggestions (:id retry)))))))))))))))))

(deftest slow-calls-test
  (testing "the run's usage counts the chunk calls slower than slow-call-ms and records the slowest table time"
    (do-with-temp-tables
     2
     (fn [db _tables]
       (core-test/do-with-llm!
        (fn [& [_model messages :as args]]
          (when (= "ds_01" (table-name-in-message messages))
            (Thread/sleep 300))
          (apply (core-test/canned-llm (constantly {:data_sensitivity "PII"})) args))
        (fn []
          (mt/with-dynamic-fn-redefs [runner/slow-call-ms (constantly 150)]
            (is (=? {:status :succeeded
                     :usage  {:slow_calls 1 :max_table_ms #(>= % 300)}}
                    (wait-ended (:id (start! db {:attributes [:data_sensitivity]}))))))))))))

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

(deftest default-attributes-prompt-parity-test
  (testing "a run with the default attributes sends the same messages as the synchronous classifier"
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
                              (let [run (runner/start-run! (mt/db) {:table_ids [(:id table)]}
                                                           (mt/user->id :crowberto))]
                                (reset! run-id (:id run))
                                (wait-ended (:id run)))))]
      (try
        (is (seq classic))
        (is (str/includes? (second (first classic)) "values:") "the packet carries sampled values")
        (is (= classic run))
        (finally
          (t2/delete! :model/MetadataGenerationRun :id @run-id))))))

(deftest sensitivity-only-prompt-test
  (testing "a sensitivity-only run sends the same data with a smaller system prompt"
    (let [table    (t2/select-one :model/Table :id (mt/id :people))
          calls    (atom [])
          llm      (fn [& [_model msgs schema :as args]]
                     (swap! calls conj {:messages (mapv :content msgs) :schema schema})
                     (apply (core-test/canned-llm (constantly {})) args))
          run-ids  (atom [])
          capture  (fn [attributes]
                     (reset! calls [])
                     (core-test/do-with-llm!
                      llm
                      (fn []
                        (let [run (start! (mt/db) {:table_ids [(:id table)] :attributes attributes})]
                          (swap! run-ids conj (:id run))
                          (wait-ended (:id run)))))
                     @calls)]
      (try
        (let [default (capture [:data_sensitivity :semantic_type])
              only    (capture [:data_sensitivity])]
          (is (= (map (comp second :messages) default) (map (comp second :messages) only)))
          (is (every? #(= (llm/system-prompt-for #{:data_sensitivity}) (first (:messages %))) only))
          (is (every? #(= (llm/response-schema-for #{:data_sensitivity}) (:schema %)) only))
          (is (< (count (first (:messages (first only)))) (count (first (:messages (first default)))))))
        (finally
          (t2/delete! :model/MetadataGenerationRun :id [:in @run-ids]))))))

(defn- poll-run
  "Poll the run until `pred` holds or `ms` milliseconds pass. Returns the last row read."
  [run-id pred ms]
  (let [timer (u/start-timer)]
    (loop []
      (let [run (run-row run-id)]
        (if (or (pred run) (> (u/since-ms timer) ms))
          run
          (do (Thread/sleep 50) (recur)))))))

(defn- block-ignoring-interrupts!
  "Block until `release` or `aborted` is realized, ignoring interrupts, as a blocking socket read does."
  [release aborted]
  (while (not (or (realized? release) (realized? aborted)))
    (try (Thread/sleep 20) (catch InterruptedException _ nil))))

(deftest hung-calls-do-not-hold-a-run-forever-test
  (testing "a run whose chunk calls all hang ends within a bound of the call timeout, also when the hung calls fill the chunk pool"
    (do-with-temp-tables
     (inc llm/pool-size)
     (fn [db _tables]
       (let [release (promise)
             calls   (atom 0)
             run-id  (atom nil)]
         (try
           (core-test/do-with-llm!
            (fn [& _args]
              (swap! calls inc)
              (let [aborted (promise)]
                (some-> metabot.self.core/*on-abortable-request* (apply [#(deliver aborted true)]))
                (block-ignoring-interrupts! release aborted))
              (throw (ex-info "aborted" {})))
            (fn []
              (mt/with-dynamic-fn-redefs [runner/call-timeout-ms (constantly 300)]
                (reset! run-id (:id (start! db {:attributes [:data_sensitivity]})))
                (let [bound (* 2 (inc llm/pool-size) (+ 300 runner/poll-ms))
                      ended (poll-run @run-id #(nil? (:is_active %)) bound)]
                  (is (=? {:is_active nil :failed_tables (inc llm/pool-size)} ended))
                  (is (= (inc llm/pool-size) @calls))))))
           (finally
             (deliver release true)
             (when-let [id @run-id]
               (u/ignore-exceptions (runner/cancel-run! id))
               (wait-ended id)))))))))

(defn- do-with-busy-workers!
  "Run `(f)` while every worker thread executes a run whose chunk call blocks, then release the blocked runs and wait
  for them to end."
  [f]
  (let [n       @#'runner/worker-pool-size
        release (promise)
        started (CountDownLatch. n)
        run-ids (atom [])]
    (letfn [(go [i]
              (if (< i n)
                (do-with-temp-tables
                 1
                 (fn [db _tables]
                   (swap! run-ids conj (:id (start! db {:attributes [:data_sensitivity]})))
                   (go (inc i))))
                (try
                  (is (.await started 10 TimeUnit/SECONDS))
                  (f)
                  (finally
                    (deliver release true)
                    (run! wait-ended @run-ids)))))]
      (core-test/do-with-llm!
       (fn [& args]
         (.countDown started)
         @release
         (apply (core-test/canned-llm (constantly {})) args))
       #(go 0)))))

(deftest cancel-pending-run-test
  (testing "a canceled pending run becomes canceled while every worker is busy, and its database can start a new run"
    (do-with-temp-tables
     1
     (fn [db _tables]
       (let [run-ids (atom [])]
         (try
           (do-with-busy-workers!
            (fn []
              (let [run (start! db {:attributes [:data_sensitivity]})]
                (swap! run-ids conj (:id run))
                (is (=? {:status :pending} (run-row (:id run))))
                (runner/cancel-run! (:id run))
                (is (=? {:status :canceled :is_active nil}
                        (poll-run (:id run) #(nil? (:is_active %)) (* 2 runner/poll-ms))))
                (let [next-run (try (start! db {:attributes [:data_sensitivity]})
                                    (catch clojure.lang.ExceptionInfo e (ex-data e)))]
                  (some->> (:id next-run) (swap! run-ids conj))
                  (is (=? {:status :pending} next-run))))))
           (finally
             (doseq [id @run-ids]
               (u/ignore-exceptions (runner/cancel-run! id))
               (wait-ended id)))))))))

(deftest queued-run-gone-leaves-local-runs-test
  (testing "a queued run that stops being active is removed from the node's local runs when the heartbeat cancels it"
    (do-with-temp-tables
     1
     (fn [db _tables]
       (let [run-id (atom nil)]
         (try
           (do-with-busy-workers!
            (fn []
              (reset! run-id (:id (start! db {:attributes [:data_sensitivity]})))
              (t2/update! :model/MetadataGenerationRun @run-id
                          {:last_heartbeat (.minusMinutes (OffsetDateTime/now) 10)})
              (is (= [@run-id] (mapv :id (runner/reap-orphaned-runs! runner/heartbeat-stale-minutes))))
              (runner/heartbeat-tick!)
              (is (=? {:status :failed :is_active nil} (run-row @run-id)))
              (is (not (contains? @@#'runner/local-runs @run-id)))))
           (finally
             (some->> @run-id (swap! @#'runner/local-runs dissoc)))))))))

(deftest cancel-after-last-table-test
  (testing "a cancel that arrives after the last table is recorded ends the run as canceled"
    (do-with-temp-tables
     2
     (fn [db _tables]
       (let [record-table! (mt/original-fn #'ds.db/record-table!)
             recorded      (atom 0)]
         (core-test/do-with-llm!
          (core-test/canned-llm (constantly {:data_sensitivity "PII"}))
          (fn []
            (mt/with-dynamic-fn-redefs [ds.db/record-table! (fn [run-id changes proposals]
                                                              (let [result (record-table! run-id changes proposals)]
                                                                (when (= 2 (swap! recorded inc))
                                                                  (runner/cancel-run! run-id))
                                                                result))]
              (let [ended (wait-ended (:id (start! db {:attributes [:data_sensitivity]})))]
                (is (= 2 @recorded))
                (is (=? {:status :canceled :done_tables 2} ended)))))))))))

(deftest cancel-interrupts-row-sample-test
  (testing "a cancel stops a run whose worker is building the row sample of a table"
    (do-with-temp-tables
     1
     (fn [db _tables]
       (let [started (CountDownLatch. 1)]
         (core-test/do-with-llm!
          (core-test/canned-llm (constantly {}))
          (fn []
            (mt/with-dynamic-fn-redefs [context/table-packet (fn [& _]
                                                               (.countDown started)
                                                               (Thread/sleep 30000))]
              (let [run (start! db {:attributes [:data_sensitivity]})]
                (is (.await started 10 TimeUnit/SECONDS))
                (runner/cancel-run! (:id run))
                (let [timer (u/start-timer)
                      ended (wait-ended (:id run))]
                  (is (< (u/since-ms timer) runner/poll-ms))
                  (is (=? {:status :canceled :done_tables 0} ended))))))))))))

(deftest retry-of-reaped-run-covers-unprocessed-tables-test
  (do-with-temp-tables
   4
   (fn [db [t0 t1 t2 t3]]
     (let [reaped-run (fn [table-errors]
                        (let [run (t2/insert-returning-instance!
                                   :model/MetadataGenerationRun
                                   {:database_id    (:id db) :scope {:type :database}
                                    :attributes     [:data_sensitivity] :status :running :total_tables 4
                                    :done_tables    1 :done_table_ids [(:id t0)]
                                    :failed_tables  (count table-errors) :table_errors table-errors
                                    :last_heartbeat (.minusMinutes (OffsetDateTime/now) 10)})]
                          (is (= [(:id run)] (mapv :id (runner/reap-orphaned-runs! runner/heartbeat-stale-minutes))))
                          (run-row (:id run))))
           retry      (fn [run]
                        (let [retry (runner/retry-failed! db run (mt/user->id :crowberto))]
                          (wait-ended (:id retry))
                          (set (get-in retry [:scope :table_ids]))))]
       (core-test/do-with-llm!
        (core-test/canned-llm (constantly {:data_sensitivity "PII"}))
        (fn []
          (testing "retry of a reaped run covers its failed tables and the tables it did not process"
            (let [run (reaped-run [{:table_id (:id t1) :table_name (:name t1) :schema "S"
                                    :message "boom" :error_code "provider_error"}])]
              (is (=? {:status       :failed
                       :table_errors [{:table_id (:id t1) :error_code "provider_error"}
                                      {:table_id (:id t2) :error_code "not_processed"}
                                      {:table_id (:id t3) :error_code "not_processed"}]}
                      run))
              (is (= #{(:id t1) (:id t2) (:id t3)} (retry run)))))
          (testing "retry of a reaped run with no failed table covers the tables it did not process"
            (let [run (reaped-run [])]
              (is (= #{(:id t1) (:id t2) (:id t3)} (retry run)))))))))))

(deftest run-that-fails-unexpectedly-records-unprocessed-tables-test
  (testing "a run that fails outside a table records every table it did not finish as not processed"
    (do-with-temp-tables
     2
     (fn [db [t0 t1]]
       (core-test/do-with-llm!
        (core-test/canned-llm (constantly {:data_sensitivity "PII"}))
        (fn []
          (mt/with-dynamic-fn-redefs [core/sample-connection-error (fn [& _] (throw (ex-info "boom" {})))]
            (let [run (wait-ended (:id (start! db {:attributes [:data_sensitivity]})))]
              (is (=? {:status       :failed
                       :message      "boom"
                       :table_errors [{:table_id (:id t0) :error_code "not_processed"}
                                      {:table_id (:id t1) :error_code "not_processed"}]}
                      run))))))))))

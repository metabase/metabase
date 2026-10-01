(ns metabase-enterprise.data-sensitivity.core-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.data-sensitivity.core :as core]
   [metabase-enterprise.data-sensitivity.llm :as llm]
   [metabase.driver.util :as driver.u]
   [metabase.metabot.core :as metabot]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.metabot.usage :as usage]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]
   [toucan2.core :as t2]))

(defn- people-table []
  (t2/select-one :model/Table :id (mt/id :people)))

(defn- field-names-in-message
  "The field names rendered into a user message, in order, so a canned response can answer per chunk."
  [messages]
  (let [content (:content (last messages))]
    (mapv second (re-seq #"(?m)^- (\S+) \(" content))))

(def ^:private usage-part
  {:type :usage :usage {:promptTokens 100 :completionTokens 20 :cacheReadTokens 5 :cacheCreationTokens 0}})

(defn canned-llm
  "A stand-in for `call-llm-structured-with-trace` that answers with `(entry-fn field-name)` for every rendered
  field, dropping fields for which it returns nil."
  [entry-fn]
  (fn [_model messages _schema _temperature _max-tokens _opts]
    {:result {:fields (into [] (keep (fn [field-name]
                                       (when-let [entry (entry-fn field-name)]
                                         (merge {:name             field-name
                                                 :reasoning        "because"
                                                 :data_sensitivity "PUBLIC"
                                                 :confidence       "high"
                                                 :semantic_type    llm/no-semantic-type}
                                                entry))))
                            (field-names-in-message messages))}
     :parts  [usage-part]}))

(defn do-with-llm!
  "Run `thunk` with `call-fn` standing in for the structured LLM call and every instance gate open."
  [call-fn thunk]
  (mt/with-dynamic-fn-redefs [metabot.self/call-llm-structured-with-trace call-fn
                              metabot.settings/metabot-enabled?           (constantly true)
                              metabot.settings/llm-metabot-configured?    (constantly true)
                              metabot.settings/llm-mini-model             (constantly "test/mini")
                              usage/check-usage-limits!                   (constantly nil)]
    (thunk)))

(defn- field-rows [table-id]
  (t2/select-fn-vec (juxt :id :data_sensitivity :semantic_type) :model/Field :table_id table-id
                    {:order-by [[:id :asc]]}))

(defn- do-with-unchanged-fields
  "Run `thunk` and assert no Field row of `table-id` changed its `data_sensitivity` or `semantic_type`."
  [table-id thunk]
  (let [before (field-rows table-id)
        result (thunk)]
    (is (= before (field-rows table-id)) "classification must not write to metabase_field")
    result))

(defn- result-field [result field-name]
  (some #(when (= field-name (:name %)) %) (:fields result)))

(deftest classify-table-diff-test
  (mt/with-temp [:model/Field human      {:table_id (mt/id :people) :name "ds_human" :base_type :type/Text
                                          :data_sensitivity :PII}
                 :model/Field _          {:table_id (mt/id :people) :name "ds_classifier" :base_type :type/Text
                                          :data_sensitivity :PII}
                 :model/Field _          {:table_id (mt/id :people) :name "ds_unscanned" :base_type :type/Text}
                 :model/Field _          {:table_id (mt/id :people) :name "ds_abstain" :base_type :type/Text
                                          :data_sensitivity :PUBLIC}
                 :model/Field _          {:table_id (mt/id :people) :name "ds_dropped" :base_type :type/Text}
                 :model/Field _          {:table_id (mt/id :people) :name "ds_semantic" :base_type :type/Text
                                          :semantic_type :type/Name :data_sensitivity :PII}
                 :model/Field _          {:table_id (mt/id :people) :name "ds_keep" :base_type :type/Text
                                          :semantic_type :type/Category :data_sensitivity :PUBLIC}]
    (field-user-settings/upsert-user-settings human {:data_sensitivity :PII})
    (let [entries {"ds_human"      {:data_sensitivity "PII"}
                   "ds_classifier" {:data_sensitivity "PUBLIC" :confidence "low"}
                   "ds_unscanned"  {:data_sensitivity "PII"}
                   "ds_abstain"    {:data_sensitivity llm/unsure}
                   "ds_dropped"    nil
                   "ds_semantic"   {:data_sensitivity "PII" :semantic_type "type/Email"}
                   "ds_keep"       {:data_sensitivity "PUBLIC"}}
          result  (do-with-llm! (canned-llm #(get entries % {}))
                                #(do-with-unchanged-fields (mt/id :people)
                                                           (fn [] (core/classify-table! (people-table)
                                                                                        :include-values? false))))]
      (testing "table identity and options are reported"
        (is (=? {:table_id     (mt/id :people)
                 :table_name   "PEOPLE"
                 :database_id  (mt/id)
                 :model        string?
                 :requests     1
                 :sample_error nil}
                result)))
      (testing "a human-set label the model agrees with"
        (is (=? {:current  {:data_sensitivity :PII :human_set true :state :human}
                 :proposed {:data_sensitivity :PII :confidence "high" :semantic_type nil :reasoning "because"}
                 :status   :agree}
                (result-field result "ds_human"))))
      (testing "a classifier-set label the model disagrees with"
        (is (=? {:current  {:data_sensitivity :PII :human_set false :state :classifier}
                 :proposed {:data_sensitivity :PUBLIC :confidence "low"}
                 :status   :disagree}
                (result-field result "ds_classifier"))))
      (testing "an unscanned field the model labels is new rather than a disagreement"
        (is (=? {:current  {:data_sensitivity nil :human_set false :state :unscanned}
                 :proposed {:data_sensitivity :PII}
                 :status   :new}
                (result-field result "ds_unscanned"))))
      (testing "UNSURE abstains and proposes nothing"
        (is (=? {:proposed {:data_sensitivity nil}
                 :status   :abstain}
                (result-field result "ds_abstain"))))
      (testing "a field missing from the response is dropped"
        (is (=? {:proposed {:data_sensitivity nil :confidence nil :reasoning nil}
                 :status   :dropped}
                (result-field result "ds_dropped"))))
      (testing "a proposed semantic type differing from the current one is flagged"
        (is (=? {:current           {:semantic_type :type/Name}
                 :proposed          {:semantic_type :type/Email}
                 :semantic_changed true}
                (result-field result "ds_semantic")))
        (is (false? (:semantic_changed (result-field result "ds_human")))))
      (testing "a semantic type the model keeps is reported as the proposal and not flagged"
        (is (=? {:current           {:semantic_type :type/Category}
                 :proposed          {:semantic_type :type/Category}
                 :semantic_changed false}
                (result-field result "ds_keep"))))
      (testing "counts match the per-field statuses"
        (let [{:keys [fields agree disagree new abstain dropped semantic_changed committed]} (:counts result)]
          (is (= (count (:fields result)) fields))
          (is (= fields (+ agree disagree new abstain dropped)))
          (is (= 1 disagree))
          (is (= 1 abstain))
          (is (= 1 dropped))
          (is (= 1 semantic_changed))
          (is (= 0 committed))))
      (testing "a dry run marks no field committed"
        (is (not-any? :committed (:fields result)))))))

(deftest classify-table-usage-test
  (testing "requests and usage total over chunks"
    (let [result (do-with-llm! (canned-llm (constantly {}))
                               #(core/classify-table! (people-table) :include-values? false :chunk-size 4))
          fields (count (:fields result))]
      (is (= (quot (+ fields 3) 4) (:requests result)))
      (is (= {:input_tokens          (* 100 (:requests result))
              :output_tokens         (* 20 (:requests result))
              :cache_read_tokens     (* 5 (:requests result))
              :cache_creation_tokens 0
              :total_tokens          (* 120 (:requests result))}
             (:usage result))))))

(defn- misbehaving-llm
  "A canned LLM that answers with `(entry-fn field-name)` and also names a field the table does not have."
  [entry-fn]
  (fn [& args]
    (update-in (apply (canned-llm entry-fn) args) [:result :fields] conj
               {:name             "ds_no_such_field"
                :reasoning        "because"
                :data_sensitivity "PII"
                :confidence       "high"
                :semantic_type    llm/no-semantic-type})))

(deftest classify-table-parse-counts-test
  (mt/with-temp [:model/Field _ {:table_id (mt/id :people) :name "ds_invalid" :base_type :type/Text}
                 :model/Field _ {:table_id (mt/id :people) :name "ds_missing" :base_type :type/Text}
                 :model/Field _ {:table_id (mt/id :people) :name "ds_bad_semantic" :base_type :type/Text}]
    (let [entries {"ds_invalid"      {:data_sensitivity "SECRET"}
                   "ds_missing"      nil
                   "ds_bad_semantic" {:semantic_type "type/Nope"}}
          result  (do-with-llm! (misbehaving-llm #(get entries % {}))
                                #(core/classify-table! (people-table) :include-values? false :chunk-size 4))]
      (testing "discarded model output is counted and summed over chunks"
        (is (< 1 (:requests result)))
        (is (= {:dropped_unknown  (:requests result)
                :dropped_invalid  1
                :dropped_missing  1
                :semantic_dropped 1}
               (:parse_counts result))))
      (testing "a well-behaved response discards nothing"
        (is (= {:dropped_unknown 0 :dropped_invalid 0 :dropped_missing 0 :semantic_dropped 0}
               (:parse_counts (do-with-llm! (canned-llm (constantly {}))
                                            #(core/classify-table! (people-table) :include-values? false)))))))))

(deftest classify-table-permission-bypass-test
  (testing "the LLM call runs with all Metabot permissions granted regardless of the user's groups"
    (let [seen (atom nil)]
      (mt/with-dynamic-fn-redefs [scope/resolve-user-permissions (constantly (assoc scope/all-yes-permissions :permission/metabot :no))]
        (do-with-llm! (fn [& args]
                        (reset! seen scope/*current-user-metabot-permissions*)
                        (apply (canned-llm (constantly {})) args))
                      #(mt/with-current-user (mt/user->id :rasta)
                         (is (= :permission-denied (metabot/llm-call-unavailable-reason core/required-permission)))
                         (is (nil? (core/unavailable-reason)))
                         (is (pos? (count (:fields (core/classify-table! (people-table) :include-values? false)))))
                         (is (= scope/all-yes-permissions @seen))))))))

(deftest unavailable-reason-test
  (mt/with-dynamic-fn-redefs [usage/check-usage-limits! (constantly nil)]
    (testing "Metabot disabled"
      (mt/with-dynamic-fn-redefs [metabot.settings/metabot-enabled? (constantly false)]
        (is (= :metabot-disabled (core/unavailable-reason)))))
    (testing "no provider configured"
      (mt/with-dynamic-fn-redefs [metabot.settings/metabot-enabled?        (constantly true)
                                  metabot.settings/llm-metabot-configured? (constantly false)]
        (is (= :no-llm (core/unavailable-reason)))))
    (testing "over the usage limit"
      (mt/with-dynamic-fn-redefs [metabot.settings/metabot-enabled?        (constantly true)
                                  metabot.settings/llm-metabot-configured? (constantly true)
                                  usage/check-usage-limits!                (constantly "limit")]
        (is (= :usage-limit (core/unavailable-reason)))))
    (testing "available"
      (mt/with-dynamic-fn-redefs [metabot.settings/metabot-enabled?        (constantly true)
                                  metabot.settings/llm-metabot-configured? (constantly true)]
        (is (nil? (core/unavailable-reason)))))))

(defn- failing-llm
  "A canned LLM that throws `ex` for any table whose name is in `failing-names`."
  [failing-names ex]
  (fn [& [_model messages :as args]]
    (let [content (:content (last messages))]
      (if (some #(str/includes? content (str "name: " % "\n")) failing-names)
        (throw ex)
        (apply (canned-llm (constantly {})) args)))))

(defn- active-tables [schema]
  (t2/select :model/Table {:where    (cond-> [:and [:= :db_id (mt/id)] [:= :active true]]
                                       schema (conj [:= :schema schema]))
                           :order-by [[:schema :asc] [:name :asc]]}))

(deftest classify-database-test
  (let [tables (active-tables nil)]
    (testing "every active table is classified in schema/name order and totals are merged"
      (let [result (do-with-llm! (canned-llm (constantly {}))
                                 #(core/classify-database! (mt/db) :include-values? false :parallelism 3))]
        (is (= (map :id tables) (map :table_id (:tables result))))
        (is (= 0 (:failed result)))
        (is (= (count tables) (:requests result)))
        (is (= (count (t2/select :model/Field {:where [:and [:= :active true]
                                                       [:not= :visibility_type "retired"]
                                                       [:in :table_id (map :id tables)]]}))
               (get-in result [:counts :fields])))
        (is (= (* 100 (count tables)) (get-in result [:usage :input_tokens])))
        (is (= (get-in result [:counts :fields])
               (+ (get-in result [:counts :agree]) (get-in result [:counts :disagree])
                  (get-in result [:counts :new]) (get-in result [:counts :abstain])
                  (get-in result [:counts :dropped]))))))
    (testing "parse counts are summed over the tables"
      (let [result (do-with-llm! (misbehaving-llm (constantly {}))
                                 #(core/classify-database! (mt/db) :include-values? false))]
        (is (= (count tables) (get-in result [:parse_counts :dropped_unknown])))
        (is (= (reduce (partial merge-with +) {} (map :parse_counts (:tables result)))
               (:parse_counts result)))))
    (testing "the schema option restricts the tables"
      (let [schema (:schema (first tables))
            result (do-with-llm! (canned-llm (constantly {}))
                                 #(core/classify-database! (mt/db) :include-values? false :schema schema))]
        (is (= schema (:schema result)))
        (is (= (map :id (active-tables schema)) (map :table_id (:tables result)))))
      (let [result (do-with-llm! (canned-llm (constantly {}))
                                 #(core/classify-database! (mt/db) :include-values? false :schema "no_such_schema"))]
        (is (= [] (:tables result)))
        (is (= 0 (:requests result)))))
    (testing "a table whose classification throws for a reason other tables need not share becomes an error entry and the run completes"
      (let [failing (t2/select-one-fn :name :model/Table :id (mt/id :reviews))
            result  (do-with-llm! (failing-llm #{failing} (ex-info "boom" {:error-code "structured-output-invalid"}))
                                  #(core/classify-database! (mt/db) :include-values? false))]
        (is (= 1 (:failed result)))
        (is (=? {:table_id   (mt/id :reviews)
                 :table_name failing
                 :error      "boom"
                 :error_code "structured-output-invalid"}
                (some #(when (:error %) %) (:tables result))))
        (is (= (dec (count tables)) (:requests result)))))))

(def ^:private provider-rejection
  (ex-info "Your credit balance is too low" {:api-error true :status 400 :provider "anthropic"
                                             :error-code :provider-api-error}))

(deftest fatal-error-test
  (testing "provider rejections retries never cover, a missing provider, and the usage limit are fatal"
    (is (core/fatal-error? provider-rejection))
    (is (core/fatal-error? (ex-info "x" {:api-error true :status 401})))
    (is (core/fatal-error? (ex-info "x" {:api-error true :status-code 400 :error-code :llm-not-configured})))
    (is (core/fatal-error? (ex-info "x" {:api-error true :error-code :api-key-missing})))
    (is (core/fatal-error? (ex-info "x" {:type :metabot/usage-limit-reached}))))
  (testing "rate limits, server errors, timeouts, and non-provider failures are not"
    (is (not (core/fatal-error? (ex-info "x" {:api-error true :status 429}))))
    (is (not (core/fatal-error? (ex-info "x" {:api-error true :status 500}))))
    (is (not (core/fatal-error? (ex-info "x" {:api-error true :error-code :provider-request-failed}))))
    (is (not (core/fatal-error? (ex-info "x" {:status 400}))))
    (is (not (core/fatal-error? (RuntimeException. "x"))))))

(deftest classify-database-fatal-error-test
  (let [tables        (active-tables nil)
        names         (mapv :name tables)
        [ok failing]  names
        skipped-names (drop 2 names)]
    (testing "a fatal failure stops the run; earlier successes are kept and tables not yet started are skipped"
      (let [result   (do-with-llm! (failing-llm #{failing} provider-rejection)
                                   #(core/classify-database! (mt/db) :include-values? false :parallelism 1))
            by-name  (into {} (map (juxt :table_name identity)) (:tables result))]
        (is (= names (map :table_name (:tables result))) "every table is reported, in order")
        (is (nil? (:error (get by-name ok))))
        (is (=? {:error "Your credit balance is too low" :error_code "provider-api-error"} (get by-name failing)))
        (doseq [skipped skipped-names]
          (is (=? {:error      (str "Skipped after table " failing " failed: Your credit balance is too low")
                   :error_code "skipped"}
                  (get by-name skipped))))
        (is (= (dec (count tables)) (:failed result)))
        (is (= 1 (:requests result)))
        (is (= (count (t2/select :model/Field {:where [:and [:= :active true]
                                                       [:not= :visibility_type "retired"]
                                                       [:= :table_id (:id (first tables))]]}))
               (get-in result [:counts :fields])))))
    (testing "a non-fatal failure in the same position does not stop the run"
      (let [result (do-with-llm! (failing-llm #{failing} (ex-info "later" {:api-error true :status 429}))
                                 #(core/classify-database! (mt/db) :include-values? false :parallelism 1))]
        (is (= 1 (:failed result)))
        (is (= (dec (count tables)) (:requests result)))))
    (testing "when no table succeeded the fatal exception is rethrown"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"credit balance is too low"
                            (do-with-llm! (failing-llm (set names) provider-rejection)
                                          #(core/classify-database! (mt/db) :include-values? false :parallelism 2)))))
    (testing "when no table succeeded but none failed fatally the errors are returned"
      (let [result (do-with-llm! (failing-llm (set names) (ex-info "later" {:api-error true :status 429}))
                                 #(core/classify-database! (mt/db) :include-values? false :parallelism 2))]
        (is (= (count tables) (:failed result)))
        (is (every? #(= "later" (:error %)) (:tables result)))))))

(defn- table-in-message
  "The name of the table a user message renders."
  [messages]
  (second (re-find #"(?m)^name: (\S+)$" (:content (last messages)))))

(defn- rate-limit [& {:as headers}]
  (ex-info "Rate limited" {:api-error true :status 429 :provider "anthropic" :error-code :provider-api-error
                           :headers headers}))

(defn- flaky-llm
  "A canned LLM that throws `(ex-fn table-name attempt)` when it returns an exception, counting attempts per table in
  `attempts`."
  [attempts ex-fn]
  (fn [& [_model messages :as args]]
    (let [table   (table-in-message messages)
          attempt (get (swap! attempts update table (fnil inc 0)) table)]
      (if-let [ex (ex-fn table attempt)]
        (throw ex)
        (apply (canned-llm (constantly {})) args)))))

(deftest rate-limited-test
  (is (core/rate-limited? (rate-limit)))
  (is (core/rate-limited? (ex-info "x" {:api-error true :status 529})))
  (is (not (core/rate-limited? (ex-info "x" {:api-error true :status 500}))))
  (is (not (core/rate-limited? (ex-info "x" {:status 429}))))
  (is (not (core/fatal-error? (rate-limit)))))

(deftest retry-after-ms-test
  (is (= 7000 (#'core/retry-after-ms (rate-limit "retry-after" "7"))))
  (is (= 60000 (#'core/retry-after-ms (rate-limit "retry-after" "600"))) "capped at a minute")
  (is (nil? (#'core/retry-after-ms (rate-limit "retry-after" "Wed, 21 Oct 2015 07:28:00 GMT"))))
  (is (nil? (#'core/retry-after-ms (rate-limit)))))

(deftest classify-database-rate-limit-requeue-test
  (let [tables    (active-tables nil)
        [a b c d] (map :name tables)]
    (testing "a table rate limited once is retried after the run and succeeds"
      (let [attempts (atom {})
            result   (do-with-llm! (flaky-llm attempts (fn [table attempt] (when (and (= table a) (= attempt 1)) (rate-limit))))
                                   #(core/classify-database! (mt/db) :include-values? false :requeue-delay-ms 0))]
        (is (= 2 (get @attempts a)))
        (is (= 0 (:failed result)))
        (is (= 0 (:rate_limited result)))
        (is (= (count tables) (:requests result)))
        (is (= (map :id tables) (map :table_id (:tables result))) "the requeued result keeps its place")))
    (testing "a table rate limited again is reported as rate_limited without stopping the run"
      (let [attempts (atom {})
            result   (do-with-llm! (flaky-llm attempts (fn [table _] (when (= table a) (rate-limit))))
                                   #(core/classify-database! (mt/db) :include-values? false :requeue-delay-ms 0))]
        (is (= 2 (get @attempts a)))
        (is (= 1 (:failed result)))
        (is (= 1 (:rate_limited result)))
        (is (=? {:table_name a :error "Rate limited" :error_code "rate_limited"}
                (first (:tables result))))
        (is (= (dec (count tables)) (:requests result)))))
    (testing "nothing is requeued after a fatal failure"
      (let [attempts (atom {})
            result   (do-with-llm! (flaky-llm attempts (fn [table _] (condp = table b (rate-limit) c provider-rejection nil)))
                                   #(core/classify-database! (mt/db) :include-values? false :parallelism 1
                                                             :requeue-delay-ms 0))]
        (is (= 1 (get @attempts b)))
        (is (nil? (get @attempts d)) "tables after the fatal failure never start")
        (is (nil? (:error (first (:tables result)))))
        (is (=? {:table_name b :error_code "rate_limited"} (second (:tables result))))
        (is (=? {:table_name c :error_code "provider-api-error"} (nth (:tables result) 2)))))))

(defn- values-rendered?
  "Whether any recorded user message rendered sampled or cached values."
  [messages]
  (boolean (some #(str/includes? (:content (last %)) "; values: ") messages)))

(defn- recording-llm [messages]
  (fn [& [_model msgs :as args]]
    (swap! messages conj msgs)
    (apply (canned-llm (constantly {})) args)))

(deftest connection-pre-flight-test
  (let [connects (atom 0)]
    (testing "a database that connects is tested once per run and sampled"
      (let [messages (atom [])
            result   (mt/with-dynamic-fn-redefs [driver.u/can-connect-with-details? (fn [& _] (swap! connects inc) true)]
                       (do-with-llm! (recording-llm messages) #(core/classify-database! (mt/db) :parallelism 2)))]
        (is (= 1 @connects))
        (is (nil? (:sample_error result)))
        (is (values-rendered? @messages))))
    (testing "a database that cannot connect is classified on metadata alone and reports why"
      (let [messages (atom [])
            result   (mt/with-dynamic-fn-redefs [driver.u/can-connect-with-details?
                                                 (fn [& _] (throw (ex-info "Timed out after 10.0 s" {})))]
                       (do-with-llm! (recording-llm messages) #(core/classify-database! (mt/db) :parallelism 2)))]
        (is (= "Timed out after 10.0 s" (:sample_error result)))
        (is (= 0 (:failed result)))
        (is (every? #(nil? (:sample_error %)) (:tables result)))
        (is (not (values-rendered? @messages)))))
    (testing "the table entry point tests the connection too"
      (let [messages (atom [])
            result   (mt/with-dynamic-fn-redefs [driver.u/can-connect-with-details?
                                                 (fn [& _] (throw (ex-info "Timed out after 10.0 s" {})))]
                       (do-with-llm! (recording-llm messages) #(core/classify-table! (people-table))))]
        (is (= "Timed out after 10.0 s" (:sample_error result)))
        (is (not (values-rendered? @messages)))))
    (testing "no connection test runs when values are not requested"
      (reset! connects 0)
      (mt/with-dynamic-fn-redefs [driver.u/can-connect-with-details? (fn [& _] (swap! connects inc) true)]
        (do-with-llm! (canned-llm (constantly {})) #(core/classify-database! (mt/db) :include-values? false)))
      (is (= 0 @connects)))
    (testing "an H2 database is allowed to be tested, as sync does"
      (is (nil? (#'core/connection-error (mt/db)))))))

(deftest classify-database-worker-pool-test
  (let [tables       (active-tables nil)
        [slow _ next] (map :name tables)
        next-started (promise)
        in-flight    (atom 0)
        peak         (atom 0)
        table-of     (fn [messages]
                       (some #(when (str/includes? (:content (last messages)) (str "name: " % "\n")) %)
                             (map :name tables)))
        llm          (fn [& [_model messages :as args]]
                       (let [table (table-of messages)]
                         (swap! peak max (swap! in-flight inc))
                         (try
                           (when (= table next) (deliver next-started true))
                           (when (= table slow)
                             (is (true? (deref next-started 5000 :timeout))
                                 "the third table starts while the first is still running"))
                           (apply (canned-llm (constantly {})) args)
                           (finally (swap! in-flight dec)))))
        result       (do-with-llm! llm #(core/classify-database! (mt/db) :include-values? false :parallelism 2))]
    (testing "a free worker takes the next table without waiting for the slowest one"
      (is (= 0 (:failed result)))
      (is (= (count tables) (:requests result))))
    (testing "no more than parallelism tables are in flight"
      (is (<= @peak 2)))))

(defn- labels-by-name [table-id]
  (t2/select-fn->fn :name :data_sensitivity :model/Field :table_id table-id))

(deftest classify-table-commit-test
  (mt/with-temp [:model/Table table {:db_id (mt/id) :name "ds_commit" :active true}
                 :model/Field _     {:table_id (:id table) :name "ds_new" :base_type :type/Text}
                 :model/Field _     {:table_id (:id table) :name "ds_disagree" :base_type :type/Text
                                     :data_sensitivity :PUBLIC}
                 :model/Field _     {:table_id (:id table) :name "ds_agree" :base_type :type/Text
                                     :data_sensitivity :PII}
                 :model/Field _     {:table_id (:id table) :name "ds_abstain" :base_type :type/Text
                                     :data_sensitivity :PUBLIC}
                 :model/Field _     {:table_id (:id table) :name "ds_dropped" :base_type :type/Text}
                 :model/Field human {:table_id (:id table) :name "ds_human" :base_type :type/Text
                                     :data_sensitivity :PUBLIC}
                 :model/Field _     {:table_id (:id table) :name "ds_semantic" :base_type :type/Text
                                     :semantic_type :type/Name}]
    (field-user-settings/upsert-user-settings human {:data_sensitivity :PUBLIC})
    (let [entries {"ds_new"      {:data_sensitivity "PII"}
                   "ds_disagree" {:data_sensitivity "PII"}
                   "ds_agree"    {:data_sensitivity "PII"}
                   "ds_abstain"  {:data_sensitivity llm/unsure}
                   "ds_dropped"  nil
                   "ds_human"    {:data_sensitivity "PII"}
                   "ds_semantic" {:data_sensitivity "PCI_FIN" :semantic_type "type/Email"}}
          result  (do-with-llm! (canned-llm #(get entries %))
                                #(core/classify-table! table :include-values? false :commit? true))]
      (testing "new and disagreeing labels are written; agreeing, abstained, dropped, and human-set fields are not"
        (is (= {"ds_new"      :PII
                "ds_disagree" :PII
                "ds_agree"    :PII
                "ds_abstain"  :PUBLIC
                "ds_dropped"  nil
                "ds_human"    :PUBLIC
                "ds_semantic" :PCI_FIN}
               (labels-by-name (:id table)))))
      (testing "the semantic type is reported but not written"
        (is (= :type/Email (get-in (result-field result "ds_semantic") [:proposed :semantic_type])))
        (is (= :type/Name (t2/select-one-fn :semantic_type :model/Field :table_id (:id table) :name "ds_semantic"))))
      (testing "each field reports whether it was committed, and the counts total them"
        (is (= {"ds_new" true "ds_disagree" true "ds_agree" false "ds_abstain" false "ds_dropped" false
                "ds_human" false "ds_semantic" true}
               (into {} (map (juxt :name :committed)) (:fields result))))
        (is (= 3 (get-in result [:counts :committed]))))
      (testing "a data-sensitivity sync scan leaves committed labels alone"
        (sync/scan-data-sensitivity! table)
        (is (=? {"ds_new" :PII "ds_disagree" :PII "ds_semantic" :PCI_FIN}
                (labels-by-name (:id table))))))))

(deftest classify-table-commit-failure-test
  (mt/with-temp [:model/Table table {:db_id (mt/id) :name "ds_commit_failure" :active true}
                 :model/Field _     {:table_id (:id table) :name "ds_pii" :base_type :type/Text}
                 :model/Field _     {:table_id (:id table) :name "ds_public" :base_type :type/Text}]
    (testing "a write that fails partway through the table writes nothing"
      (let [update! t2/update!
            updates (atom 0)]
        (with-redefs [t2/update! (fn [& args]
                                   (if (= 2 (swap! updates inc))
                                     (throw (ex-info "write failed" {}))
                                     (apply update! args)))]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"write failed"
                                (do-with-llm! (canned-llm {"ds_pii" {:data_sensitivity "PII"} "ds_public" {}})
                                              #(core/classify-table! table :include-values? false :commit? true)))))
        (is (= 2 @updates))
        (is (= {"ds_pii" nil "ds_public" nil} (labels-by-name (:id table))))))))

(deftest classify-database-commit-test
  (mt/with-temp [:model/Database db {}
                 :model/Table    a  {:db_id (:id db) :schema "S" :name "ds_a" :active true}
                 :model/Table    b  {:db_id (:id db) :schema "S" :name "ds_b" :active true}
                 :model/Table    c  {:db_id (:id db) :schema "S" :name "ds_c" :active true}
                 :model/Field    _  {:table_id (:id a) :name "ds_a_field" :base_type :type/Text}
                 :model/Field    _  {:table_id (:id b) :name "ds_b_field" :base_type :type/Text}
                 :model/Field    _  {:table_id (:id c) :name "ds_c_field" :base_type :type/Text}]
    (testing "tables committed before a fatal failure stay written; the failed and skipped tables write nothing"
      (let [result (do-with-llm! (failing-llm #{"ds_b"} provider-rejection)
                                 #(core/classify-database! db :include-values? false :parallelism 1 :commit? true))]
        (is (= [nil "provider-api-error" "skipped"] (map :error_code (:tables result))))
        (is (= {"ds_a_field" :PUBLIC} (labels-by-name (:id a))))
        (is (= {"ds_b_field" nil} (labels-by-name (:id b))))
        (is (= {"ds_c_field" nil} (labels-by-name (:id c))))
        (is (= 1 (get-in result [:counts :committed])) "committed is summed over the tables")))))

(ns metabase-enterprise.data-sensitivity.core-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.data-sensitivity.context :as context]
   [metabase-enterprise.data-sensitivity.core :as core]
   [metabase-enterprise.data-sensitivity.llm :as llm]
   [metabase.api.common :as api]
   [metabase.driver.util :as driver.u]
   [metabase.metabot.core :as metabot]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.metabot.usage :as usage]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.util.dynamic-redefs :as dynamic-redefs]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent CountDownLatch TimeUnit)))

(set! *warn-on-reflection* true)

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

(deftest classify-table-nested-fields-test
  (mt/with-temp [:model/Table {table-id :id :as table} {:db_id (mt/id) :name "mongo_like" :active true}
                 :model/Field {user-id :id}  {:table_id table-id :name "user" :base_type :type/Dictionary}
                 :model/Field {owner-id :id} {:table_id table-id :name "owner" :base_type :type/Dictionary}
                 :model/Field user-email     {:table_id table-id :name "email" :base_type :type/Text
                                              :parent_id user-id :nfc_path ["user" "email"]}
                 :model/Field owner-email    {:table_id table-id :name "email" :base_type :type/Text
                                              :parent_id owner-id :nfc_path ["owner" "email"]}]
    (let [result (do-with-llm! (canned-llm (constantly {:data_sensitivity "PII"}))
                               #(core/classify-table! table :include-values? false))]
      (testing "same-named children under different parents are excluded, so the parents classify without collision"
        (is (= #{user-id owner-id} (into #{} (map :field_id) (:fields result))))
        (is (every? #(= :new (:status %)) (:fields result)))
        (is (not-any? #{(:id user-email) (:id owner-email)} (map :field_id (:fields result))))))))

(deftest classify-table-duplicate-names-test
  (testing "a packet with two fields of the same name fails before the model is called"
    (let [called? (atom false)]
      (mt/with-dynamic-fn-redefs [context/table-packet (fn [_database table & _]
                                                         {:table  {:id (:id table)}
                                                          :fields [{:name "email"} {:name "email"}]
                                                          :sample {:rows 0 :truncation 0 :error nil}})]
        (do-with-llm! (fn [& _] (reset! called? true) {:result {:fields []} :parts []})
                      #(is (thrown-with-msg? clojure.lang.ExceptionInfo #"duplicate names: .*email"
                                             (core/classify-table! (people-table) :include-values? false)))))
      (is (false? @called?)))))

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
  (testing "every chunk call runs as the current user with all Metabot permissions granted regardless of the user's groups"
    (let [seen (atom [])]
      (mt/with-dynamic-fn-redefs [scope/resolve-user-permissions (constantly (assoc scope/all-yes-permissions :permission/metabot :no))]
        (do-with-llm! (fn [& args]
                        (swap! seen conj [scope/*current-user-metabot-permissions* api/*current-user-id*])
                        (apply (canned-llm (constantly {})) args))
                      #(mt/with-current-user (mt/user->id :rasta)
                         (is (= :permission-denied (metabot/llm-call-unavailable-reason core/required-permission)))
                         (is (nil? (core/unavailable-reason)))
                         (is (pos? (count (:fields (core/classify-table! (people-table) :include-values? false
                                                                         :chunk-size 2)))))
                         (is (< 1 (count @seen)))
                         (is (every? #{[scope/all-yes-permissions (mt/user->id :rasta)]} @seen))))))))

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
                                 #(core/classify-database! (mt/db) :include-values? false))]
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
    (testing "a table whose classification throws becomes an error entry and the run completes"
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

(defn- do-counting-database-selects
  "Run `thunk` and return the number of `:model/Database` rows it selected with `t2/select-one`."
  [thunk]
  (let [n          (atom 0)
        select-one (dynamic-redefs/original-fn #'t2/select-one)]
    (mt/with-dynamic-fn-redefs [t2/select-one (fn [model & args]
                                                (when (= :model/Database model)
                                                  (swap! n inc))
                                                (apply select-one model args))]
      (thunk))
    @n))

(deftest database-selected-once-test
  (let [database (mt/db)
        table    (people-table)]
    (testing "a database run uses the Database it is given and selects none"
      (is (= 0 (do-counting-database-selects
                #(do-with-llm! (canned-llm (constantly {}))
                               (fn [] (core/classify-database! database :include-values? false)))))))
    (testing "a table run selects its Database once"
      (is (= 1 (do-counting-database-selects
                #(do-with-llm! (canned-llm (constantly {}))
                               (fn [] (core/classify-table! table :include-values? false)))))))))

(deftest classify-database-log-and-continue-test
  (let [tables (active-tables nil)
        names  (mapv :name tables)]
    (testing "a provider rejection fails only its table; the tables after it are classified"
      (let [failing (second names)
            result  (do-with-llm! (failing-llm #{failing} provider-rejection)
                                  #(core/classify-database! (mt/db) :include-values? false))]
        (is (= (map :id tables) (map :table_id (:tables result))))
        (is (= 1 (:failed result)))
        (is (=? {:table_name failing :error "Your credit balance is too low" :error_code "provider-api-error"}
                (second (:tables result))))
        (is (= (dec (count tables)) (:requests result)))))
    (testing "a provider rejection on every table gives one error entry per table"
      (let [result (do-with-llm! (failing-llm (set names) (ex-info "Unauthorized" {:api-error true :status 401
                                                                                   :error-code :provider-api-error}))
                                 #(core/classify-database! (mt/db) :include-values? false))]
        (is (= (count tables) (:failed result)))
        (is (= (map :id tables) (map :table_id (:tables result))))
        (is (every? #(= {:error "Unauthorized" :error_code "provider-api-error"} (select-keys % [:error :error_code]))
                    (:tables result)))
        (is (= 0 (:requests result)))))))

(deftest concurrent-database-runs-test
  (testing "two concurrent database runs never have more LLM calls in flight than the pool size"
    (let [latch     (CountDownLatch. ^long llm/pool-size)
          in-flight (atom 0)
          peak      (atom 0)
          llm       (fn [& args]
                      (swap! peak max (swap! in-flight inc))
                      (try
                        (.countDown latch)
                        (.await latch 5 TimeUnit/SECONDS)
                        (Thread/sleep 5)
                        (apply (canned-llm (constantly {})) args)
                        (finally
                          (swap! in-flight dec))))
          results   (do-with-llm! llm
                                  (fn []
                                    (let [runs (doall (repeatedly 2 #(future (core/classify-database! (mt/db) :include-values? false
                                                                                                      :chunk-size 2))))]
                                      (mapv #(deref % 60000 nil) runs))))]
      (is (every? #(= 0 (:failed %)) results))
      (is (every? #(< (count (:tables %)) (:requests %)) results) "tables span more than one chunk")
      (is (= llm/pool-size @peak)))))

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
                       (do-with-llm! (recording-llm messages) #(core/classify-database! (mt/db))))]
        (is (= 1 @connects))
        (is (nil? (:sample_error result)))
        (is (values-rendered? @messages))))
    (testing "a database that cannot connect is classified on metadata alone and reports why"
      (let [messages (atom [])
            result   (mt/with-dynamic-fn-redefs [driver.u/can-connect-with-details?
                                                 (fn [& _] (throw (ex-info "Timed out after 10.0 s" {})))]
                       (do-with-llm! (recording-llm messages) #(core/classify-database! (mt/db))))]
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
    (testing "each table commits on its own; a failed table writes nothing and the tables around it stay written"
      (let [result (do-with-llm! (failing-llm #{"ds_b"} provider-rejection)
                                 #(core/classify-database! db :include-values? false :commit? true))]
        (is (= [nil "provider-api-error" nil] (map :error_code (:tables result))))
        (is (= {"ds_a_field" :PUBLIC} (labels-by-name (:id a))))
        (is (= {"ds_b_field" nil} (labels-by-name (:id b))))
        (is (= {"ds_c_field" :PUBLIC} (labels-by-name (:id c))))
        (is (= 2 (get-in result [:counts :committed])) "committed is summed over the tables")))))

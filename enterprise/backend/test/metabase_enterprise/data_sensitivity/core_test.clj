(ns metabase-enterprise.data-sensitivity.core-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.data-sensitivity.core :as core]
   [metabase-enterprise.data-sensitivity.llm :as llm]
   [metabase.metabot.core :as metabot]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.metabot.usage :as usage]
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

(defn- canned-llm
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

(defn- do-with-llm! [call-fn thunk]
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
                                          :semantic_type :type/Name :data_sensitivity :PII}]
    (field-user-settings/upsert-user-settings human {:data_sensitivity :PII})
    (let [entries {"ds_human"      {:data_sensitivity "PII"}
                   "ds_classifier" {:data_sensitivity "PUBLIC" :confidence "low"}
                   "ds_unscanned"  {:data_sensitivity "PII"}
                   "ds_abstain"    {:data_sensitivity llm/unsure}
                   "ds_dropped"    nil
                   "ds_semantic"   {:data_sensitivity "PII" :semantic_type "type/Email"}}
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
        (is (=? {:current  {:data_sensitivity :PII :human_set? true :state :human}
                 :proposed {:data_sensitivity :PII :confidence "high" :semantic_type nil :reasoning "because"}
                 :status   :agree}
                (result-field result "ds_human"))))
      (testing "a classifier-set label the model disagrees with"
        (is (=? {:current  {:data_sensitivity :PII :human_set? false :state :classifier}
                 :proposed {:data_sensitivity :PUBLIC :confidence "low"}
                 :status   :disagree}
                (result-field result "ds_classifier"))))
      (testing "an unscanned field the model labels is a disagreement from an unscanned state"
        (is (=? {:current {:data_sensitivity nil :human_set? false :state :unscanned}
                 :status  :disagree}
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
                 :semantic_changed? true}
                (result-field result "ds_semantic")))
        (is (false? (:semantic_changed? (result-field result "ds_human")))))
      (testing "counts match the per-field statuses"
        (let [{:keys [fields agree disagree abstain dropped semantic_changed]} (:counts result)]
          (is (= (count (:fields result)) fields))
          (is (= fields (+ agree disagree abstain dropped)))
          (is (= 1 abstain))
          (is (= 1 dropped))
          (is (= 1 semantic_changed)))))))

(deftest classify-table-usage-test
  (testing "requests and usage total over chunks"
    (let [result (do-with-llm! (canned-llm (constantly {}))
                               #(core/classify-table! (people-table) :include-values? false :chunk-size 4))
          fields (count (:fields result))]
      (is (= (quot (+ fields 3) 4) (:requests result)))
      (is (= {:input_tokens          (* 100 (:requests result))
              :output_tokens         (* 20 (:requests result))
              :cache_read_tokens     (* 5 (:requests result))
              :cache_creation_tokens 0}
             (:usage result))))))

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
                  (get-in result [:counts :abstain]) (get-in result [:counts :dropped]))))))
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
            result  (do-with-llm! (fn [& [_model messages :as args]]
                                    (if (str/includes? (:content (last messages)) (str "name: " failing "\n"))
                                      (throw (ex-info "boom" {:error-code "ai_usage_limit_reached"}))
                                      (apply (canned-llm (constantly {})) args)))
                                  #(core/classify-database! (mt/db) :include-values? false))]
        (is (= 1 (:failed result)))
        (is (=? {:table_id   (mt/id :reviews)
                 :table_name failing
                 :error      "boom"
                 :error_code "ai_usage_limit_reached"}
                (some #(when (:error %) %) (:tables result))))
        (is (= (dec (count tables)) (:requests result)))))))

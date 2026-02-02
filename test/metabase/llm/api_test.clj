(ns metabase.llm.api-test
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.analytics.snowplow-test :as snowplow-test]
   [metabase.llm.anthropic :as llm.anthropic]
   [metabase.llm.api :as api]
   [metabase.llm.context :as llm.context]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------- database-dialect Tests -------------------------------------------

(deftest database-engine-test
  (mt/with-temp [:model/Database postgres-db {:engine :postgres}
                 :model/Database mysql-db   {:engine :mysql}
                 :model/Database bigquery-db {:engine :bigquery}]
    (testing "returns engine keyword for database"
      (is (= :postgres (#'api/database-engine (:id postgres-db))))
      (is (= :mysql (#'api/database-engine (:id mysql-db))))
      (is (= :bigquery (#'api/database-engine (:id bigquery-db)))))

    (testing "nil database returns nil"
      (is (nil? (#'api/database-engine nil))))

    (testing "non-existent database returns nil"
      (is (nil? (#'api/database-engine 99999999))))))

;;; ------------------------------------------- load-dialect-instructions Tests -------------------------------------------

(deftest load-dialect-instructions-test
  (testing "known engine with file returns content"
    (let [instructions (#'api/load-dialect-instructions :postgres)]
      (is (string? instructions))
      (is (str/includes? instructions "PostgreSQL"))))

  (testing "nil engine returns nil"
    (is (nil? (#'api/load-dialect-instructions nil)))))

;;; ------------------------------------------- Table ID extraction Tests -------------------------------------------

(deftest extract-frontend-table-ids-test
  (testing "extracts table IDs from referenced_entities"
    (let [entities [{:model "table" :id 1}
                    {:model "table" :id 2}
                    {:model "card" :id 999}
                    {:model "table" :id 3}]]
      (is (= #{1 2 3}
             (->> entities
                  (filter #(= "table" (:model %)))
                  (map :id)
                  set)))))

  (testing "returns empty set for empty input"
    (is (= #{}
           (->> []
                (filter #(= "table" (:model %)))
                (map :id)
                set))))

  (testing "returns empty set when no tables present"
    (let [entities [{:model "card" :id 1}
                    {:model "question" :id 2}]]
      (is (= #{}
             (->> entities
                  (filter #(= "table" (:model %)))
                  (map :id)
                  set))))))

(deftest table-id-union-test
  (testing "all sources merged via set union"
    (let [frontend #{1 2}
          explicit #{2 3}
          implicit #{3 4}]
      (is (= #{1 2 3 4}
             (set/union (or frontend #{})
                        (or explicit #{})
                        (or implicit #{}))))))

  (testing "nil sources treated as empty sets"
    (is (= #{1 2}
           (set/union (or nil #{})
                      (or #{1 2} #{})
                      (or nil #{}))))))

;;; ------------------------------------------- Integration with context Tests -------------------------------------------

(deftest table-mention-parsing-integration-test
  (testing "explicit mentions parsed from prompt"
    (let [prompt "Join [Orders](metabase://table/123) with [Users](metabase://table/456)"]
      (is (= #{123 456}
             (llm.context/parse-table-mentions prompt)))))

  (testing "multiple mentions of same table deduplicated"
    (let [prompt "[Orders](metabase://table/123) and again [Orders](metabase://table/123)"]
      (is (= #{123}
             (llm.context/parse-table-mentions prompt))))))

;;; ------------------------------------------- build-system-prompt Tests -------------------------------------------

(deftest build-system-prompt-test
  (testing "builds prompt with required parameters"
    (let [prompt (#'api/build-system-prompt {:dialect "PostgreSQL"
                                             :schema-ddl "CREATE TABLE users (id INTEGER);"})]
      (is (string? prompt))
      (is (str/includes? prompt "PostgreSQL"))
      (is (str/includes? prompt "CREATE TABLE users"))))

  (testing "includes dialect instructions when provided"
    (let [prompt (#'api/build-system-prompt {:dialect "PostgreSQL"
                                             :schema-ddl "CREATE TABLE users (id INTEGER);"
                                             :dialect-instructions "Use LIMIT instead of TOP"})]
      (is (str/includes? prompt "Use LIMIT instead of TOP"))))

  (testing "includes source SQL when provided"
    (let [prompt (#'api/build-system-prompt {:dialect "PostgreSQL"
                                             :schema-ddl "CREATE TABLE users (id INTEGER);"
                                             :source-sql "SELECT * FROM users"})]
      (is (str/includes? prompt "SELECT * FROM users")))))

;;; ------------------------------------------- Error handling Tests -------------------------------------------

(deftest generate-sql-error-handling-test
  (mt/with-temp [:model/Database db {:engine :postgres}]
    (testing "403 when LLM not configured"
      (mt/with-temporary-setting-values [llm-anthropic-api-key nil]
        (let [response (mt/user-http-request :rasta :post 403 "llm/generate-sql"
                                             {:prompt "test"
                                              :database_id (:id db)})]
          (is (str/includes? (str response) "not configured")))))

    (testing "400 when no tables found"
      (mt/with-temporary-setting-values [llm-anthropic-api-key "sk-ant-test"]
        (let [response (mt/user-http-request :rasta :post 400 "llm/generate-sql"
                                             {:prompt "no table mentions here"
                                              :database_id (:id db)})]
          (is (str/includes? (str response) "No tables found")))))))

(deftest list-models-unconfigured-test
  (testing "Returns 403 when LLM is not configured"
    (mt/with-temporary-setting-values [llm-anthropic-api-key nil]
      (let [response (mt/user-http-request :rasta :get 403 "llm/list-models")]
        (is (str/includes? (str response) "not configured"))))))

;;; ------------------------------------------- Snowplow Tests -------------------------------------------

(defn- token-usage-event? [event]
  (-> event
      :data
      (contains? "total_tokens")))

(defn- simple-event? [event]
  (-> event
      :data
      (contains? "event")))

(deftest generate-sql-snowplow-success-test
  (testing "successful /generate-sql call tracks both token_usage and simple_event"
    (mt/with-temp [:model/Database db {:engine :postgres}
                   :model/Table table {:db_id (:id db) :name "users" :schema "public"}
                   :model/Field _ {:table_id (:id table) :name "id" :base_type :type/Integer}
                   :model/Field _ {:table_id (:id table) :name "name" :base_type :type/Text}]
      (let [mock-chat-response {:result      {:sql "SELECT * FROM users"}
                                :usage       {:model      "claude-sonnet-4-5-20250929"
                                              :prompt     1000
                                              :completion 200}
                                :duration-ms 500}]
        (mt/with-temporary-setting-values [llm-anthropic-api-key "sk-ant-test"]
          (snowplow-test/with-fake-snowplow-collector
            (with-redefs [llm.anthropic/chat-completion (constantly mock-chat-response)]
              (let [response      (mt/user-http-request :rasta :post 200 "llm/generate-sql"
                                                        {:prompt              "get all users"
                                                         :database_id         (:id db)
                                                         :referenced_entities [{:model "table" :id (:id table)}]})
                    events        (snowplow-test/pop-event-data-and-user-id!)
                    token-events  (filter token-usage-event? events)
                    simple-events (filter simple-event? events)]
                (is (= "SELECT * FROM users" (:sql response)))
                (testing "token_usage event"
                  (is (=? [{:data {"model_id"            "claude-sonnet-4-5-20250929"
                                   "prompt_tokens"       1000
                                   "completion_tokens"   200
                                   "total_tokens"        1200
                                   "estimated_costs_usd" #(and (number? %) (pos? %))
                                   "duration_ms"         500
                                   "source"              "oss_metabot"
                                   "tag"                 "oss-sqlgen"}}]
                          token-events)))
                (testing "simple_event"
                  (is (=? [{:data {"event"        "metabot_oss_sqlgen_used"
                                   "duration_ms"  int?
                                   "result"       "success"
                                   "event_detail" "postgres"}}]
                          simple-events)))))))))))

(deftest generate-sql-snowplow-failure-test
  (testing "failed /generate-sql call tracks simple_event with failure result"
    (mt/with-temp [:model/Database db {:engine :postgres}
                   :model/Table table {:db_id (:id db) :name "users" :schema "public"}
                   :model/Field _ {:table_id (:id table) :name "id" :base_type :type/Integer}]
      (mt/with-temporary-setting-values [llm-anthropic-api-key "sk-ant-test"]
        (snowplow-test/with-fake-snowplow-collector
          (with-redefs [llm.anthropic/chat-completion (fn [_] (throw (Exception. "API error")))]
            (mt/user-http-request :rasta :post 500 "llm/generate-sql"
                                  {:prompt              "get all users"
                                   :database_id         (:id db)
                                   :referenced_entities [{:model "table" :id (:id table)}]})
            (let [events        (snowplow-test/pop-event-data-and-user-id!)
                  token-events  (filter token-usage-event? events)
                  simple-events (filter simple-event? events)]
              (testing "no token_usage event on failure (chat-completion call failed)"
                (is (empty? token-events)))
              (testing "simple_event with failure result"
                (is (=? [{:data {"event"        "metabot_oss_sqlgen_used"
                                 "duration_ms"  int?
                                 "result"       "failure"
                                 "event_detail" "postgres"}}]
                        simple-events))))))))))

;;; ------------------------------------------- Token Usage Tracking Tests -------------------------------------------

(deftest track-token-usage-with-uuid-test
  (testing "tracks usage with analytics uuid when no premium token is available"
    (let [test-analytics-uuid "test-analytics-uuid-12345"]
      (mt/with-temporary-setting-values [premium-embedding-token nil
                                         analytics-uuid test-analytics-uuid]
        (snowplow-test/with-fake-snowplow-collector
          (#'api/track-token-usage! {:model       "claude-sonnet-4-5-20250929"
                                     :prompt      1000
                                     :completion  500
                                     :duration-ms 1234
                                     :user-id     42
                                     :source      "oss_metabot"
                                     :tag         "oss-sqlgen"})
          (is (=? [{:user-id "42"
                    :data    {"hashed_metabase_license_token" (str "oss__" test-analytics-uuid)
                              "request_id"                    #"[a-h0-9]{32}" ; UUID hex format (no dashes)
                              "model_id"                      "claude-sonnet-4-5-20250929"
                              "total_tokens"                  1500
                              "prompt_tokens"                 1000
                              "completion_tokens"             500
                              "estimated_costs_usd"           #(and (number? %) (pos? %))
                              "duration_ms"                   1234
                              "source"                        "oss_metabot"
                              "tag"                           "oss-sqlgen"}}]
                  (->> (snowplow-test/pop-event-data-and-user-id!)
                       (filter token-usage-event?)))))))))

(deftest track-token-usage-with-premium-token-test
  (testing "hashes premium token when available"
    (mt/with-random-premium-token! [premium-token]
      (mt/with-temporary-setting-values [premium-embedding-token premium-token]
        (snowplow-test/with-fake-snowplow-collector
          (#'api/track-token-usage! {:model       "claude-sonnet-4-5-20250929"
                                     :prompt      100
                                     :completion  50
                                     :duration-ms 100
                                     :user-id     1
                                     :source      "test"
                                     :tag         "test"})
          ;; Should be a SHA-256 hash (64 hex chars), not "oss__*"
          (is (=? [{:data {"hashed_metabase_license_token" #"[0-9a-f]{64}"}}]
                  (->> (snowplow-test/pop-event-data-and-user-id!)
                       (filter token-usage-event?)))))))))

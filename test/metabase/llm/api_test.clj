(ns metabase.llm.api-test
  (:require
   [clojure.core.async :as a]
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.analytics.core :as analytics]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.llm.anthropic :as llm.anthropic]
   [metabase.llm.api :as api]
   [metabase.llm.context :as llm.context]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]
   [metabase.test.util :as tu]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------- parse-sql-response Tests -------------------------------------------

(deftest parse-sql-response-test
  (testing "map input extracts :sql key"
    (is (= "SELECT 1" (#'api/parse-sql-response {:sql "SELECT 1" :explanation "..."}))))

  (testing "valid JSON string parses and extracts :sql"
    (is (= "SELECT 1" (#'api/parse-sql-response "{\"sql\": \"SELECT 1\"}"))))

  (testing "invalid JSON returns raw string (current behavior)"
    (is (= "not json" (#'api/parse-sql-response "not json"))))

  (testing "map without :sql key returns nil"
    (is (nil? (#'api/parse-sql-response {:explanation "no sql here"}))))

  (testing "nil input returns nil"
    (is (nil? (#'api/parse-sql-response nil))))

  (testing "empty string returns nil (JSON decode returns nil)"
    (is (nil? (#'api/parse-sql-response "")))))

;;; ------------------------------------------- database-dialect Tests -------------------------------------------

(deftest database-dialect-test
  (mt/with-temp [:model/Database postgres-db {:engine :postgres}
                 :model/Database mysql-db   {:engine :mysql}
                 :model/Database bigquery-db {:engine :bigquery}
                 :model/Database custom-db  {:engine :customdb}]
    (testing "known engine returns mapped dialect name"
      (is (= "PostgreSQL" (#'api/database-dialect (:id postgres-db))))
      (is (= "MySQL" (#'api/database-dialect (:id mysql-db))))
      (is (= "BigQuery" (#'api/database-dialect (:id bigquery-db)))))

    (testing "unknown engine capitalizes keyword name"
      (is (= "Customdb" (#'api/database-dialect (:id custom-db)))))

    (testing "nil database returns fallback"
      (is (= "SQL" (#'api/database-dialect nil))))

    (testing "non-existent database returns fallback"
      (is (= "SQL" (#'api/database-dialect 99999999))))))

;;; ------------------------------------------- load-dialect-instructions Tests -------------------------------------------

(deftest load-dialect-instructions-test
  (testing "known engine with file returns content"
    (let [instructions (#'api/load-dialect-instructions :postgres)]
      (is (string? instructions))
      (is (str/includes? instructions "PostgreSQL"))))

  (testing "bigquery-cloud-sdk engine loads bigquery instructions"
    (let [instructions (#'api/load-dialect-instructions :bigquery-cloud-sdk)]
      (is (string? instructions))
      (is (str/includes? instructions "BigQuery"))))

  (testing "unknown engine returns nil"
    (is (nil? (#'api/load-dialect-instructions :totally-unknown))))

  (testing "nil engine returns nil"
    (is (nil? (#'api/load-dialect-instructions nil)))))

;;; ------------------------------------------- engine->dialect-file mapping Tests -------------------------------------------

(deftest engine-dialect-mapping-completeness-test
  (testing "all engines in dialect-file map have corresponding resource files"
    (let [engine->dialect-file @#'api/engine->dialect-file]
      (doseq [[engine dialect-file] engine->dialect-file]
        (let [resource-path (str "llm/prompts/dialects/" dialect-file ".md")]
          (is (some? (io/resource resource-path))
              (str "Engine " engine " maps to " dialect-file " but resource " resource-path " not found")))))))

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
      (mt/with-temporary-setting-values [llm-anthropic-api-key "sk-test"]
        (let [response (mt/user-http-request :rasta :post 400 "llm/generate-sql"
                                             {:prompt "no table mentions here"
                                              :database_id (:id db)})]
          (is (str/includes? (str response) "No tables found")))))))

;;; ------------------------------------------- Snowplow Tests -------------------------------------------

(deftest generate-sql-snowplow-success-test
  (testing "successful /generate-sql call tracks both token_usage and simple_event"
    (mt/with-temp [:model/Database db {:engine :postgres}
                   :model/Table table {:db_id (:id db) :name "users" :schema "public"}
                   :model/Field _ {:table_id (:id table) :name "id" :base_type :type/Integer}
                   :model/Field _ {:table_id (:id table) :name "name" :base_type :type/Text}]
      (let [tracked-events (atom [])
            mock-chat-response {:result {:sql "SELECT * FROM users"}
                                :usage {:model "anthropic/claude-sonnet-4-5"
                                        :prompt 1000
                                        :completion 200}
                                :duration-ms 500}]
        (mt/with-temporary-setting-values [llm-anthropic-api-key "sk-test"]
          (with-redefs [llm.anthropic/chat-completion (constantly mock-chat-response)
                        snowplow/track-event! (fn [schema data user-id]
                                                (swap! tracked-events conj {:schema schema
                                                                            :data data
                                                                            :user-id user-id}))]
            (let [response (mt/user-http-request :rasta :post 200 "llm/generate-sql"
                                                 {:prompt "get all users"
                                                  :database_id (:id db)
                                                  :referenced_entities [{:model "table" :id (:id table)}]})]
              (is (= "SELECT * FROM users" (:sql response)))
              (testing "token_usage event"
                (let [token-events (filter #(= :snowplow/token_usage (:schema %)) @tracked-events)]
                  (is (=? [{:schema :snowplow/token_usage
                            :data {:model-id "anthropic/claude-sonnet-4-5"
                                   :prompt-tokens 1000
                                   :completion-tokens 200
                                   :total-tokens 1200
                                   :duration-ms 500
                                   :source "oss_metabot"
                                   :tag "oss-sqlgen"}}]
                          token-events))))
              (testing "simple_event"
                (let [simple-events (filter #(= :snowplow/simple_event (:schema %)) @tracked-events)]
                  (is (=? [{:schema :snowplow/simple_event
                            :data {:event "metabot_oss_sqlgen_used"
                                   :duration_ms int?
                                   :result "success"
                                   :event_detail "postgres"}}]
                          simple-events)))))))))))

(deftest generate-sql-snowplow-failure-test
  (testing "failed /generate-sql call tracks simple_event with failure result"
    (mt/with-temp [:model/Database db {:engine :postgres}
                   :model/Table table {:db_id (:id db) :name "users" :schema "public"}
                   :model/Field _ {:table_id (:id table) :name "id" :base_type :type/Integer}]
      (let [tracked-events (atom [])]
        (mt/with-temporary-setting-values [llm-anthropic-api-key "sk-test"]
          (with-redefs [llm.anthropic/chat-completion (fn [_] (throw (Exception. "API error")))
                        snowplow/track-event! (fn [schema data user-id]
                                                (swap! tracked-events conj {:schema schema
                                                                            :data data
                                                                            :user-id user-id}))]
            (mt/user-http-request :rasta :post 500 "llm/generate-sql"
                                  {:prompt "get all users"
                                   :database_id (:id db)
                                   :referenced_entities [{:model "table" :id (:id table)}]})
            (testing "no token_usage event on failure (chat-completion call failed)"
              (let [token-events (filter #(= :snowplow/token_usage (:schema %)) @tracked-events)]
                (is (empty? token-events))))
            (testing "simple_event with failure result"
              (let [simple-events (filter #(= :snowplow/simple_event (:schema %)) @tracked-events)]
                (is (=? [{:schema :snowplow/simple_event
                          :data {:event "metabot_oss_sqlgen_used"
                                 :duration_ms int?
                                 :result "failure"
                                 :event_detail "postgres"}}]
                        simple-events))))))))))

(deftest generate-sql-streaming-snowplow-success-test
  (testing "successful /generate-sql-streaming call tracks both token_usage and simple_event"
    (mt/with-temp [:model/Database db {:engine :postgres}
                   :model/Table table {:db_id (:id db) :name "users" :schema "public"}
                   :model/Field _ {:table_id (:id table) :name "id" :base_type :type/Integer}
                   :model/Field _ {:table_id (:id table) :name "name" :base_type :type/Text}]
      (let [tracked-events (atom [])
            mock-chan (a/chan 10)]
        (a/>!! mock-chan {:type :usage :id "anthropic/claude-sonnet-4" :usage {:promptTokens 1500}})
        (a/>!! mock-chan {:type :text-delta :delta "{\"sql\":\"SELECT * FROM users\"}"})
        (a/>!! mock-chan {:type :usage :id "anthropic/claude-sonnet-4" :usage {:completionTokens 250}})
        (a/close! mock-chan)
        (mt/with-temporary-setting-values [llm-anthropic-api-key "sk-test"]
          (with-redefs [llm.anthropic/chat-completion-stream (constantly mock-chan)
                        snowplow/track-event! (fn [schema data user-id]
                                                (swap! tracked-events conj {:schema schema
                                                                            :data data
                                                                            :user-id user-id}))]
            (let [response (mt/user-http-request :rasta :post 202 "llm/generate-sql-streaming"
                                                 {:prompt "get all users"
                                                  :database_id (:id db)
                                                  :referenced_entities [{:model "table" :id (:id table)}]})]
              ;; Wait for the background thread to complete tracking
              (tu/poll-until 2000 (>= (count @tracked-events) 2))
              (is (string? response))
              (is (str/includes? response "SELECT * FROM users"))
              (testing "token_usage event"
                (let [token-events (filter #(= :snowplow/token_usage (:schema %)) @tracked-events)]
                  (is (=? [{:schema :snowplow/token_usage
                            :data {:model-id "anthropic/claude-sonnet-4"
                                   :prompt-tokens 1500
                                   :completion-tokens 250
                                   :total-tokens 1750
                                   :duration-ms int?
                                   :source "oss_metabot"
                                   :tag "oss-sqlgen-streaming"}}]
                          token-events))))
              (testing "simple_event"
                (let [simple-events (filter #(= :snowplow/simple_event (:schema %)) @tracked-events)]
                  (is (=? [{:schema :snowplow/simple_event
                            :data {:event "metabot_oss_sqlgen_used"
                                   :duration_ms int?
                                   :result "success"
                                   :event_detail "postgres"}}]
                          simple-events)))))))))))

(deftest generate-sql-streaming-snowplow-failure-test
  (testing "streaming error tracks simple_event with failure result"
    (mt/with-temp [:model/Database db {:engine :postgres}
                   :model/Table table {:db_id (:id db) :name "users" :schema "public"}
                   :model/Field _ {:table_id (:id table) :name "id" :base_type :type/Integer}]
      (let [tracked-events (atom [])
            mock-chan (a/chan 10)]
        (a/>!! mock-chan {:type :error :error "API rate limit exceeded"})
        (a/close! mock-chan)
        (mt/with-temporary-setting-values [llm-anthropic-api-key "sk-test"]
          (with-redefs [llm.anthropic/chat-completion-stream (constantly mock-chan)
                        snowplow/track-event! (fn [schema data user-id]
                                                (swap! tracked-events conj {:schema schema
                                                                            :data data
                                                                            :user-id user-id}))]
            (let [response (mt/user-http-request :rasta :post 202 "llm/generate-sql-streaming"
                                                 {:prompt "get all users"
                                                  :database_id (:id db)
                                                  :referenced_entities [{:model "table" :id (:id table)}]})]
              ;; Wait for the background thread to complete
              (tu/poll-until 2000 (seq @tracked-events))
              (is (string? response))
              (testing "no token_usage event on error"
                (let [token-events (filter #(= :snowplow/token_usage (:schema %)) @tracked-events)]
                  (is (empty? token-events))))
              (testing "simple_event with failure result"
                (let [simple-events (filter #(= :snowplow/simple_event (:schema %)) @tracked-events)]
                  (is (=? [{:schema :snowplow/simple_event
                            :data {:event "metabot_oss_sqlgen_used"
                                   :duration_ms int?
                                   :result "failure"
                                   :event_detail "postgres"}}]
                          simple-events)))))))))))

;;; ------------------------------------------- Token Usage Tracking Tests -------------------------------------------

(deftest track-token-usage-with-uuid-test
  (testing "tracks usage with analytics uuid when no premium token is available"
    (let [tracked-events (atom [])
          test-analytics-uuid "test-analytics-uuid-12345"]
      (with-redefs [snowplow/track-event! (fn [schema data user-id]
                                            (swap! tracked-events conj {:schema schema
                                                                        :data data
                                                                        :user-id user-id}))
                    premium-features/premium-embedding-token (constantly nil)
                    analytics/analytics-uuid (constantly test-analytics-uuid)]
        (#'api/track-token-usage! {:model "anthropic/claude-sonnet-4-5"
                                   :prompt 1000
                                   :completion 500
                                   :duration-ms 1234
                                   :user-id 42
                                   :source "oss_metabot"
                                   :tag "oss-sqlgen"})
        (is (= 1 (count @tracked-events)))
        (let [{:keys [schema data user-id]} (first @tracked-events)]
          (is (= :snowplow/token_usage schema))
          (is (= 42 user-id))
          (is (=? {:hashed-metabase-license-token (str "oss__" test-analytics-uuid)
                   :request-id #"[a-h0-9]{32}" ; UUID hex format (no dashes)
                   :model-id "anthropic/claude-sonnet-4-5"
                   :total-tokens 1500
                   :prompt-tokens 1000
                   :completion-tokens 500
                   :estimated-costs-usd pos?
                   :duration-ms 1234
                   :source "oss_metabot"
                   :tag "oss-sqlgen"}
                  data)))))))

(deftest track-token-usage-with-premium-token-test
  (testing "hashes premium token when available"
    (let [tracked-events (atom [])]
      (with-redefs [snowplow/track-event! (fn [schema data user-id]
                                            (swap! tracked-events conj {:schema schema
                                                                        :data data
                                                                        :user-id user-id}))
                    premium-features/premium-embedding-token (constantly "test-premium-token")]
        (#'api/track-token-usage! {:model "anthropic/claude-sonnet-4-5"
                                   :prompt 100
                                   :completion 50
                                   :duration-ms 100
                                   :user-id 1
                                   :source "test"
                                   :tag "test"})
        (let [{:keys [data]} (first @tracked-events)]
          ;; Should be a SHA-256 hash (64 hex chars), not "oss__*"
          (is (=? {:hashed-metabase-license-token #"[0-9a-f]{64}"}
                  data)))))))

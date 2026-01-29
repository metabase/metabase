(ns metabase.llm.api-test
  (:require
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.llm.api :as api]
   [metabase.llm.context :as llm.context]
   [metabase.test :as mt]))

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

(deftest list-models-unconfigured-test
  (testing "Returns 403 when LLM is not configured"
    (mt/with-temporary-setting-values [llm-anthropic-api-key nil]
      (let [response (mt/user-http-request :rasta :get 403 "llm/list-models")]
        (is (str/includes? (str response) "not configured"))))))

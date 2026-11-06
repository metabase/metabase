(ns metabase-enterprise.monitor-relay.sql-test
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.monitor-relay.rows :as relay.rows]
   [metabase-enterprise.monitor-relay.sql :as relay.sql]
   [metabase.app-db.encryption :as mdb.encryption]
   [metabase.models.resolution :as models.resolution]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- top-level
  "The parts of `sql` outside parentheses, split at `separator`, a regex."
  [sql separator]
  (let [depths (reductions + 0 (map #(case % \( 1 \) -1 0) sql))
        masked (apply str (map (fn [c depth] (if (pos? depth) \_ c)) sql depths))]
    (loop [[m & more] (re-seq separator masked), from 0, parts []]
      (if m
        (let [at (str/index-of masked m from)]
          (recur more (+ at (count m)) (conj parts (subs sql from at))))
        (conj parts (subs sql from))))))

(defn- aliases
  "The column names a SELECT gives its rows, in order."
  [sql]
  (let [select (subs (first (top-level sql #" FROM ")) (count "SELECT "))]
    (for [column (top-level select #",\s*")]
      (or (second (re-find #"(?i)\sAS\s+(\S+)$" (str/trim column)))
          (last (str/split (str/trim column) #"\."))))))

(def ^:private stream-columns
  "Each stream's row shape, from the Monitor's `spec/data/ingestion/rows.yaml`, and the change log's."
  {:change    ["id" "table_name" "row_id" "action"]
   :execution ["event_id" "started_at" "running_ms" "result_rows" "is_native_flag" "context" "has_error"
               "database_id" "user_id" "user_email" "is_superuser" "is_active" "sso_source" "card_id" "card_name"
               "collection_id" "card_is_public" "dashboard_id" "dashboard_name" "pulse_id" "is_sandboxed"
               "embedding_client" "ip" "user_agent" "sanitized_user_agent" "auth_method" "embedding_route"
               "embedding_client_identifier" "embedding_hostname" "embedding_path" "embedding_sdk_version"
               "metabase_version" "is_impersonated" "is_db_routed" "qe_tenant_id" "cache_hit" "error_text" "action_id"
               "parameters" "database_name" "database_engine" "query_payload" "query_hash"]
   :login     ["event_id" "ts" "user_id" "session_id" "device_id" "user_agent" "ip"]
   :view      ["event_id" "ts" "user_id" "model" "model_id" "has_access" "context" "embedding_client"
               "embedding_client_identifier" "embedding_route" "embedding_sdk_version" "auth_method" "tenant_id"
               "embedding_hostname" "embedding_path" "user_agent" "sanitized_user_agent" "ip" "metabase_version"]
   :audit     ["event_id" "ts" "topic" "user_id" "model" "model_id" "details_json"]})

(deftest ^:parallel stream-shape-test
  (doseq [stream relay.sql/streams]
    (testing (str stream)
      (is (= (stream-columns stream) (aliases (relay.sql/stream-page-sql stream)))))))

(deftest ^:parallel stream-cursor-test
  (testing "a page reads above an id, in id order, up to a limit; a gap read reads ranges"
    (is (str/ends-with? (relay.sql/stream-page-sql :login) " WHERE lh.id > ? ORDER BY lh.id LIMIT ?"))
    (is (str/ends-with? (relay.sql/stream-ranges-sql :execution 2)
                        (str " WHERE qe.id BETWEEN ? AND ? AND ((qe.id BETWEEN ? AND ?) OR (qe.id BETWEEN ? AND ?))"
                             " ORDER BY qe.id LIMIT ?")))))

(deftest ^:parallel history-floor-sql-test
  (testing "a stream with an index on its time reads its earliest row at or after a time by that index"
    (is (= "SELECT lh.id AS id FROM login_history lh WHERE lh.timestamp >= ? ORDER BY lh.timestamp LIMIT 1"
           (relay.sql/time-floor-sql :login)))
    (is (= "SELECT qe.id AS id FROM query_execution qe WHERE qe.started_at >= ? ORDER BY qe.started_at LIMIT 1"
           (relay.sql/time-floor-sql :execution))))
  (testing "audit_log reads the first row at or above an id, and whether its time is at or after a time"
    (is (= (str "SELECT al.id AS id, CASE WHEN al.timestamp >= ? THEN 1 ELSE 0 END AS is_after"
                " FROM audit_log al WHERE al.id >= ? ORDER BY al.id LIMIT 1")
           (relay.sql/first-row-sql :audit)))))

(def ^:private state-columns
  "Each state kind's row shape, from the Monitor's `spec/data/ingestion/rows.yaml`, after `id`."
  {:card                      ["card_id" "name" "collection_id" "database_id" "query_type" "dataset_query" "public_uuid"
                               "made_public_by_id" "archived" "type"]
   :dashboard                 ["dashboard_id" "name" "collection_id" "public_uuid" "made_public_by_id" "archived"]
   :database                  ["database_id" "database_name" "database_engine" "active"]
   :field                     ["field_id" "table_id" "table_name" "schema_name" "database_id" "field_name" "active"
                               "data_sensitivity" "semantic_type"]
   :field_user_settings       ["field_id" "data_sensitivity" "semantic_type" "semantic_type_set"]
   :group                     ["group_id" "name"]
   :group_membership          ["group_id" "user_id" "present"]
   :notification              ["notification_id" "created_at" "updated_at" "creator_id" "active" "card_id"
                               "send_condition"]
   :notification_handler      ["handler_id" "notification_id" "channel_type"]
   :notification_recipient    ["handler_id" "type" "email" "details"]
   :notification_subscription ["notification_id" "cron_schedule"]
   :pulse                     ["pulse_id" "creator_id" "dashboard_id"]
   :pulse_card                ["pulse_id" "card_id" "include_csv" "include_xls"]
   :pulse_channel             ["channel_id" "pulse_id" "channel_type" "details"]
   :pulse_channel_recipient   ["channel_id" "email"]
   :snippet                   ["snippet_id" "name" "content" "collection_id" "archived"]
   :table                     ["table_id" "name" "schema_name" "database_id" "active" "visibility_type"
                               "estimated_row_count"]
   :tenant                   ["tenant_id" "name"]
   :user                      ["user_id" "email" "first_name" "last_name" "is_superuser" "is_active" "sso_source"
                               "locale" "date_joined" "tenant_id" "login_attributes" "user_type" "last_login"]})

(deftest ^:parallel state-shape-test
  (testing "every kind the Monitor snapshots has a query, and the field user settings too; settings come with /sync"
    (is (= 19 (count relay.sql/state-kinds)))
    (is (not (contains? relay.sql/state-kinds :setting))))
  (doseq [engine [:postgres :mysql]
          [kind columns] state-columns]
    (testing (str engine " " kind ": the key first as id")
      (is (= (cons "id" columns)
             (aliases (first (relay.sql/state-query engine kind [:page 0 10]))))))))

(deftest ^:parallel state-read-test
  (testing "a snapshot pages by key; a change page reads the rows whose column is in the ids the log names"
    (is (= [7 10] (rest (relay.sql/state-query :postgres :group [:page 7 10]))))
    (is (= [1 2 3] (rest (relay.sql/state-query :postgres :group [:in "g.id" [1 2 3]]))))
    (is (str/ends-with? (first (relay.sql/state-query :postgres :field [:in "f.table_id" [4 5]]))
                        " WHERE f.table_id IN (?, ?)"))))

(deftest ^:parallel table-kinds-test
  (testing "each table names kinds the relay knows"
    (doseq [[table reads] relay.sql/table-kinds
            [kind _column] reads]
      (is (contains? relay.sql/state-kinds kind) table)))
  (testing "every kind is read again when a row of its own table changes"
    (is (= relay.sql/state-kinds
           (set (for [[_ reads] relay.sql/table-kinds
                      [kind column] reads
                      :when (= column (relay.sql/state-id kind))]
                  kind))))))

(deftest table-kinds-logged-test
  (testing "Metabase logs the changes of every table the relay maps: a model of each derives :hook/change-log"
    ;; A model derives the hook when its namespace loads, and Metabase loads some only when they are first used.
    (run! t2/resolve-model (keys models.resolution/model->namespace))
    (let [mapped (set (keys relay.sql/table-kinds))
          logged (into #{}
                       (comp (filter #(= "model" (namespace %))) (map (comp name t2/table-name)))
                       (descendants :hook/change-log))]
      (is (set/subset? mapped logged)
          (str "No model derives :hook/change-log for " (str/join ", " (sort (set/difference mapped logged))))))))

(deftest ^:parallel sequences-sql-test
  (testing "Postgres finds each stream's id sequence, then reads the sequences in one statement"
    (is (= "SELECT pg_get_serial_sequence('change_log', 'id') AS change"
           (first (str/split (relay.sql/postgres-sequence-names-sql) #", (?=pg_get)"))))
    (is (= (str "SELECT 'login' AS stream, last_value, is_called FROM public.login_history_id_seq"
                " UNION ALL SELECT 'execution' AS stream, last_value, is_called FROM public.query_execution_id_seq")
           (relay.sql/postgres-sequences-sql {:login     "public.login_history_id_seq"
                                              :execution "public.query_execution_id_seq"}))))
  (testing "MySQL reads the next auto-increment value of the streams' tables, which the parameters name"
    (is (str/ends-with? (relay.sql/mysql-auto-increments-sql [:login :view]) " AND table_name IN (?, ?)"))))

(defn- read-columns
  "The `[table column name]` of each column that the SELECT `sql` reads as it is, such as
  `[\"report_card\" \"public_uuid\" \"public_uuid\"]` for `c.public_uuid AS public_uuid` from `report_card c`."
  [sql]
  (let [tables (into {} (map (fn [[_ table a]] [a table])) (re-seq #"(?:FROM|JOIN) (\w+)(?: AS)? (\w+)" sql))
        select (subs (first (top-level sql #" FROM ")) (count "SELECT "))]
    (for [item  (top-level select #",\s*")
          :let  [[_ a column as] (re-matches #"(\w+)\.(\w+)(?: AS (\w+))?" (str/trim item))]
          :when a]
      [(tables a) column (or as column)])))

(defn- undecrypted
  "The `[kind name]` of each column that the relay reads as it is from one of `encrypted`, a set of `[table column]`,
  and does not decrypt."
  [encrypted]
  (set (for [[kind sql]          (concat (for [stream relay.sql/streams]
                                           [stream (relay.sql/stream-page-sql stream)])
                                         (for [kind relay.sql/state-kinds]
                                           [kind (first (relay.sql/state-query :postgres kind [:page 0 1]))]))
             [table column as]   (read-columns sql)
             :when               (and (encrypted [table column])
                                      (not (contains? (@#'relay.rows/encrypted-columns kind) (keyword as))))]
         [kind (keyword as)])))

(deftest ^:parallel encrypted-columns-test
  (testing "the relay decrypts every column it reads as it is from a column that Metabase encrypts"
    (is (= #{} (undecrypted (set (map #(mapv name %) @#'mdb.encryption/encrypted-string-columns))))))
  (testing "so a column that Metabase starts to encrypt fails this test"
    (is (contains? (undecrypted #{["core_user" "email"]}) [:user :email]))
    (is (contains? (undecrypted #{["metabase_table" "name"]}) [:field :table_name]))))

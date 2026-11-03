(ns metabase-enterprise.monitor-relay.sql-test
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.monitor-relay.sql :as relay.sql]
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
      (-> (or (second (re-find #"(?i)\sAS\s+(\S+)$" (str/trim column)))
              (last (str/split (str/trim column) #"\.")))
          (str/replace "`" "")))))

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
  (doseq [engine [:postgres :mysql]
          stream relay.sql/streams]
    (testing (str engine " " stream)
      (is (= (stream-columns stream) (aliases (relay.sql/stream-page-sql engine stream))))
      (is (= (stream-columns stream) (aliases (relay.sql/stream-range-sql engine stream)))))))

(deftest ^:parallel stream-cursor-test
  (testing "a page reads above an id, in id order, up to a limit; a gap read reads a range"
    (is (str/ends-with? (relay.sql/stream-page-sql :postgres :login) " WHERE lh.id > ? ORDER BY lh.id LIMIT ?"))
    (is (str/ends-with? (relay.sql/stream-range-sql :mysql :execution)
                        " WHERE qe.id BETWEEN ? AND ? ORDER BY qe.id LIMIT ?"))))

(deftest ^:parallel history-floor-sql-test
  (testing "a stream with an index on its time reads its earliest row at or after a time by that index"
    (is (= "SELECT lh.id AS id FROM login_history lh WHERE lh.timestamp >= ? ORDER BY lh.timestamp LIMIT 1"
           (relay.sql/time-floor-sql :postgres :login)))
    (is (= (str "SELECT qe.id AS id FROM query_execution qe"
                " WHERE qe.`started_at` >= ? ORDER BY qe.`started_at` LIMIT 1")
           (relay.sql/time-floor-sql :mysql :execution))))
  (testing "audit_log reads the first row at or above an id, and whether its time is at or after a time"
    (is (= (str "SELECT al.id AS id, CASE WHEN al.timestamp >= ? THEN 1 ELSE 0 END AS is_after"
                " FROM audit_log al WHERE al.id >= ? ORDER BY al.id LIMIT 1")
           (relay.sql/first-row-sql :postgres :audit)))
    (is (str/includes? (relay.sql/first-row-sql :mysql :audit) "CASE WHEN al.`timestamp` >= ? THEN 1"))))

(deftest ^:parallel engine-differences-test
  (testing "the query hash is lower-case hex on both engines"
    (is (str/includes? (relay.sql/stream-page-sql :postgres :execution) "encode(qe.hash, 'hex') AS query_hash"))
    (is (str/includes? (relay.sql/stream-page-sql :mysql :execution) "LOWER(HEX(qe.hash)) AS query_hash")))
  (testing "MySQL quotes its reserved words"
    (is (str/includes? (relay.sql/stream-page-sql :mysql :audit) "al.`timestamp` AS ts"))
    (is (str/includes? (relay.sql/stream-page-sql :postgres :audit) "al.timestamp AS ts"))
    (is (str/includes? (first (relay.sql/state-query :mysql :notification_recipient [:in "nr.id" [1]]))
                       "nr.`type` AS `type`"))
    (is (str/includes? (first (relay.sql/state-query :mysql :user [:in "u.id" [1]])) "u.`type` AS user_type"))))

(def ^:private state-columns
  "Each state kind's row shape, from the Monitor's `spec/data/ingestion/rows.yaml`, after `id`."
  {:card                      ["card_id" "name" "collection_id" "database_id" "query_type" "dataset_query" "public_uuid"
                               "made_public_by_id" "archived" "type"]
   :dashboard                 ["dashboard_id" "name" "collection_id" "public_uuid" "made_public_by_id" "archived"]
   :database                  ["database_id" "database_name" "database_engine" "active"]
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
   :tenant                    ["tenant_id" "name"]
   :user                      ["user_id" "email" "first_name" "last_name" "is_superuser" "is_active" "sso_source"
                               "locale" "date_joined" "tenant_id" "login_attributes" "user_type" "last_login"]})

(deftest ^:parallel state-shape-test
  (testing "every kind the Monitor snapshots has a query, and the field user settings too; settings come with /sync"
    (is (= 19 (count relay.sql/state-kinds)))
    (is (= (set relay.sql/state-kinds) (set (keys relay.sql/state-id))))
    (is (not (contains? relay.sql/state-kinds :setting))))
  (doseq [engine [:postgres :mysql]
          [kind columns] state-columns]
    (testing (str engine " " kind ": the key first as id")
      (is (= (cons "id" columns)
             (aliases (first (relay.sql/state-query engine kind [:page 0 10]))))))))

(deftest ^:parallel state-id-test
  (testing "each kind's key is the expression its rows carry as id"
    (doseq [kind (keys state-columns)]
      (is (str/starts-with? (first (relay.sql/state-query :postgres kind [:page 0 10]))
                            (str "SELECT " (relay.sql/state-id kind) " AS id, "))
          kind))
    (is (= "fus.field_id" (relay.sql/state-id :field_user_settings)))))

(deftest ^:parallel state-read-test
  (let [query #(first (relay.sql/state-query %1 %2 %3))]
    (testing "a snapshot pages by key; a change page reads the rows whose column is in the ids the log names"
      (is (str/ends-with? (query :postgres :group [:page 0 10])
                          " FROM permissions_group g WHERE g.id >= ? ORDER BY g.id LIMIT ?"))
      (is (str/ends-with? (query :postgres :group [:in "g.id" [1 2 3]]) " WHERE g.id IN (?, ?, ?)"))
      (is (str/ends-with? (query :postgres :notification_recipient [:in "nr.user_id" [4]]) " WHERE nr.user_id IN (?)"))
      (is (= [7 10] (rest (relay.sql/state-query :postgres :group [:page 7 10]))))
      (is (= [1 2 3] (rest (relay.sql/state-query :postgres :group [:in "g.id" [1 2 3]])))))
    (testing "the two kinds with a filter apply it to every read"
      (is (str/includes? (query :postgres :notification [:page 0 10])
                         " WHERE n.payload_type = 'notification/card' AND n.id >= ?"))
      (is (str/includes? (query :postgres :notification [:in "n.payload_id" [3]])
                         " WHERE n.payload_type = 'notification/card' AND n.payload_id IN (?)"))
      (is (str/includes? (query :mysql :notification_subscription [:in "ns.id" [1]])
                         " WHERE ns.`type` = 'notification-subscription/cron' AND ns.id IN (?)")))))

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

(deftest ^:parallel overlay-state-test
  (testing "fields and tables read through the overlay, which merges the values users set"
    (doseq [kind [:field :table]]
      (let [query (relay.sql/state-query :postgres kind [:page 0 10])]
        (is (map? query))
        (is (vector? (first (:from query))))))
    (is (= [:id :field_id :table_id :table_name :schema_name :database_id :field_name :active :data_sensitivity
            :semantic_type]
           (map second (:select (relay.sql/state-query :postgres :field [:page 0 10])))))
    (is (= [:id :table_id :name :schema_name :database_id :active :visibility_type :estimated_row_count]
           (map second (:select (relay.sql/state-query :mysql :table [:page 0 10]))))))
  (testing "their reads restrict the merged rows by key, or by the column a change names"
    (is (=? {:where [:>= :f.id 256], :order-by [:f.id], :limit 300}
            (relay.sql/state-query :postgres :field [:page 256 300])))
    (is (=? {:where [:in :f.table_id [4 5]]} (relay.sql/state-query :postgres :field [:in "f.table_id" [4 5]])))
    (is (=? {:where [:in :t.id [3]]} (relay.sql/state-query :mysql :table [:in "t.id" [3]])))))

(deftest ^:parallel sequences-sql-test
  (testing "Postgres finds each stream's id sequence, then reads the sequences in one statement"
    (is (= "SELECT pg_get_serial_sequence('change_log', 'id') AS change"
           (first (str/split (relay.sql/postgres-sequence-names-sql) #", (?=pg_get)"))))
    (is (= (str "SELECT 'login' AS stream, last_value, is_called FROM public.login_history_id_seq"
                " UNION ALL SELECT 'execution' AS stream, last_value, is_called FROM public.query_execution_id_seq")
           (relay.sql/postgres-sequences-sql {:login     "public.login_history_id_seq"
                                              :execution "public.query_execution_id_seq"}))))
  (testing "MySQL reads the next auto-increment value of the streams' tables"
    (is (str/includes? (relay.sql/mysql-auto-increments-sql relay.sql/streams)
                       "table_name IN ('change_log', 'login_history', 'query_execution', 'view_log', 'audit_log')"))
    (is (str/ends-with? (relay.sql/mysql-auto-increments-sql [:view]) "table_name IN ('view_log')"))))

(deftest ^:parallel capability-tables-test
  (testing "the capabilities read every notification table"
    (is (every? (set relay.sql/capability-tables) relay.sql/notification-tables))))

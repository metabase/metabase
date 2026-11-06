(ns metabase-enterprise.monitor-relay.sql
  "The queries the relay reads the app DB with, for `:postgres` and `:mysql` (MySQL and MariaDB). Each row has the
  columns that Metabase Monitor expects, which `sql-test` pins. The engines differ only in how a user's times become
  text. Placeholders are JDBC `?`.

  `metabase-enterprise.monitor-relay.db-test/every-read-test` reads every stream and state kind on a Postgres or MySQL
  app DB, so a migration that renames or drops a column the relay reads fails it."
  (:require
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(defn- in-list
  "A parenthesized list of `n` placeholders."
  [n]
  (str "(" (str/join ", " (repeat n "?")) ")"))

;;; ------------------------------------------------- fact streams -------------------------------------------------

(def streams
  "The streams, in the order the relay sends them: the change log, then the facts, logins before executions."
  [:change :login :execution :view :audit])

(def stream-table
  "The app-DB table each stream reads."
  {:change    "change_log"
   :execution "query_execution"
   :login     "login_history"
   :view      "view_log"
   :audit     "audit_log"})

(def ^:private stream-alias
  {:change "cl", :execution "qe", :login "lh", :view "vl", :audit "al"})

(defn row-id
  "The key of the id in the rows of `stream`."
  [stream]
  (if (= :change stream) :id :event_id))

(def ^:private change-select
  "SELECT cl.id AS id, cl.table_name AS table_name, cl.row_id AS row_id, cl.action AS action FROM change_log cl")

(def ^:private execution-select
  (str "SELECT qe.id AS event_id, qe.started_at AS started_at, qe.running_time AS running_ms,"
       " qe.result_rows AS result_rows, qe.native AS is_native_flag, qe.context AS context,"
       " qe.error IS NOT NULL AS has_error, qe.database_id AS database_id, qe.executor_id AS user_id,"
       " u.email AS user_email, u.is_superuser AS is_superuser, u.is_active AS is_active,"
       " u.sso_source AS sso_source, qe.card_id AS card_id, c.name AS card_name,"
       " c.collection_id AS collection_id, c.public_uuid IS NOT NULL AS card_is_public,"
       " qe.dashboard_id AS dashboard_id, d.name AS dashboard_name, qe.pulse_id AS pulse_id,"
       " qe.is_sandboxed AS is_sandboxed, qe.embedding_client AS embedding_client, qe.ip_address AS ip,"
       " qe.user_agent AS user_agent, qe.sanitized_user_agent AS sanitized_user_agent,"
       " qe.auth_method AS auth_method, qe.embedding_route AS embedding_route,"
       " qe.embedding_client_identifier AS embedding_client_identifier,"
       " qe.embedding_hostname AS embedding_hostname, qe.embedding_path AS embedding_path,"
       " qe.embedding_sdk_version AS embedding_sdk_version, qe.metabase_version AS metabase_version,"
       " qe.is_impersonated AS is_impersonated, qe.is_db_routed AS is_db_routed, qe.tenant_id AS qe_tenant_id,"
       " qe.cache_hit AS cache_hit, qe.error AS error_text, qe.action_id AS action_id,"
       " qe.parameters AS parameters, db.name AS database_name, db.engine AS database_engine,"
       " q.query AS query_payload, qe.hash AS query_hash"
       " FROM query_execution qe"
       " LEFT JOIN core_user u ON u.id = qe.executor_id"
       " LEFT JOIN report_card c ON c.id = qe.card_id"
       " LEFT JOIN report_dashboard d ON d.id = qe.dashboard_id"
       " LEFT JOIN metabase_database db ON db.id = qe.database_id"
       " LEFT JOIN query q ON q.query_hash = qe.hash"))

(def ^:private login-select
  (str "SELECT lh.id AS event_id, lh.timestamp AS ts, lh.user_id AS user_id,"
       " lh.session_id AS session_id, lh.device_id AS device_id, lh.device_description AS user_agent,"
       " lh.ip_address AS ip"
       " FROM login_history lh"))

(def ^:private view-select
  (str "SELECT vl.id AS event_id, vl.timestamp AS ts, vl.user_id AS user_id, vl.model AS model,"
       " vl.model_id AS model_id, COALESCE(vl.has_access, TRUE) AS has_access, vl.context AS context,"
       " vl.embedding_client AS embedding_client, vl.embedding_client_identifier AS embedding_client_identifier,"
       " vl.embedding_route AS embedding_route, vl.embedding_sdk_version AS embedding_sdk_version,"
       " vl.auth_method AS auth_method, vl.tenant_id AS tenant_id, vl.embedding_hostname AS embedding_hostname,"
       " vl.embedding_path AS embedding_path, vl.user_agent AS user_agent,"
       " vl.sanitized_user_agent AS sanitized_user_agent, vl.ip_address AS ip,"
       " vl.metabase_version AS metabase_version"
       " FROM view_log vl"))

(def ^:private audit-select
  (str "SELECT al.id AS event_id, al.timestamp AS ts, al.topic AS topic, al.user_id AS user_id,"
       " al.model AS model, al.model_id AS model_id, al.details AS details_json"
       " FROM audit_log al"))

(defn- stream-select [stream]
  (case stream
    :change    change-select
    :execution execution-select
    :login     login-select
    :view      view-select
    :audit     audit-select))

(defn stream-page-sql
  "SQL for the rows of `stream` with an id above the first parameter, in id order, at most the second parameter."
  [stream]
  (let [id (str (stream-alias stream) ".id")]
    (str (stream-select stream) " WHERE " id " > ? ORDER BY " id " LIMIT ?")))

(defn stream-ranges-sql
  "SQL for the rows of `stream` with an id in one of `n` ranges, in id order, at most the last parameter. The first two
  parameters are the lowest and the highest id of the ranges, then each range takes two, its first and its last id.
  `n` is at least 1. The outer bound keeps Postgres from scanning the id index from its start when it overestimates
  the rows in the ranges, as it does for a large range of mostly absent ids."
  [stream n]
  (let [id (str (stream-alias stream) ".id")]
    (str (stream-select stream) " WHERE " id " BETWEEN ? AND ? AND ("
         (str/join " OR " (repeat n (str "(" id " BETWEEN ? AND ?)")))
         ") ORDER BY " id " LIMIT ?")))

;;; ------------------------------------------------ history floors ------------------------------------------------

(def ^:private stream-time
  "The column that dates each stream's rows."
  {:execution "started_at", :login "timestamp", :view "timestamp", :audit "timestamp"})

(defn- time-column [stream]
  (str (stream-alias stream) "." (stream-time stream)))

(defn time-floor-sql
  "SQL for the `id` of the earliest row of `stream` whose time is at or after the parameter. It reads the time
  column's index, which `audit_log` does not have: see [[first-row-sql]]."
  [stream]
  (let [a  (stream-alias stream)
        ts (time-column stream)]
    (str "SELECT " a ".id AS id FROM " (stream-table stream) " " a " WHERE " ts " >= ? ORDER BY " ts " LIMIT 1")))

(defn first-row-sql
  "SQL for the `id` of the first row of `stream` with an id at or above the second parameter, and `is_after`: 1 when
  its time is at or after the first parameter, else 0."
  [stream]
  (let [a (stream-alias stream)]
    (str "SELECT " a ".id AS id, CASE WHEN " (time-column stream) " >= ? THEN 1 ELSE 0 END AS is_after"
         " FROM " (stream-table stream) " " a " WHERE " a ".id >= ? ORDER BY " a ".id LIMIT 1")))

;;; ------------------------------------------------- state kinds --------------------------------------------------

(defn- utc-text
  "The timestamp expression `x` as UTC text with milliseconds and `Z`, as `relay.rows` sends a timestamp. On MySQL, run
  it under the session time zone `+00:00`. The driver reads a MySQL `timestamp` in the JVM's time zone, not the
  session's, so the text is made in SQL."
  [engine x]
  (if (= engine :mysql)
    (str "CONCAT(LEFT(DATE_FORMAT(" x ", '%Y-%m-%dT%H:%i:%s.%f'), 23), 'Z')")
    x))

(defn- state-sql [engine kind]
  (case kind
    :card
    (str "SELECT c.id AS id, c.id AS card_id, c.name AS name, c.collection_id AS collection_id,"
         " c.database_id AS database_id, c.query_type AS query_type, c.dataset_query AS dataset_query,"
         " c.public_uuid AS public_uuid, c.made_public_by_id AS made_public_by_id, c.archived AS archived,"
         " c.type AS type FROM report_card c")

    :dashboard
    (str "SELECT d.id AS id, d.id AS dashboard_id, d.name AS name, d.collection_id AS collection_id,"
         " d.public_uuid AS public_uuid, d.made_public_by_id AS made_public_by_id, d.archived AS archived"
         " FROM report_dashboard d")

    :database
    (str "SELECT db.id AS id, db.id AS database_id, db.name AS database_name, db.engine AS database_engine,"
         " 1 AS active FROM metabase_database db")

    :field
    (str "SELECT f.id AS id, f.id AS field_id, f.table_id AS table_id, t.name AS table_name, t.schema AS schema_name,"
         " t.db_id AS database_id, f.name AS field_name, f.active AS active, f.data_sensitivity AS data_sensitivity,"
         " f.semantic_type AS semantic_type"
         " FROM metabase_field f JOIN metabase_table t ON t.id = f.table_id")

    :field_user_settings
    (str "SELECT fus.field_id AS id, fus.field_id AS field_id, fus.data_sensitivity AS data_sensitivity,"
         " fus.semantic_type AS semantic_type, fus.semantic_type_set AS semantic_type_set"
         " FROM metabase_field_user_settings fus")

    :group
    "SELECT g.id AS id, g.id AS group_id, g.name AS name FROM permissions_group g"

    :group_membership
    (str "SELECT m.id AS id, m.group_id AS group_id, m.user_id AS user_id, 1 AS present"
         " FROM permissions_group_membership m")

    :notification
    (str "SELECT n.id AS id, n.id AS notification_id, n.created_at AS created_at, n.updated_at AS updated_at,"
         " n.creator_id AS creator_id, n.active AS active, nc.card_id AS card_id, nc.send_condition AS send_condition"
         " FROM notification n"
         " JOIN notification_card nc ON nc.id = n.payload_id")

    :notification_handler
    (str "SELECT nh.id AS id, nh.id AS handler_id, nh.notification_id AS notification_id,"
         " nh.channel_type AS channel_type FROM notification_handler nh")

    :notification_recipient
    (str "SELECT nr.id AS id, nr.notification_handler_id AS handler_id,"
         " nr.type AS type, cu.email AS email, nr.details AS details"
         " FROM notification_recipient nr"
         " LEFT JOIN core_user cu ON cu.id = nr.user_id")

    :notification_subscription
    (str "SELECT ns.id AS id, ns.notification_id AS notification_id, ns.cron_schedule AS cron_schedule"
         " FROM notification_subscription ns")

    :pulse
    "SELECT p.id AS id, p.id AS pulse_id, p.creator_id AS creator_id, p.dashboard_id AS dashboard_id FROM pulse p"

    :pulse_card
    (str "SELECT pc.id AS id, pc.pulse_id AS pulse_id, pc.card_id AS card_id, pc.include_csv AS include_csv,"
         " pc.include_xls AS include_xls FROM pulse_card pc")

    :pulse_channel
    (str "SELECT pch.id AS id, pch.id AS channel_id, pch.pulse_id AS pulse_id, pch.channel_type AS channel_type,"
         " pch.details AS details FROM pulse_channel pch")

    :pulse_channel_recipient
    (str "SELECT pcr.id AS id, pcr.pulse_channel_id AS channel_id, u.email AS email"
         " FROM pulse_channel_recipient pcr JOIN core_user u ON u.id = pcr.user_id")

    :snippet
    (str "SELECT s.id AS id, s.id AS snippet_id, s.name AS name, s.content AS content,"
         " s.collection_id AS collection_id, s.archived AS archived FROM native_query_snippet s")

    :table
    (str "SELECT t.id AS id, t.id AS table_id, t.name AS name, t.schema AS schema_name, t.db_id AS database_id,"
         " t.active AS active, t.visibility_type AS visibility_type, t.estimated_row_count AS estimated_row_count"
         " FROM metabase_table t")

    :tenant
    "SELECT t.id AS id, t.id AS tenant_id, t.name AS name FROM tenant t"

    :user
    (str "SELECT u.id AS id, u.id AS user_id, u.email AS email, u.first_name AS first_name,"
         " u.last_name AS last_name, u.is_superuser AS is_superuser, u.is_active AS is_active,"
         " u.sso_source AS sso_source, u.locale AS locale, " (utc-text engine "u.date_joined") " AS date_joined,"
         " u.tenant_id, u.login_attributes, u.type AS user_type, "
         (utc-text engine "u.last_login") " AS last_login"
         " FROM core_user u")))

(def ^:private state-filter
  "The condition a row must meet to belong to its kind, for the kinds that have one."
  {:notification              "n.payload_type = 'notification/card'"
   :notification_subscription "ns.type = 'notification-subscription/cron'"})

(def state-id
  "Each state kind's key: the source table's integer key, which every row carries as `id`."
  {:card                      "c.id"
   :dashboard                 "d.id"
   :database                  "db.id"
   :field                     "f.id"
   :field_user_settings       "fus.field_id"
   :group                     "g.id"
   :group_membership          "m.id"
   :notification              "n.id"
   :notification_handler      "nh.id"
   :notification_recipient    "nr.id"
   :notification_subscription "ns.id"
   :pulse                     "p.id"
   :pulse_card                "pc.id"
   :pulse_channel             "pch.id"
   :pulse_channel_recipient   "pcr.id"
   :snippet                   "s.id"
   :table                     "t.id"
   :tenant                    "t.id"
   :user                      "u.id"})

(def state-kinds
  "The state kinds: the sets of rows that Metabase Monitor keeps a copy of."
  (set (keys state-id)))

(def table-kinds
  "Per table of the change log, the state kinds to read again when one of its rows changes, each with the column of the
  kind's query that holds that row's id. A change to `core_user` 42 reads `user` where `u.id` is 42, and the
  recipients where `nr.user_id` or `pcr.user_id` is 42, as they carry the user's email. Only a read by the kind's own
  key ([[state-id]]) finds ids gone: when user 42 is deleted, `user` lists 42 as gone, and the recipient kinds list
  nothing. A table that is not here changes no kind."
  {"core_user"                    [[:user "u.id"] [:notification_recipient "nr.user_id"]
                                   [:pulse_channel_recipient "pcr.user_id"]]
   "report_card"                  [[:card "c.id"]]
   "metabase_field"               [[:field "f.id"]]
   "metabase_field_user_settings" [[:field_user_settings "fus.field_id"]]
   "metabase_table"               [[:table "t.id"] [:field "f.table_id"]]
   "permissions_group"            [[:group "g.id"]]
   "permissions_group_membership" [[:group_membership "m.id"]]
   "report_dashboard"             [[:dashboard "d.id"]]
   "metabase_database"            [[:database "db.id"]]
   "native_query_snippet"         [[:snippet "s.id"]]
   "tenant"                       [[:tenant "t.id"]]
   "notification"                 [[:notification "n.id"]]
   "notification_card"            [[:notification "n.payload_id"]]
   "notification_handler"         [[:notification_handler "nh.id"]]
   "notification_recipient"       [[:notification_recipient "nr.id"]]
   "notification_subscription"    [[:notification_subscription "ns.id"]]
   "pulse"                        [[:pulse "p.id"]]
   "pulse_card"                   [[:pulse_card "pc.id"]]
   "pulse_channel"                [[:pulse_channel "pch.id"]]
   "pulse_channel_recipient"      [[:pulse_channel_recipient "pcr.id"]]})

(defn state-query
  "The `[sql & params]` query for the rows of state `kind` that `read` selects. `read` is one of:

  - `[:page from limit]`: the rows with a key at or above `from`, in key order, at most `limit`;
  - `[:in column ids]`: the rows whose `column`, one of the kind's in [[table-kinds]], is in `ids`, a non-empty
    collection."
  [engine kind [read & args]]
  (let [id              (state-id kind)
        [clause params] (case read
                          :page (let [[from limit] args] [(str id " >= ? ORDER BY " id " LIMIT ?") [from limit]])
                          :in   (let [[column ids] args] [(str column " IN " (in-list (count ids))) ids]))
        condition       (state-filter kind)]
    (into [(str (state-sql engine kind) " WHERE " (some-> condition (str " AND ")) clause)] params)))

;;; ------------------------------------------- capabilities and sequences ----------------------------------------

(defn recent-row-sql
  "SQL that returns a row when `table`, `view_log` or `audit_log`, has one whose time is after the parameter.
  `audit_log` has no index on its time, so for it the SQL checks only its newest row by id: its times grow with its
  ids."
  [table]
  (str "SELECT 1 AS x FROM " table " WHERE timestamp > ?"
       (if (= "audit_log" table) " AND id = (SELECT MAX(id) FROM audit_log)" " LIMIT 1")))

(defn change-oldest-sql
  "SQL for `id`, the change log's smallest id, or NULL when it is empty."
  []
  "SELECT MIN(id) AS id FROM change_log")

(defn postgres-sequence-names-sql
  "SQL for one row with, per stream, the name of its table's id sequence, quoted as Postgres quotes it."
  []
  (str "SELECT "
       (str/join ", " (for [stream streams]
                        (str "pg_get_serial_sequence('" (stream-table stream) "', 'id') AS " (name stream))))))

(defn postgres-default-sequence-sql
  "SQL for the sequence that the `id` column default of `table` draws from, found through the default's dependency.
  It is the fallback when the column owns no sequence: Metabase's 064 migration made the partitioned
  `query_execution` with `LIKE ... INCLUDING ALL`, which copies a `serial` column's default but leaves the sequence
  owned by the old table, so `pg_get_serial_sequence` answers NULL."
  [table]
  (str "SELECT d.refobjid::regclass::text AS seq FROM pg_attrdef ad"
       " JOIN pg_attribute a ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum"
       " JOIN pg_depend d ON d.classid = 'pg_attrdef'::regclass AND d.objid = ad.oid"
       " AND d.refclassid = 'pg_class'::regclass"
       " JOIN pg_class c ON c.oid = d.refobjid AND c.relkind = 'S'"
       " WHERE ad.adrelid = '" table "'::regclass AND a.attname = 'id'"))

(defn postgres-sequences-sql
  "SQL for the `stream`, `last_value` and `is_called` of each sequence of `seq-names`, a map of stream to a name from
  `pg_get_serial_sequence`, in one statement. `pg_sequence_last_value` is NULL after a `setval(..., false)`, as a
  restore leaves a sequence, so read the sequence."
  [seq-names]
  (str/join " UNION ALL " (for [[stream seq-name] seq-names]
                            (str "SELECT '" (name stream) "' AS stream, last_value, is_called FROM " seq-name))))

(defn mysql-auto-increments-sql
  "SQL for the `table_name` and next `auto_increment` value of the tables that the parameters name, one per stream of
  `streams`. Run it after `SET SESSION information_schema_stats_expiry = 0`, or MySQL may answer from a cache up to a
  day old."
  [streams]
  (str "SELECT table_name AS table_name, auto_increment AS auto_increment FROM information_schema.tables"
       " WHERE table_schema = DATABASE() AND table_name IN " (in-list (count streams))))

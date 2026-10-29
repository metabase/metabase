(ns metabase-enterprise.monitor-relay.sql
  "The queries the relay reads the app DB with, for `:postgres` and `:mysql` (MySQL and MariaDB). Each row has the
  shape that `spec/data/ingestion/rows.yaml` in the Metabase Monitor repository defines, at full capability. The
  engines differ in identifier quoting, in how the query hash becomes hex, and in how a timestamp becomes epoch
  microseconds and back. Placeholders are JDBC `?`."
  (:require
   [clojure.string :as str]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]))

(set! *warn-on-reflection* true)

(defn- q
  "`ident` quoted for MySQL, where it is a reserved word; plain on Postgres."
  [engine ident]
  (if (= engine :mysql) (str "`" ident "`") ident))

(defn- hex
  "Lower-case hex of the binary `column`."
  [engine column]
  (if (= engine :mysql)
    (format "LOWER(HEX(%s))" column)
    (format "encode(%s, 'hex')" column)))

;;; ------------------------------------------------- fact streams -------------------------------------------------

(def streams
  "The fact streams, in the order the relay sends them: logins before executions."
  [:login :execution :view :audit])

(def stream-table
  "The app-DB table each stream reads."
  {:execution "query_execution"
   :login     "login_history"
   :view      "view_log"
   :audit     "audit_log"})

(def ^:private stream-alias
  {:execution "qe", :login "lh", :view "vl", :audit "al"})

(defn- execution-select [engine]
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
       " q.query AS query_payload, " (hex engine "qe.hash") " AS query_hash"
       " FROM query_execution qe"
       " LEFT JOIN core_user u ON u.id = qe.executor_id"
       " LEFT JOIN report_card c ON c.id = qe.card_id"
       " LEFT JOIN report_dashboard d ON d.id = qe.dashboard_id"
       " LEFT JOIN metabase_database db ON db.id = qe.database_id"
       " LEFT JOIN query q ON q.query_hash = qe.hash"))

(defn- login-select [engine]
  (str "SELECT lh.id AS event_id, lh." (q engine "timestamp") " AS ts, lh.user_id AS user_id,"
       " lh.session_id AS session_id, lh.device_id AS device_id, lh.device_description AS user_agent,"
       " lh.ip_address AS ip"
       " FROM login_history lh"))

(defn- view-select [engine]
  (str "SELECT vl.id AS event_id, vl." (q engine "timestamp") " AS ts, vl.user_id AS user_id, vl.model AS model,"
       " vl.model_id AS model_id, COALESCE(vl.has_access, TRUE) AS has_access, vl.context AS context,"
       " vl.embedding_client AS embedding_client, vl.embedding_client_identifier AS embedding_client_identifier,"
       " vl.embedding_route AS embedding_route, vl.embedding_sdk_version AS embedding_sdk_version,"
       " vl.auth_method AS auth_method, vl.tenant_id AS tenant_id, vl.embedding_hostname AS embedding_hostname,"
       " vl.embedding_path AS embedding_path, vl.user_agent AS user_agent,"
       " vl.sanitized_user_agent AS sanitized_user_agent, vl.ip_address AS ip,"
       " vl.metabase_version AS metabase_version"
       " FROM view_log vl"))

(defn- audit-select [engine]
  (str "SELECT al.id AS event_id, al." (q engine "timestamp") " AS ts, al.topic AS topic, al.user_id AS user_id,"
       " al.model AS model, al.model_id AS model_id, al.details AS details_json"
       " FROM audit_log al"))

(defn- stream-select [engine stream]
  ((case stream
     :execution execution-select
     :login     login-select
     :view      view-select
     :audit     audit-select)
   engine))

(defn stream-page-sql
  "SQL for the rows of `stream` with an id above the first parameter, in id order, at most the second parameter."
  [engine stream]
  (let [id (str (stream-alias stream) ".id")]
    (str (stream-select engine stream) " WHERE " id " > ? ORDER BY " id " LIMIT ?")))

(defn stream-range-sql
  "SQL for the rows of `stream` with an id from the first to the second parameter, in id order, at most the third
  parameter."
  [engine stream]
  (let [id (str (stream-alias stream) ".id")]
    (str (stream-select engine stream) " WHERE " id " BETWEEN ? AND ? ORDER BY " id " LIMIT ?")))

;;; ------------------------------------------------ history floors ------------------------------------------------

(def ^:private stream-time
  "The column that dates each stream's rows."
  {:execution "started_at", :login "timestamp", :view "timestamp", :audit "timestamp"})

(defn- time-column [engine stream]
  (str (stream-alias stream) "." (q engine (stream-time stream))))

(defn time-floor-sql
  "SQL for the `id` of the earliest row of `stream` whose time is at or after the parameter. It reads the time
  column's index, which `audit_log` does not have: see [[first-row-sql]]."
  [engine stream]
  (let [a  (stream-alias stream)
        ts (time-column engine stream)]
    (str "SELECT " a ".id AS id FROM " (stream-table stream) " " a " WHERE " ts " >= ? ORDER BY " ts " LIMIT 1")))

(defn first-row-sql
  "SQL for the `id` of the first row of `stream` with an id at or above the second parameter, and `is_after`: 1 when
  its time is at or after the first parameter, else 0."
  [engine stream]
  (let [a (stream-alias stream)]
    (str "SELECT " a ".id AS id, CASE WHEN " (time-column engine stream) " >= ? THEN 1 ELSE 0 END AS is_after"
         " FROM " (stream-table stream) " " a " WHERE " a ".id >= ? ORDER BY " a ".id LIMIT 1")))

;;; ------------------------------------------------- state kinds --------------------------------------------------

(defn- micros
  "The timestamp expression `x` in epoch microseconds, as an integer. On MySQL, run it under the session time zone
  `+00:00`."
  [engine x]
  (if (= engine :mysql)
    (str "CAST(UNIX_TIMESTAMP(" x ") * 1000000 AS SIGNED)")
    ;; Each part is a whole number below 2^53, so it is exact also where EXTRACT returns a double (before Postgres 14).
    (str "(EXTRACT(EPOCH FROM date_trunc('second', " x "))::bigint * 1000000"
         " + EXTRACT(MICROSECONDS FROM " x ")::bigint % 1000000)")))

(defn- utc-text
  "The timestamp expression `x` as UTC text with milliseconds and `Z`, as `relay.rows` sends a timestamp. On MySQL, run
  it under the session time zone `+00:00`. The driver reads a MySQL `timestamp` in the JVM's time zone, not the
  session's, so the text is made in SQL."
  [engine x]
  (if (= engine :mysql)
    (str "CONCAT(LEFT(DATE_FORMAT(" x ", '%Y-%m-%dT%H:%i:%s.%f'), 23), 'Z')")
    x))

(defn- instant
  "The timestamp of an epoch-microseconds parameter, the inverse of [[micros]]. On MySQL, run it under the session time
  zone `+00:00`."
  [engine]
  (if (= engine :mysql)
    "TIMESTAMPADD(MICROSECOND, ?, TIMESTAMP '1970-01-01 00:00:00')"
    "(TIMESTAMPTZ 'epoch' + ? * INTERVAL '1 microsecond')"))

(defn- field-query
  "Fields with the values users set merged in, as `metabase.warehouse-schema-overlay` merges them."
  []
  {:select [[:f.id :id] [:f.id :field_id] [:f.table_id :table_id] [:t.name :table_name] [:t.schema :schema_name]
            [:t.db_id :database_id] [:f.name :field_name] [:f.active :active]
            [:f.data_sensitivity :data_sensitivity] [:f.semantic_type :semantic_type]]
   :from   [(warehouse-schema-overlay/field-query {:alias :f})]
   :join   [(warehouse-schema-overlay/table-query {:alias :t}) [:= :t.id :f.table_id]]})

(defn- table-query
  "Tables with the values users set merged in, as `metabase.warehouse-schema-overlay` merges them."
  []
  {:select [[:t.id :id] [:t.id :table_id] [:t.name :name] [:t.schema :schema_name] [:t.db_id :database_id]
            [:t.active :active] [:t.visibility_type :visibility_type] [:t.estimated_row_count :estimated_row_count]]
   :from   [(warehouse-schema-overlay/table-query {:alias :t})]})

(defn- state-sql [engine kind]
  (case kind
    :card
    (str "SELECT c.id AS id, c.id AS card_id, c.name AS name, c.collection_id AS collection_id,"
         " c.database_id AS database_id, c.query_type AS query_type, c.dataset_query AS dataset_query,"
         " c.public_uuid AS public_uuid, c.made_public_by_id AS made_public_by_id, c.archived AS archived,"
         " c." (q engine "type") " AS type, " (micros engine "c.updated_at") " AS _u"
         " FROM report_card c")

    :dashboard
    (str "SELECT d.id AS id, d.id AS dashboard_id, d.name AS name, d.collection_id AS collection_id,"
         " d.public_uuid AS public_uuid, d.made_public_by_id AS made_public_by_id, d.archived AS archived"
         " FROM report_dashboard d")

    :database
    (str "SELECT db.id AS id, db.id AS database_id, db.name AS database_name, db.engine AS database_engine,"
         " 1 AS active FROM metabase_database db")

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
         " nr." (q engine "type") " AS " (q engine "type") ", cu.email AS email, nr.details AS details"
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

    :tenant
    "SELECT t.id AS id, t.id AS tenant_id, t.name AS name FROM tenant t"

    :user
    (str "SELECT u.id AS id, u.id AS user_id, u.email AS email, u.first_name AS first_name,"
         " u.last_name AS last_name, u.is_superuser AS is_superuser, u.is_active AS is_active,"
         " u.sso_source AS sso_source, u.locale AS locale, " (utc-text engine "u.date_joined") " AS date_joined,"
         " u.tenant_id, u.login_attributes, u." (q engine "type") " AS user_type, "
         (utc-text engine "u.last_login") " AS last_login,"
         " " (micros engine "u.updated_at") " AS _u"
         " FROM core_user u")))

(def ^:private state-filter
  "The condition a row must meet to belong to its kind, for the kinds that have one."
  {:notification              (fn [_engine] "n.payload_type = 'notification/card'")
   :notification_subscription (fn [engine] (str "ns." (q engine "type") " = 'notification-subscription/cron'"))})

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
  "The state kinds."
  (set (keys state-id)))

(def delta-kinds
  "The state kinds also read by the time of their last change, in the order the relay sends them. Their rows carry
  `_u`, that time in epoch microseconds."
  [:user :card])

(def ^:private changed-column
  {:user "u.updated_at"
   :card "c.updated_at"})

(defn- read-clause
  "The condition, order and limit of `read` over state `kind`, as `[sql params]`."
  [engine kind [read & args]]
  (let [id (state-id kind)]
    (case read
      :page    [(str id " >= ? ORDER BY " id " LIMIT ?") args]
      :range   [(str id " BETWEEN ? AND ? ORDER BY " id) args]
      :ids     (let [[ids] args]
                 [(str id " IN (" (str/join ", " (repeat (count ids) "?")) ")") ids])
      :changed (let [[t after-id limit] args
                     column             (changed-column kind)
                     at                 (instant engine)]
                 [(str column " >= " at " AND (" column " > " at " OR " id " >= ?)"
                       " ORDER BY " column ", " id " LIMIT ?")
                  [t t after-id limit]]))))

(defn- honey-read
  "`query`, a HoneySQL map over state `kind`, restricted to `read`."
  [query kind [read & args]]
  (let [id (keyword (state-id kind))]
    (merge query
           (case read
             :page  (let [[from limit] args] {:where [:>= id from], :order-by [id], :limit limit})
             :range (let [[lo hi] args] {:where [:between id lo hi], :order-by [id]})
             :ids   {:where [:in id (first args)]}))))

(defn state-query
  "The query for the rows of state `kind` that `read` selects, a HoneySQL map for `:field` and `:table`, which merge
  the values users set, else a `[sql & params]` vector. `read` is one of:

  - `[:page from limit]`: the rows with a key at or above `from`, in key order, at most `limit`;
  - `[:range lo hi]`: the rows with a key from `lo` to `hi`, in key order;
  - `[:ids ids]`: the rows with a key in `ids`, a non-empty collection;
  - `[:changed t id limit]`: `:user` and `:card` only, the rows whose `(updated_at, id)` is at or after `(t, id)`, `t`
    in epoch microseconds, in that order, at most `limit`. On MySQL, run it under the session time zone `+00:00`."
  [engine kind read]
  (case kind
    :field (honey-read (field-query) kind read)
    :table (honey-read (table-query) kind read)
    (let [[clause params] (read-clause engine kind read)
          condition       (when-let [f (state-filter kind)] (f engine))]
      (into [(str (state-sql engine kind) " WHERE " (some-> condition (str " AND ")) clause)] params))))

(defn clock-sql
  "SQL for the app DB's clock, in epoch microseconds: `r`, now. On Postgres also `o`, the start of the oldest open
  transaction of Metabase's role on other connections, or NULL when there is none, and `tracked`, whether
  `track_activities` is on. Without it, Postgres records no transaction's start, so `o` is always NULL. On MySQL, run it
  under the session time zone `+00:00`."
  [engine]
  (if (= engine :mysql)
    (str "SELECT " (micros engine "NOW(6)") " AS r")
    (str "SELECT " (micros engine "now()") " AS r,"
         " (SELECT " (micros engine "min(xact_start)") " FROM pg_stat_activity"
         " WHERE datname = current_database() AND usename = current_user AND pid <> pg_backend_pid()) AS o,"
         " current_setting('track_activities') = 'on' AS tracked")))

(defn mysql-oldest-transaction-sql
  "SQL for `o`, the start of the oldest open InnoDB transaction on other connections in epoch microseconds, or NULL
  when there is none. Run it under the session time zone `SYSTEM`: InnoDB gives `trx_started` in the server's system
  time zone. It needs the `PROCESS` privilege."
  []
  (str "SELECT " (micros :mysql "MIN(trx_started)") " AS o FROM information_schema.innodb_trx"
       " WHERE trx_mysql_thread_id <> CONNECTION_ID()"))

;;; ------------------------------------------- capabilities and sequences ----------------------------------------

(def notification-tables
  "The tables of Metabase's notifications, which the `notification_tables` capability needs all of."
  ["notification" "notification_card" "notification_handler" "notification_recipient" "notification_subscription"])

(def capability-tables
  "The tables whose presence or columns the capabilities report."
  (into ["audit_log" "core_user" "login_history" "metabase_field" "metabase_field_user_settings" "native_query_snippet"
         "pulse" "pulse_channel_recipient" "tenant" "view_log"]
        notification-tables))

(defn- in-list [values]
  (str "(" (str/join ", " (map #(str "'" % "'") values)) ")"))

(defn table-columns-sql
  "SQL for the `table_name` and `column_name` of every column of `tables`, in column order."
  [engine tables]
  (str "SELECT table_name AS table_name, column_name AS column_name FROM information_schema.columns"
       " WHERE table_schema = " (if (= engine :mysql) "DATABASE()" "current_schema()")
       " AND table_name IN " (in-list tables)
       " ORDER BY table_name, ordinal_position"))

(defn recent-row-sql
  "SQL that returns a row when `table` has one from the last 7 days."
  [engine table]
  (str "SELECT 1 AS x FROM " table " WHERE " (q engine "timestamp") " > "
       (if (= engine :mysql) "NOW() - INTERVAL 7 DAY" "now() - interval '7 days'")
       " LIMIT 1"))

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
  "SQL for the `table_name` and next `auto_increment` value of the tables of `streams`. Run it after
  `SET SESSION information_schema_stats_expiry = 0`, or MySQL may answer from a cache up to a day old."
  [streams]
  (str "SELECT table_name AS table_name, auto_increment AS auto_increment FROM information_schema.tables"
       " WHERE table_schema = DATABASE() AND table_name IN " (in-list (map stream-table streams))))

(ns metabase.app-db.snapshot-test-util.mysql
  "Dumps a MySQL-family app DB with `mysqldump`, which must be on PATH. Covers MariaDB too: the dump is taken the same
  way, only the flags differ."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.app-db.snapshot-test-util.dump :as dump]
   [metabase.app-db.snapshot-test-util.dump-util :as dump-util]))

(set! *warn-on-reflection* true)

(defn- drop-version-gated-blocks
  "Remove mysqldump's `/*!NNNNN ... */;` blocks. They carry session character-set juggling, a placeholder
  `CREATE TABLE` standing in for each view, and the real view DDL -- the last split across three blocks and stamped
  with a `DEFINER` naming the account that produced the dump. [[view-statements]] rebuilds the views instead."
  [lines]
  (loop [[line & more] lines, in-block? false, acc []]
    (cond
      (nil? line)              acc
      in-block?                (recur more (not (str/ends-with? (str/trimr line) "*/;")) acc)
      (str/starts-with? (str/triml line) "/*!")
      (recur more (not (str/ends-with? (str/trimr line) "*/;")) acc)
      :else                    (recur more false (conj acc line)))))

(defn- view-statements
  "`CREATE OR REPLACE VIEW` for every view in `db`, read back from `information_schema`.

  MySQL stores view definitions with every table qualified by the schema they were created in, so the name of the
  throwaway DB used for generation is stripped out -- otherwise the snapshot would only load into a DB of that name."
  [^java.sql.Connection conn db]
  (let [qualifier (str "`" db "`.")]
    (for [{:keys [table_name view_definition]}
          (jdbc/query {:connection conn}
                      ["SELECT table_name, view_definition FROM information_schema.views WHERE table_schema = ?
                        ORDER BY table_name" db])]
      (format "CREATE OR REPLACE VIEW `%s` AS %s"
              table_name
              (str/replace view_definition qualifier "")))))

(defn- mysqldump-command
  "Binary used to dump MySQL-family DBs, overridable via `MB_SNAPSHOT_MYSQLDUMP`.

  Needed because the two servers want different clients: MySQL 9's `mysqldump` dropped `mysql_native_password` and so
  cannot authenticate against older MariaDB servers, while MariaDB's `mariadb-dump` is not always on PATH next to it.
  The override also stands in for a client that only exists inside the DB's container."
  []
  (or (System/getenv "MB_SNAPSHOT_MYSQLDUMP") "mysqldump"))

(defrecord MysqlDumper [flavor]
  dump/Dumper
  (dump-statements [_dumper {:keys [host port db user]} conn]
    ;; `--protocol=TCP` because the MySQL client silently ignores `--port` and uses a unix socket when the host is
    ;; `localhost`, which is not necessarily the server the migration just ran against. `--set-gtid-purged` is
    ;; MySQL-only, so it is passed only when dumping MySQL.
    (into (dump-util/lines->statements
           (drop-version-gated-blocks
            (str/split-lines
             (apply dump-util/sh!
                    (concat [(mysqldump-command) "--compact" "--skip-extended-insert" "--skip-add-locks"
                             "--skip-disable-keys" "--skip-set-charset" "--complete-insert" "--no-tablespaces"
                             "--protocol=TCP"]
                            (when (= flavor :mysql) ["--set-gtid-purged=OFF"])
                            [(str "--host=" host) (str "--port=" port) (str "--user=" user) (str db)])))))
          ;; views last: they read from the tables above, and none of them reads from another view
          (view-statements conn db))))

(defn dumper
  "Dumps the MySQL-family app DB of dialect `flavor`, which decides only whether the MySQL-only flags are passed."
  [flavor]
  (->MysqlDumper flavor))

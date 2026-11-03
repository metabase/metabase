(ns metabase.app-db.snapshot-test-util.mysql
  "Dumps a MySQL-family app DB with the dump client shipped in the server's own container.
  It covers MariaDB too: the dump is taken the same way, and only the client and a couple of flags differ."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.app-db.snapshot-test-util.dump :as dump]
   [metabase.app-db.snapshot-test-util.dump-util :as dump-util]))

(set! *warn-on-reflection* true)

(defn- drop-version-gated-blocks
  "Remove mysqldump's `/*!NNNNN ... */;` blocks from `lines`."
  [lines]
  ;; They carry session character-set juggling, a placeholder CREATE TABLE standing in for each view, and the real view
  ;; DDL, split across three blocks and stamped with a DEFINER naming the account that produced the dump.
  ;; [[view-statements]] rebuilds the views instead.
  (loop [[line & more] lines, in-block? false, acc []]
    (cond
      (nil? line)              acc
      in-block?                (recur more (not (str/ends-with? (str/trimr line) "*/;")) acc)
      (str/starts-with? (str/triml line) "/*!")
      (recur more (not (str/ends-with? (str/trimr line) "*/;")) acc)
      :else                    (recur more false (conj acc line)))))

(defn- drop-sandbox-directive
  "Remove the `/*M!999999\\- enable the sandbox mode */` line mariadb-dump opens with."
  [lines]
  ;; a client directive rather than schema, and only recent clients write it: left in, the snapshot would record which
  ;; client dumped it
  (remove #(str/starts-with? (str/triml %) "/*M!999999\\-") lines))

(defn- view-statements
  "A `CREATE OR REPLACE SQL SECURITY ... VIEW` for every view in `db`, read back from `information_schema`.
  Table names are left unqualified, so the statements load into a DB of any name."
  [^java.sql.Connection conn db]
  ;; MySQL stores each definition with every table qualified by the schema it was created in, which here is the
  ;; throwaway generation DB. The definition is only the body, so SQL SECURITY is carried over separately: migrations
  ;; create the instance analytics views as INVOKER, and MySQL's default is DEFINER. The definer account is left out,
  ;; since it names whoever generated the snapshot.
  (let [qualifier (str "`" db "`.")]
    (for [{:keys [table_name view_definition security_type]}
          (jdbc/query {:connection conn}
                      ["SELECT table_name, view_definition, security_type FROM information_schema.views
                        WHERE table_schema = ? ORDER BY table_name" db])]
      (format "CREATE OR REPLACE SQL SECURITY %s VIEW `%s` AS %s"
              security_type
              table_name
              (str/replace view_definition qualifier "")))))

(defn- database-charset-statement
  "An `ALTER DATABASE` setting the default character set and collation of `db` on whichever DB the snapshot is loaded
  into."
  [^java.sql.Connection conn db]
  ;; A migration sets these, and no table's DDL records them. mysqldump only emits database-level DDL under
  ;; `--databases`, which would also stamp the dump with a CREATE DATABASE and USE naming the throwaway DB it came
  ;; from. Without this statement a loaded snapshot keeps the server's default collation, and every column a later
  ;; changeset adds without naming one inherits that instead of what a full migration run would have given it.
  (let [{:keys [default_character_set_name default_collation_name]}
        (first (jdbc/query {:connection conn}
                           ["SELECT default_character_set_name, default_collation_name
                             FROM information_schema.schemata WHERE schema_name = ?" db]))]
    (format "ALTER DATABASE CHARACTER SET %s COLLATE %s"
            default_character_set_name default_collation_name)))

;; MySQL and MariaDB do not share a client: MySQL's asks any server reporting 8.0 or newer for
;; `information_schema.COLUMN_STATISTICS`, a table only MySQL has, and so fails outright against MariaDB 11 and up.
(def ^:private flavor->client
  "The dump client each flavor's server ships."
  {:mysql                    "mysqldump"
   :mariadb                  "mariadb-dump"
   :mariadb-legacy-timestamp "mariadb-dump"})

(defrecord MysqlDumper [flavor]
  dump/Dumper
  (dump-statements [_dumper {:keys [exec!] {:keys [db user]} :details} conn]
    ;; TCP is forced because the MySQL client silently ignores `--port` and uses a unix socket when the host is
    ;; `localhost`. Autocommit toggling is skipped because mariadb-dump otherwise wraps the inserts in it, and the SETs
    ;; around them are dropped as noise while the COMMIT between them is not. Only MySQL knows `--set-gtid-purged`, so
    ;; it is passed only for MySQL. The host and port are the ones the server listens on inside its container, not the
    ;; ones this JVM reaches it by, because `exec!` runs there.
    (let [dumped (dump-util/lines->statements
                  (drop-version-gated-blocks
                   (drop-sandbox-directive
                    (str/split-lines
                     (apply exec!
                            (concat [(flavor->client flavor)
                                     "--compact" "--skip-extended-insert" "--skip-add-locks"
                                     "--skip-disable-keys" "--skip-set-charset" "--complete-insert"
                                     "--no-tablespaces" "--protocol=TCP" "--skip-no-autocommit"]
                                    (when (= flavor :mysql) ["--set-gtid-purged=OFF"])
                                    ["--host=127.0.0.1" "--port=3306"
                                     (str "--user=" user) (str db)]))))))]
      (-> [(database-charset-statement conn db)]
          (into dumped)
          ;; views last: they read from the tables above, and none of them reads from another view
          (into (view-statements conn db))))))

(defn dumper
  "Dumps the MySQL-family app DB of dialect `flavor`, which decides only whether the MySQL-only flags are passed."
  [flavor]
  (->MysqlDumper flavor))

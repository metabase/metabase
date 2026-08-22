(ns metabase.app-db.snapshot-test-util.mysql
  "Dumps a MySQL-family app DB with the dump client shipped in the server's own container. Covers MariaDB too: the
  dump is taken the same way, only the client and a couple of flags differ."
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

(defn- drop-sandbox-directive
  "Remove the `/*M!999999\\- enable the sandbox mode */` line mariadb-dump opens with. It is a client directive rather
  than schema, and only recent clients write it -- left in, the snapshot would record which client dumped it."
  [lines]
  (remove #(str/starts-with? (str/triml %) "/*M!999999\\-") lines))

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

(defn- database-charset-statement
  "`ALTER DATABASE` carrying the schema's own default character set and collation.

  A migration sets these, and nothing in a table's DDL records them: mysqldump only emits database-level DDL under
  `--databases`, which would also stamp the dump with a `CREATE DATABASE`/`USE` naming the throwaway DB it came from.
  The database name is left off here, which makes the statement apply to whichever DB the snapshot is loaded into.

  Without this, a loaded snapshot keeps the server's default collation, and every column a later changeset adds
  without naming one inherits that instead of what a full migration run would have given it."
  [^java.sql.Connection conn db]
  (let [{:keys [default_character_set_name default_collation_name]}
        (first (jdbc/query {:connection conn}
                           ["SELECT default_character_set_name, default_collation_name
                             FROM information_schema.schemata WHERE schema_name = ?" db]))]
    (format "ALTER DATABASE CHARACTER SET %s COLLATE %s"
            default_character_set_name default_collation_name)))

(def ^:private flavor->client
  "The dump client each flavor's server ships. MySQL and MariaDB do not share one: MySQL's asks any server reporting
  8.0 or newer for `information_schema.COLUMN_STATISTICS`, a table only MySQL has, and so fails outright against
  MariaDB 11 and up."
  {:mysql                    "mysqldump"
   :mariadb                  "mariadb-dump"
   :mariadb-legacy-timestamp "mariadb-dump"})

(defrecord MysqlDumper [flavor]
  dump/Dumper
  (dump-statements [_dumper {:keys [exec!] {:keys [db user]} :details} conn]
    ;; `--protocol=TCP` because the MySQL client silently ignores `--port` and uses a unix socket when the host is
    ;; `localhost`. `--skip-no-autocommit` because mariadb-dump otherwise wraps the inserts in an autocommit toggle,
    ;; and the `SET`s around it are dropped as noise while the `COMMIT` between them is not. `--set-gtid-purged` is
    ;; MySQL-only, so it is passed only for MySQL. The host and port are the ones the server listens on inside its
    ;; container, not the ones this JVM reaches it by, because `exec!` runs there.
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

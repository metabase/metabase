(ns metabase.cmd.dump-to-h2
  "Commands for dumping data to an H2 file from app database.
   Run this with `lein run dump-to-h2` or `java -jar metabase.jar dump-to-h2`.

   Test this as follows:
  ```lein run dump-to-h2 \"/path/to/h2\"```
   Validate with:
  ```lein run load-from-h2 \"/path/to/h2\"```
   "
  (:require [clojure.java
             [io :as io]
             [jdbc :as jdbc]]
            [clojure.string :as str]
            [colorize.core :as color]
            [me.raynes.fs :as fs]
            [metabase
             [db :as mdb]
             [util :as u]]
            [metabase.db.migrations :refer [DataMigrations]]
            [metabase.models
             [activity :refer [Activity]]
             [card :refer [Card]]
             [card-favorite :refer [CardFavorite]]
             [collection :refer [Collection]]
             [collection-revision :refer [CollectionRevision]]
             [dashboard :refer [Dashboard]]
             [dashboard-card :refer [DashboardCard]]
             [dashboard-card-series :refer [DashboardCardSeries]]
             [dashboard-favorite :refer [DashboardFavorite]]
             [database :refer [Database]]
             [dependency :refer [Dependency]]
             [dimension :refer [Dimension]]
             [field :refer [Field]]
             [field-values :refer [FieldValues]]
             [metric :refer [Metric]]
             [metric-important-field :refer [MetricImportantField]]
             [permissions :refer [Permissions]]
             [permissions-group :refer [PermissionsGroup]]
             [permissions-group-membership :refer [PermissionsGroupMembership]]
             [permissions-revision :refer [PermissionsRevision]]
             [pulse :refer [Pulse]]
             [pulse-card :refer [PulseCard]]
             [pulse-channel :refer [PulseChannel]]
             [pulse-channel-recipient :refer [PulseChannelRecipient]]
             [revision :refer [Revision]]
             [segment :refer [Segment]]
             [session :refer [Session]]
             [setting :refer [Setting]]
             [table :refer [Table]]
             [user :refer [User]]
             [view-log :refer [ViewLog]]]
            [metabase.util.i18n :refer [trs]]
            [toucan.db :as db])
  (:import java.sql.SQLException))


(defn- println-ok [] (println (color/green "[OK]")))

;;; ------------------------------------------ Models to Migrate (in order) ------------------------------------------

(def ^:private entities
  "Entities in the order they should be serialized/deserialized. This is done so we make sure that we load load
  instances of entities before others that might depend on them, e.g. `Databases` before `Tables` before `Fields`."
  [Database
   User
   Setting
   Dependency
   Table
   Field
   FieldValues
   Segment
   Metric
   MetricImportantField
   Revision
   ViewLog
   Session
   Dashboard
   Card
   CardFavorite
   DashboardCard
   DashboardCardSeries
   Activity
   Pulse
   PulseCard
   PulseChannel
   PulseChannelRecipient
   PermissionsGroup
   PermissionsGroupMembership
   Permissions
   PermissionsRevision
   Collection
   CollectionRevision
   DashboardFavorite
   Dimension
   ;; migrate the list of finished DataMigrations as the very last thing (all models to copy over should be listed
   ;; above this line)
   DataMigrations])


;;; --------------------------------------------- H2 Connection Options ----------------------------------------------

(defn- add-file-prefix-if-needed [connection-string-or-filename]
  (if (str/starts-with? connection-string-or-filename "file:")
    connection-string-or-filename
    (str "file:" (.getAbsolutePath (io/file connection-string-or-filename)))))

(defn- h2-details [h2-connection-string-or-nil]
  (let [h2-filename (add-file-prefix-if-needed h2-connection-string-or-nil)]
    (mdb/jdbc-details {:type :h2, :db h2-filename})))


;;; ------------------------------------------- Fetching & Inserting Rows --------------------------------------------

(defn- objects->colums+values
  "Given a sequence of objects/rows fetched from the H2 DB, return a the `columns` that should be used in the `INSERT`
  statement, and a sequence of rows (as sequences)."
  [objs]
  ;; 1) `:sizeX` and `:sizeY` come out of H2 as `:sizex` and `:sizey` because of automatic lowercasing; fix the names
  ;;    of these before putting into the new DB
  ;;
  ;; 2) Need to wrap the column names in quotes because Postgres automatically lowercases unquoted identifiers
  (let [source-keys (keys (first objs))
        dest-keys (for [k source-keys]
                    ((db/quote-fn) (name (case k
                                           :sizex :sizeX
                                           :sizey :sizeY
                                           k))))]
    {:cols dest-keys
     :vals (for [row objs]
             (map (comp u/jdbc-clob->str row) source-keys))}))

(def ^:private chunk-size 100)

(defn- insert-chunk! [target-db-conn table-name chunkk]
  (print (color/blue \.))
  (flush)
  (try
    (let [{:keys [cols vals]} (objects->colums+values chunkk)]
      (jdbc/insert-multi! target-db-conn table-name (map str/upper-case cols) vals))
    (catch SQLException e
      (jdbc/print-sql-exception-chain e)
      (throw e))))

(defn- insert-entity! [target-db-conn {table-name :table, entity-name :name} objs]
  (print (u/format-color 'blue "Transferring %d instances of %s..." (count objs) entity-name))
  (flush)
  ;; The connection closes prematurely on occasion when we're inserting thousands of rows at once. Break into
  ;; smaller chunks so connection stays alive
  (doseq [chunk (partition-all chunk-size objs)]
    (insert-chunk! target-db-conn table-name chunk))
  (println-ok))

(defn- load-data! [target-db-conn]
  (println "Source db:" (mdb/jdbc-details))
  (jdbc/with-db-connection [db-conn (mdb/jdbc-details)]
    (doseq [{table-name :table, :as e} entities
            :let [rows (jdbc/query db-conn [(str "SELECT * FROM " (name table-name))])]
            :when (seq rows)]
      (insert-entity! target-db-conn e rows))))

(defn- get-target-db-conn [h2-filename]
  (h2-details h2-filename))

;;; --------------------------------------------------- Public Fns ---------------------------------------------------

(defn dump-to-h2!
  "Transfer data from existing database specified by connection string
  to the H2 DB specified by env vars.  Intended as a tool for migrating
  from one instance to another using H2 as serialization target.

  Defaults to using `@metabase.db/db-file` as the connection string."
  [h2-filename]
  (let [h2-filename (or h2-filename "metabase_dump.h2")]
    (println "Dumping to " h2-filename)
    (doseq [filename [h2-filename
                    (str h2-filename ".mv.db")]]
      (when (.exists (io/file filename))
        (fs/delete filename)
        (println (u/format-color 'red (trs "Output H2 database already exists: %s, removing.") filename))))

    (println "Dumping from configured Metabase db to H2 file" h2-filename)

    (mdb/setup-db!* (get-target-db-conn h2-filename) true)
    (mdb/setup-db!)

    (if (= :h2 (mdb/db-type))
      (println (u/format-color 'yellow (trs "Don't need to migrate, just use the existing H2 file")))
      (jdbc/with-db-transaction [target-db-conn (get-target-db-conn h2-filename)]
        (println "Conn of target: " target-db-conn)
        (println-ok)
        (println (u/format-color 'blue "Loading data..."))
        (load-data! target-db-conn)
        (println-ok)
        (jdbc/db-unset-rollback-only! target-db-conn)))

    (println "Dump complete")))

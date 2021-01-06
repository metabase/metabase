(ns metabase.cmd.dump-and-load-common
  "Common code shared between the `load-from-h2` and `dump-to-h2` commands."
  (:require [clojure.java
             [io :as io]
             [jdbc :as jdbc]]
            [clojure.string :as str]
            [colorize.core :as color]
            [honeysql.format :as hformat]
            [metabase
             [models :refer [Activity Card CardFavorite Collection CollectionRevision Dashboard DashboardCard
                             DashboardCardSeries DashboardFavorite Database Dependency Dimension Field FieldValues
                             Metric MetricImportantField NativeQuerySnippet Permissions PermissionsGroup
                             PermissionsGroupMembership PermissionsRevision Pulse PulseCard PulseChannel
                             PulseChannelRecipient Revision Segment Session Setting Table User ViewLog]]
             [util :as u]]
            [metabase.db
             [connection :as mdb.conn]
             [migrations :refer [DataMigrations]]
             [spec :as db.spec]])
  (:import java.sql.SQLException))

(def entities
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
   Collection
   CollectionRevision
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
   DashboardFavorite
   Dimension
   NativeQuerySnippet
   ;; migrate the list of finished DataMigrations as the very last thing (all models to copy over should be listed
   ;; above this line)
   DataMigrations])

(defn println-ok
  "Print an 'ok' message."
  []
  (println (color/green "[OK]")))

(defn- add-file-prefix-if-needed [connection-string-or-filename]
  (if (str/starts-with? connection-string-or-filename "file:")
    connection-string-or-filename
    (str "file:" (.getAbsolutePath (io/file connection-string-or-filename)))))

(defn h2-jdbc-spec
  "Create a `clojure.java.jdbc-spec` for the H2 database with `h2-filename`."
  [h2-filename]
  (let [h2-filename (add-file-prefix-if-needed h2-filename)]
    (db.spec/h2 {:db h2-filename})))

(defn- objects->colums+values
  "Given a sequence of objects/rows fetched from the H2 DB, return a the `columns` that should be used in the `INSERT`
  statement, and a sequence of rows (as sequences)."
  [target-db-type objs]
  ;; 1) `:sizeX` and `:sizeY` come out of H2 as `:sizex` and `:sizey` because of automatic lowercasing; fix the names
  ;;    of these before putting into the new DB
  ;;
  ;; 2) Need to wrap the column names in quotes because Postgres automatically lowercases unquoted identifiers
  (let [source-keys (keys (first objs))
        quote-style (mdb.conn/quoting-style target-db-type)
        quote-fn    (get @#'hformat/quote-fns quote-style)
        _           (assert (fn? quote-fn) (str "No function for quote style: " quote-style))
        dest-keys   (for [k source-keys]
                      (quote-fn (name (case k
                                        :sizex :sizeX
                                        :sizey :sizeY
                                        k))))]
    {:cols dest-keys
     :vals (for [row objs]
             (map row source-keys))}))

(def ^:private chunk-size 100)

(defn- insert-chunk!
  "Insert of `chunk` of rows into the target database Table with `table-name`."
  [target-db-type target-db-conn table-name chunk]
  (print (color/blue \.))
  (flush)
  (try
    (let [{:keys [cols vals]} (objects->colums+values target-db-type chunk)]
      (jdbc/insert-multi! target-db-conn table-name cols vals))
    (catch SQLException e
      (jdbc/print-sql-exception-chain e)
      (throw e))))

(defn insert-entity!
  "Copy all `objects` to the target database."
  [target-db-type target-db-conn {table-name :table, entity-name :name} objects]
  (print (u/format-color 'blue "Transfering %d instances of %s..." (count objects) entity-name))
  (flush)
  ;; The connection closes prematurely on occasion when we're inserting thousands of rows at once. Break into
  ;; smaller chunks so connection stays alive
  (doseq [chunk (partition-all chunk-size objects)]
    (insert-chunk! target-db-conn table-name chunk))
  (println-ok))

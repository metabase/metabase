(ns metabase.cmd.load-from-h2
  "Commands for loading data from an H2 file into another database."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.set :as set]
            [colorize.core :as color]
            [medley.core :as m]
            [metabase.config :as config]
            [metabase.db :as db]
            (metabase.models [activity :refer [Activity]]
                             [card :refer [Card]]
                             [card-favorite :refer [CardFavorite]]
                             [card-label :refer [CardLabel]]
                             [dashboard :refer [Dashboard]]
                             [dashboard-card :refer [DashboardCard]]
                             [dashboard-card-series :refer [DashboardCardSeries]]
                             [database :refer [Database]]
                             [dependency :refer [Dependency]]
                             [field :refer [Field]]
                             [field-values :refer [FieldValues]]
                             [label :refer [Label]]
                             [metric :refer [Metric]]
                             [pulse :refer [Pulse]]
                             [pulse-card :refer [PulseCard]]
                             [pulse-channel :refer [PulseChannel]]
                             [pulse-channel-recipient :refer [PulseChannelRecipient]]
                             [query-execution :refer [QueryExecution]]
                             [raw-table :refer [RawTable]]
                             [raw-column :refer [RawColumn]]
                             [revision :refer [Revision]]
                             [segment :refer [Segment]]
                             [session :refer [Session]]
                             [setting :refer [Setting]]
                             [table :refer [Table]]
                             [user :refer [User]]
                             [view-log :refer [ViewLog]])
            [metabase.util :as u]))

(def ^:private entities
  "Entities in the order they should be serialized/deserialized.
   This is done so we make sure that we load load instances of entities before others
   that might depend on them, e.g. `Databases` before `Tables` before `Fields`."
  [Database
   RawTable
   RawColumn
   User
   Setting
   Dependency
   Table
   Field
   FieldValues
   Segment
   Metric
   Revision
   ViewLog
   Session
   Dashboard
   Card
   CardFavorite
   DashboardCard
   DashboardCardSeries
   Activity
   QueryExecution
   Pulse
   PulseCard
   PulseChannel
   PulseChannelRecipient
   Label
   CardLabel])

(def ^:private self-referencing-entities
  "Entities that have a column with and FK that points back to the same table."
  #{RawColumn Field})

(def ^:private entities-without-autoinc-ids
  "Entities that do NOT use an auto incrementing ID column."
  #{Setting Session})

(def ^:private ^:dynamic *target-db-connection*
  "Active database connection to the target database we are loading into."
  nil)

;; TODO - `e` is a bad variable name! This should be something like `entity`
(defn- insert-entity! [e objs]
  (print (u/format-color 'blue "Transfering %d instances of %s..." (count objs) (:name e))) ; TODO - I don't think the print+flush is working as intended :/
  (flush)
  ;; The connection closes prematurely on occasion when we're inserting thousands of rows at once. Break into smaller chunks so connection stays alive
  (doseq [chunk (partition-all 300 objs)]
    (print (color/blue \.))
    (flush)
    (jdbc/insert-multi! *target-db-connection* (:table e) (if (= e DashboardCard)
                                                            ;; mini-HACK to fix h2 lowercasing these couple attributes
                                                            ;; luckily this is the only place in our schema where we have camel case names
                                                            (mapv #(set/rename-keys % {:sizex :sizeX, :sizey :sizeY}) chunk)
                                                            chunk)))
  (println (color/green "[OK]")))

(defn- insert-self-referencing-entity! [e objs]
  (let [self-ref-attrs   (condp = e
                           RawColumn #{:fk_target_column_id}
                           Field     #{:fk_target_field_id :parent_id})
        self-referencing (for [obj   objs
                               :when (reduce #(or %1 %2) (for [attr self-ref-attrs] ; a self-referencing object is an object where *any* of the self-referencing attributes is non-nil
                                                           (attr obj)))]
                           obj)
        others           (set/difference (set objs) (set self-referencing))]
    ;; first insert the non-self-referencing objects
    (insert-entity! e others)
    ;; then insert the rest, which *should* be safe to insert now (TODO - this could break if a self-referencing entity depends on another self-referencing entity </3)
    (insert-entity! e self-referencing)))

(defn- set-postgres-sequence-values! []
  (print (u/format-color 'blue "Setting postgres sequence ids to proper values..."))
  (flush)
  (doseq [e    (filter #(not (contains? entities-without-autoinc-ids %)) entities)
          :let [table-name (name (:table e))
                seq-name   (str table-name "_id_seq")
                sql        (format "SELECT setval('%s', COALESCE((SELECT MAX(id) FROM %s), 1), true) as val" seq-name (name table-name))]]
    (jdbc/db-query-with-resultset *target-db-connection* [sql] :val))
  (println (color/green "[OK]")))

(defn load-from-h2!
  "Transfer data from existing H2 database to the newly created (presumably MySQL or Postgres) DB specified by env vars.
   Intended as a tool for upgrading from H2 to a 'real' Database.

   Defaults to using `@metabase.db/db-file` as the connection string."
  [h2-connection-string-or-nil]
  (db/setup-db)
  (let [h2-filename    (or h2-connection-string-or-nil @metabase.db/db-file)
        target-db-spec (db/jdbc-details @db/db-connection-details)]
    ;; NOTE: would be nice to add `ACCESS_MODE_DATA=r` but it doesn't work with `AUTO_SERVER=TRUE`
    ;; connect to H2 database, which is what we are migrating from
    (jdbc/with-db-connection [h2-conn (db/jdbc-details {:type :h2, :db (str h2-filename ";IFEXISTS=TRUE")})]
      (jdbc/with-db-transaction [target-db-conn target-db-spec]
        (binding [*target-db-connection* target-db-conn]
          (doseq [e     entities
                  :let  [rows (for [row (jdbc/query h2-conn [(str "SELECT * FROM " (name (:table e)))])]
                                (m/map-vals u/jdbc-clob->str row))]
                  :when (seq rows)]
            (if-not (contains? self-referencing-entities e)
              (insert-entity! e rows)
              (insert-self-referencing-entity! e rows))))))

    ;; if we are loading into a postgres db then we need to update sequence nextvals
    (when (= (config/config-str :mb-db-type) "postgres")
      (jdbc/with-db-transaction [target-db-conn target-db-spec]
        (binding [*target-db-connection* target-db-conn]
          (set-postgres-sequence-values!))))))

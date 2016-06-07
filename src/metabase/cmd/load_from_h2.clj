(ns metabase.cmd.load-from-h2
  "Commands for loading data from an H2 file into another database."
  (:require [colorize.core :as color]
            (korma [core :as k]
                   [db :as kdb])
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
                             [foreign-key :refer [ForeignKey]]
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
            [metabase.util :as u]
            [clojure.set :as set]))

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
   ForeignKey
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

(defn- insert-entity [e objs]
  (print (u/format-color 'blue "Transfering %d instances of %s..." (count objs) (:name e)))
  (flush)
  ;; The connection closes prematurely on occasion when we're inserting thousands of rows at once. Break into smaller chunks so connection stays alive
  (doseq [chunk (partition-all 300 objs)]
    (print (color/blue \.))
    (flush)
    (k/insert e (k/values chunk)))
  (println (color/green "[OK]")))

(defn- insert-self-referencing-entity [e objs]
  (let [self-ref-attr    (condp = e
                           RawColumn :fk_target_column_id
                           Field     :fk_target_field_id)
        self-referencing (filter self-ref-attr objs)
        others           (set/difference (set objs) (set self-referencing))]
    ;; first insert the non-self-referencing objects
    (insert-entity e others)
    ;; then insert the rest, which should be safe to insert now
    (insert-entity e self-referencing)))

(defn load-from-h2
  "Transfer data from existing H2 database to the newly created (presumably MySQL or Postgres) DB specified by env vars.
   Intended as a tool for upgrading from H2 to a 'real' Database.

   Defaults to using `@metabase.db/db-file` as the connection string."
  [h2-connection-string-or-nil]
  (let [filename (or h2-connection-string-or-nil
                     @metabase.db/db-file)
        h2-db    (kdb/create-db (db/jdbc-details {:type :h2, :db (str filename ";IFEXISTS=TRUE")}))] ; TODO - would be nice to add `ACCESS_MODE_DATA=r` but it doesn't work with `AUTO_SERVER=TRUE`
    (db/setup-db)
    (kdb/transaction
     (doseq [e     entities
             :let  [objs (kdb/with-db h2-db
                           (k/select (k/database e h2-db)))]
             :when (seq objs)]
       (if-not (contains? #{RawColumn Field} e)
         (insert-entity e objs)
         (insert-self-referencing-entity e objs))))))

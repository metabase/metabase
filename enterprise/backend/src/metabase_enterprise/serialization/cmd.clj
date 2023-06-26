(ns metabase-enterprise.serialization.cmd
  (:refer-clojure :exclude [load])
  (:require
   [metabase-enterprise.serialization.dump :as dump]
   [metabase-enterprise.serialization.load :as load]
   [metabase-enterprise.serialization.v2.extract :as v2.extract]
   [metabase-enterprise.serialization.v2.ingest.yaml :as v2.ingest]
   [metabase-enterprise.serialization.v2.load :as v2.load]
   [metabase-enterprise.serialization.v2.seed-entity-ids :as v2.seed-entity-ids]
   [metabase-enterprise.serialization.v2.storage.yaml :as v2.storage]
   [metabase.db :as mdb]
   [metabase.models.card :refer [Card]]
   [metabase.models.collection :refer [Collection]]
   [metabase.models.dashboard :refer [Dashboard]]
   [metabase.models.database :refer [Database]]
   [metabase.models.field :as field :refer [Field]]
   [metabase.models.metric :refer [Metric]]
   [metabase.models.native-query-snippet :refer [NativeQuerySnippet]]
   [metabase.models.pulse :refer [Pulse]]
   [metabase.models.segment :refer [Segment]]
   [metabase.models.table :refer [Table]]
   [metabase.models.user :refer [User]]
   [metabase.plugins :as plugins]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-trs trs]]
   [metabase.util.log :as log]
   [metabase.util.schema :as su]
   [schema.core :as s]
   [toucan.db :as db]))

(set! *warn-on-reflection* true)

(def ^:private Mode
  (su/with-api-error-message (s/enum :skip :update)
    (deferred-trs "invalid --mode value")))

(def ^:private OnError
  (su/with-api-error-message (s/enum :continue :abort)
    (deferred-trs "invalid --on-error value")))

(def ^:private Context
  (su/with-api-error-message
    {(s/optional-key :on-error) OnError
     (s/optional-key :mode)     Mode}
    (deferred-trs "invalid context seed value")))

(s/defn v1-load
  "Load serialized metabase instance as created by [[dump]] command from directory `path`."
  [path context :- Context]
  (plugins/load-plugins!)
  (mdb/setup-db!)
  (when-not (load/compatible? path)
    (log/warn (trs "Dump was produced using a different version of Metabase. Things may break!")))
  (let [context (merge {:mode     :skip
                        :on-error :continue}
                       context)]
    (try
      (log/info (trs "BEGIN LOAD from {0} with context {1}" path context))
      (let [all-res    [(load/load (str path "/users") context)
                        (load/load (str path "/databases") context)
                        (load/load (str path "/collections") context)
                        (load/load-settings path context)]
            reload-fns (filter fn? all-res)]
        (when (seq reload-fns)
          (log/info (trs "Finished first pass of load; now performing second pass"))
          (doseq [reload-fn reload-fns]
            (reload-fn)))
        (log/info (trs "END LOAD from {0} with context {1}" path context)))
      (catch Throwable e
        (log/error e (trs "ERROR LOAD from {0}: {1}" path (.getMessage e)))
        (throw e)))))

(defn v2-load
  "SerDes v2 load entry point"
  [path]
  (plugins/load-plugins!)
  (mdb/setup-db!)
  ; TODO This should be restored, but there's no manifest or other meta file written by v2 dumps.
  ;(when-not (load/compatible? path)
  ;  (log/warn (trs "Dump was produced using a different version of Metabase. Things may break!")))
  (log/info (trs "Loading serialized Metabase files from {0}" path))
  (v2.load/load-metabase (v2.ingest/ingest-yaml path)))

(defn- select-entities-in-collections
  ([model collections]
   (select-entities-in-collections model collections :all))
  ([model collections state]
   (let [state-filter (case state
                        :all nil
                        :active [:= :archived false])]
     (db/select model {:where [:and
                               [:or [:= :collection_id nil]
                                (if (not-empty collections)
                                  [:in :collection_id (map u/the-id collections)]
                                  false)]
                               state-filter]}))))

(defn- select-segments-in-tables
  ([tables]
   (select-segments-in-tables tables :all))
  ([tables state]
   (case state
     :all
     (mapcat #(db/select Segment :table_id (u/the-id %)) tables)
     :active
     (filter
      #(not (:archived %))
      (mapcat #(db/select Segment :table_id (u/the-id %)) tables)))))

(defn- select-collections
  "Selects the collections for a given user-id, or all collections without a personal ID if the passed user-id is nil.
  If `state` is passed (by default, `:active`), then that will be used to filter for collections that are archived (if
  the value is passed as `:all`)."
  ([users]
   (select-collections users :active))
  ([users state]
   (let [state-filter     (case state
                            :all nil
                            :active [:= :archived false])
         base-collections (db/select Collection {:where [:and [:= :location "/"]
                                                              [:or [:= :personal_owner_id nil]
                                                                   [:= :personal_owner_id
                                                                       (some-> users first u/the-id)]]
                                                              state-filter]})]
     (if (empty? base-collections)
       []
       (-> (db/select Collection
                             {:where [:and
                                      (reduce (fn [acc coll]
                                                (conj acc [:like :location (format "/%d/%%" (:id coll))]))
                                              [:or] base-collections)
                                      state-filter]})
           (into base-collections))))))


(defn v1-dump
  "Legacy Metabase app data dump"
  [path {:keys [state user] :or {state :active} :as opts}]
  (log/info (trs "BEGIN DUMP to {0} via user {1}" path user))
  (mdb/setup-db!)
  (db/select User) ;; TODO -- why??? [editor's note: this comment originally from Cam]
  (let [users       (if user
                      (let [user (db/select-one User
                                                :email        user
                                                :is_superuser true)]
                        (assert user (trs "{0} is not a valid user" user))
                        [user])
                      [])
        databases   (if (contains? opts :only-db-ids)
                      (db/select Database :id [:in (:only-db-ids opts)] {:order-by [[:id :asc]]})
                      (db/select Database))
        tables      (if (contains? opts :only-db-ids)
                      (db/select Table :db_id [:in (:only-db-ids opts)] {:order-by [[:id :asc]]})
                      (db/select Table))
        fields      (if (contains? opts :only-db-ids)
                      (db/select Field :table_id [:in (map :id tables)] {:order-by [[:id :asc]]})
                      (db/select Field))
        metrics     (if (contains? opts :only-db-ids)
                      (db/select Metric :table_id [:in (map :id tables)] {:order-by [[:id :asc]]})
                      (db/select Metric))
        collections (select-collections users state)]
    (dump/dump path
               databases
               tables
               (mapcat field/with-values (u/batches-of 32000 fields))
               metrics
               (select-segments-in-tables tables state)
               collections
               (select-entities-in-collections NativeQuerySnippet collections state)
               (select-entities-in-collections Card collections state)
               (select-entities-in-collections Dashboard collections state)
               (select-entities-in-collections Pulse collections state)
               users))
  (dump/dump-settings path)
  (dump/dump-dimensions path)
  (log/info (trs "END DUMP to {0} via user {1}" path user)))

(defn- v2-extract
  "Extract entities to store. Takes map of options.
   :collections - optional seq of collection IDs"
  [{:keys [collections] :as opts}]
  (let [opts (cond-> opts
               collections
               (assoc :targets (for [c collections] ["Collection" c])))]
    ;; if we have `:targets` (either because we created them from `:collections`, or because they were specified
    ;; elsewhere) use [[v2.extract/extract-subtrees]]
    (if (:targets opts)
      (v2.extract/extract-subtrees opts)
      (v2.extract/extract-metabase opts))))

(defn v2-dump
  "Exports Metabase app data to directory at path"
  [path opts]
  (log/info (trs "Exporting Metabase to {0}" path) (u/emoji "🏭 🚛💨"))
  (mdb/setup-db!)
  (db/select User) ;; TODO -- why??? [editor's note: this comment originally from Cam]
  (-> (v2-extract opts)
      (v2.storage/store! path))
  (log/info (trs "Export to {0} complete!" path) (u/emoji "🚛💨 📦")))

(defn seed-entity-ids
  "Add entity IDs for instances of serializable models that don't already have them.

  Returns truthy if all entity IDs were added successfully, or falsey if any errors were encountered."
  []
  (v2.seed-entity-ids/seed-entity-ids!))

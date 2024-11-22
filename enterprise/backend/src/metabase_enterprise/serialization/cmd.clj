(ns metabase-enterprise.serialization.cmd
  (:refer-clojure :exclude [load])
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.serialization.dump :as dump]
   [metabase-enterprise.serialization.load :as load]
   [metabase-enterprise.serialization.serialize :as serialize]
   [metabase-enterprise.serialization.v2.entity-ids :as v2.entity-ids]
   [metabase-enterprise.serialization.v2.extract :as v2.extract]
   [metabase-enterprise.serialization.v2.ingest :as v2.ingest]
   [metabase-enterprise.serialization.v2.load :as v2.load]
   [metabase-enterprise.serialization.v2.storage :as v2.storage]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.db :as mdb]
   [metabase.models.card :refer [Card]]
   [metabase.models.collection :as collection :refer [Collection]]
   [metabase.models.dashboard :refer [Dashboard]]
   [metabase.models.database :refer [Database]]
   [metabase.models.field :as field :refer [Field]]
   [metabase.models.native-query-snippet :refer [NativeQuerySnippet]]
   [metabase.models.pulse :refer [Pulse]]
   [metabase.models.segment :refer [Segment]]
   [metabase.models.serialization :as serdes]
   [metabase.models.table :refer [Table]]
   [metabase.models.user :refer [User]]
   [metabase.plugins :as plugins]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.setup :as setup]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-trs trs]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]
   [metabase.models.permissions-group-membership :as perms-group-membership])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(def ^:private Mode
  (mu/with-api-error-message [:enum :skip :update]
                             (deferred-trs "invalid --mode value")))

(def ^:private OnError
  (mu/with-api-error-message [:enum :continue :abort]
                             (deferred-trs "invalid --on-error value")))

(def ^:private Context
  (mu/with-api-error-message
   [:map {:closed true}
    [:on-error {:optional true} OnError]
    [:mode     {:optional true} Mode]]
   (deferred-trs "invalid context seed value")))

(defn- check-premium-token! []
  (premium-features/assert-has-feature :serialization (trs "Serialization")))

(mu/defn v1-load!
  "Load serialized metabase instance as created by [[dump]] command from directory `path`."
  [path context :- Context]
  (plugins/load-plugins!)
  (mdb/setup-db! :create-sample-content? false)
  (check-premium-token!)
  (when-not (load/compatible? path)
    (log/warn "Dump was produced using a different version of Metabase. Things may break!"))
  (let [context (merge {:mode     :skip
                        :on-error :continue}
                       context)]
    (try
      (log/infof "BEGIN LOAD from %s with context %s" path context)
      (let [all-res    [(load/load! (str path "/users") context)
                        (load/load! (str path "/databases") context)
                        (load/load! (str path "/collections") context)
                        (load/load-settings! path context)]
            reload-fns (filter fn? all-res)]
        (when (seq reload-fns)
          (log/info "Finished first pass of load; now performing second pass")
          (doseq [reload-fn reload-fns]
            (reload-fn)))
        (log/infof "END LOAD from %s with context %s" path context))
      (catch Throwable e
        (log/errorf e "ERROR LOAD from %s: %s" path (.getMessage e))
        (throw e)))))

(mu/defn v2-load-internal!
  "SerDes v2 load entry point for internal users.

  `opts` are passed to [[v2.load/load-metabase]]."
  [path :- :string
   opts :- [:map
            [:backfill? {:optional true} [:maybe :boolean]]
            [:continue-on-error {:optional true} [:maybe :boolean]]]
   ;; Deliberately separate from the opts so it can't be set from the CLI.
   & {:keys [token-check?
             require-initialized-db?]
      :or   {token-check? true
             require-initialized-db? true}}]
  (plugins/load-plugins!)
  (mdb/setup-db! :create-sample-content? false)
  (when (and require-initialized-db? (not (setup/has-user-setup)))
    (throw (ex-info "You cannot `import` into an empty database. Please set up Metabase normally, then retry." {})))
  (when token-check?
    (check-premium-token!))
  ; TODO This should be restored, but there's no manifest or other meta file written by v2 dumps.
  ;(when-not (load/compatible? path)
  ;  (log/warn "Dump was produced using a different version of Metabase. Things may break!"))
  (log/infof "Loading serialized Metabase files from %s" path)
  (serdes/with-cache
    (v2.load/load-metabase! (v2.ingest/ingest-yaml path) opts)))

(mu/defn v2-load!
  "SerDes v2 load entry point.

   opts are passed to load-metabase"
  [path :- :string
   opts :- [:map
            [:backfill? {:optional true} [:maybe :boolean]]
            [:continue-on-error {:optional true} [:maybe :boolean]]
            [:full-stacktrace {:optional true} [:maybe :boolean]]]]
  (let [timer    (u/start-timer)
        err      (atom nil)
        report   (try
                   (v2-load-internal! path opts :token-check? true)
                   (catch ExceptionInfo e
                     (reset! err e))
                   (catch Exception e
                     (reset! err e)))
        imported (into (sorted-set) (map (comp :model last)) (:seen report))]
    (snowplow/track-event! ::snowplow/serialization
                           {:event         :serialization
                            :direction     "import"
                            :source        "cli"
                            :duration_ms   (int (u/since-ms timer))
                            :models        (str/join "," imported)
                            :count         (if (contains? imported "Setting")
                                             (inc (count (remove #(= "Setting" (:model (first %))) (:seen report))))
                                             (count (:seen report)))
                            :error_count   (count (:errors report))
                            :success       (nil? @err)
                            :error_message (when @err
                                             (u/strip-error @err nil))})
    (when @err
      (if (:full-stacktrace opts)
        (log/error @err "Error during deserialization")
        (log/error (u/strip-error @err "Error during deserialization")))
      (throw (ex-info (ex-message @err) {:cmd/exit true})))
    imported))

(defn- select-entities-in-collections
  ([model collections]
   (select-entities-in-collections model collections :all))
  ([model collections state]
   (let [state-filter (case state
                        :all nil
                        :active [:= :archived false])]
     (t2/select model {:where [:and
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
     (mapcat #(t2/select Segment :table_id (u/the-id %)) tables)
     :active
     (filter
      #(not (:archived %))
      (mapcat #(t2/select Segment :table_id (u/the-id %)) tables)))))

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
         base-collections (t2/select Collection {:where [:and [:= :location "/"]
                                                         [:or [:= :personal_owner_id nil]
                                                          [:= :personal_owner_id
                                                           (some-> users first u/the-id)]]
                                                         state-filter]})]
     (if (empty? base-collections)
       []
       (-> (t2/select Collection
                      {:where [:and
                               (reduce (fn [acc coll]
                                         (conj acc [:like :location (format "/%d/%%" (:id coll))]))
                                       [:or] base-collections)
                               state-filter]})
           (into base-collections))))))

(defn v1-dump!
  "Legacy Metabase app data dump"
  [path {:keys [state user include-entity-id] :or {state :active} :as opts}]
  (log/infof "BEGIN DUMP to %s via user %s" path user)
  (mdb/setup-db! :create-sample-content? false)
  (check-premium-token!)
  (t2/select User) ;; TODO -- why??? [editor's note: this comment originally from Cam]
  (let [users       (if user
                      (let [user (t2/select-one User
                                                :email        user
                                                :is_superuser true)]
                        (assert user (trs "{0} is not a valid user" user))
                        [user])
                      [])
        databases   (if (contains? opts :only-db-ids)
                      (t2/select Database :id [:in (:only-db-ids opts)] {:order-by [[:id :asc]]})
                      (t2/select Database))
        tables      (if (contains? opts :only-db-ids)
                      (t2/select Table :db_id [:in (:only-db-ids opts)] {:order-by [[:id :asc]]})
                      (t2/select Table))
        fields      (if (contains? opts :only-db-ids)
                      (t2/select Field :table_id [:in (map :id tables)] {:order-by [[:id :asc]]})
                      (t2/select Field))
        collections (select-collections users state)]
    (binding [serialize/*include-entity-id* (boolean include-entity-id)]
      (dump/dump! path
                  databases
                  tables
                  (mapcat field/with-values (u/batches-of 32000 fields))
                  (select-segments-in-tables tables state)
                  collections
                  (select-entities-in-collections NativeQuerySnippet collections state)
                  (select-entities-in-collections Card collections state)
                  (select-entities-in-collections Dashboard collections state)
                  (select-entities-in-collections Pulse collections state)
                  users)))
  (dump/dump-settings! path)
  (dump/dump-dimensions! path)
  (log/infof "END DUMP to %s via user %s" path user))

(defn v2-dump!
  "Exports Metabase app data to directory at path"
  [path {:keys [collection-ids] :as opts}]
  (log/infof "Exporting Metabase to %s" path)
  (mdb/setup-db! :create-sample-content? false)
  (check-premium-token!)
  (t2/select User) ;; TODO -- why??? [editor's note: this comment originally from Cam]
  (let [f (io/file path)]
    (.mkdirs f)
    (when-not (.canWrite f)
      (throw (ex-info (format "Destination path is not writeable: %s" path) {:filename path}))))
  (let [start  (System/nanoTime)
        err    (atom nil)
        opts   (cond-> opts
                 (seq collection-ids)
                 (assoc :targets (v2.extract/make-targets-of-type "Collection" collection-ids)))
        report (try
                 (serdes/with-cache
                   (-> (v2.extract/extract opts)
                       (v2.storage/store! path)))
                 (catch Exception e
                   (reset! err e)))]
    (snowplow/track-event! ::snowplow/serialization
                           {:event           :serialization
                            :direction       "export"
                            :source          "cli"
                            :duration_ms     (int (/ (- (System/nanoTime) start) 1e6))
                            :count           (count (:seen report))
                            :error_count     (count (:errors report))
                            :collection      (str/join "," collection-ids)
                            :all_collections (and (empty? collection-ids)
                                                  (not (:no-collections opts)))
                            :data_model      (not (:no-data-model opts))
                            :settings        (not (:no-settings opts))
                            :field_values    (boolean (:include-field-values opts))
                            :secrets         (boolean (:include-database-secrets opts))
                            :success         (nil? @err)
                            :error_message   (when @err
                                               (u/strip-error @err nil))})
    (when @err
      (if (:full-stacktrace opts)
        (log/error @err "Error during serialization")
        (log/error (u/strip-error @err "Error during deserialization")))
      (throw (ex-info (ex-message @err) {:cmd/exit true})))
    (log/info (format "Export to '%s' complete!" path) (u/emoji "🚛💨 📦"))
    report))

(defn seed-entity-ids!
  "Add entity IDs for instances of serializable models that don't already have them.

  Returns truthy if all entity IDs were added successfully, or falsey if any errors were encountered."
  []
  (v2.entity-ids/seed-entity-ids!))

(defn drop-entity-ids!
  "Drop entity IDs for all instances of serializable models.

  This is needed for some cases of migrating from v1 to v2 serdes. v1 doesn't dump `entity_id`, so they may have been
  randomly generated independently in both instances. Then when v2 serdes is used to export and import, the randomly
  generated IDs don't match and the entities get duplicated. Dropping `entity_id` from both instances first will force
  them to be regenerated based on the hashes, so they should match up if the receiving instance is a copy of the sender.

  Returns truthy if all entity IDs have been dropped, or falsey if any errors were encountered."
  []
  (v2.entity-ids/drop-entity-ids!))


;; (defn find-connected-entities
;;   "Extract everything that touches entity.

;;   If entity is a card, we should be able to recreate: the entire field -> table -> schema -> database tree.
;;   If entity is a dashboard, we should be able to recreate: all cards, their fields -> tables -> schemas -> database tree.
;;   If entity is a collection, we should be able to recreate: all dashboards, their fields -> tables -> schemas -> database tree"
;;   [entity-type entity-id]
;;   (case entity-type
;;     :model/Card
;;     )


;;   )


(defn- distinct-keep [k coll] (distinct (keep k coll)))

(defn dependencies*
  "Finds 'upstream' entities for a given model. This is used to determine what other entities need to be dumped to recreate the state of a given entity."
  [model-type id]
  (case model-type
    :model/Database []
    :model/Permissions []
    :model/Dimension []

    ;; TODO
    ;; :model/DashboardTab


    :model/Table
    (concat
     (mapv (fn [db-id] [:model/Database db-id])
           (distinct-keep :db_id (t2/select [:model/Table :db_id] id)))
     (mapv (fn [field-id] [:model/Field field-id])
           (distinct-keep :id (t2/select [:model/Field :id] :table_id id))))

    ;; we grab more fields than we may need, but that's fine
    :model/Field
    (concat
     (mapv (fn [table-id] [:model/Table table-id])
           (distinct-keep :table_id (t2/select [:model/Field :table_id] id)))
     (mapv (fn [dimension-id] [:model/Dimension dimension-id])
           (distinct-keep :dimension_id (t2/select [:model/Dimension :id] :field_id id))))

    :model/User
    (mapv (fn [perm-group-id] [:model/PermissionsGroup perm-group-id])
          (distinct-keep :group_id (t2/select [:model/PermissionsGroupMembership :group_id])))

    :model/PermissionsGroup
    (let [perms-group-membership (t2/select [:model/PermissionsGroupMembership :group_id] :id id)]
      (concat
       (mapv (fn [perm-id] [:model/Permissions perm-id])
             (distinct-keep :group_id perms-group-membership))
       (mapv (fn [perm-membership-id] [:model/PermissionsGroupMembership perm-membership-id])
             (distinct-keep :id perms-group-membership))))

    :model/PermissionsGroupMembership
    (let [perms-group-membership (t2/select [:model/PermissionsGroupMembership :group_id] :id id)]
      (concat
       (mapv (fn [perm-id] [:model/Permissions perm-id])
             (distinct-keep :group_id perms-group-membership))
       (mapv (fn [perm-membership-id] [:model/PermissionsGroupMembership perm-membership-id])
             (distinct-keep :id perms-group-membership))))


    :model/Card
    (let [cards (t2/select [:model/Card :table_id :source_card_id :collection_id :creator_id] id)]
      (concat
       (mapv (fn [db-id] [:model/Table db-id]) (distinct-keep :table_id cards))
       (mapv (fn [card-id] [:model/Card card-id]) (distinct-keep :source_card_id cards))
       (mapv (fn [coll-id] [:model/Collection coll-id]) (distinct-keep :collection_id cards))
       (mapv (fn [user-id] [:model/User user-id]) (distinct-keep :creator_id cards))))

    :model/Dashboard
    (let [dashboard-cards
          (t2/query {:select [:dashcard.id :dashcard.card_id :dashcard.dashboard_id]
                     :from   [[:report_dashboardcard :dashcard]]
                     :join   [[:report_card :card] [:= :dashcard.card_id :card.id]]
                     :where [:= :dashcard.dashboard_id id]})]
      (concat
       (mapv (fn [card-id] [:model/Card card-id]) (distinct-keep :card_id dashboard-cards))
       (mapv (fn [dc-id] [:model/DashboardCard dc-id]) (distinct-keep :id dashboard-cards))))

    :model/DashboardCard
    (let [dc (t2/select-one [:model/DashboardCard :card_id :dashboard_id] :id id)]
      [[:model/Dashboard (:dashboard_id dc)] [:model/Card (:card_id dc)]])

    :model/Collection
    (concat
     ;; contained dashboards
     (mapv
      (fn [db-id] [:model/Dashboard db-id])
      (distinct-keep :id (t2/select [:model/Dashboard :id] :collection_id id)))
     ;; contained cards
     (mapv
      (fn [card-id] [:model/Card card-id])
      (distinct-keep :id (t2/select [:model/Card :id] :collection_id id)))
     ;; contained collections
     (mapv
      (fn [collection-id] [:model/Collection collection-id])
      (distinct-keep :id (t2/select [:model/Collection :id] {:where [:like :location (str "%" id "%")]}))))))

(comment

  (t2/select-one :model/Permissions)
  (t2/select-one :model/PermissionsGroup)
  (t2/select-one :model/PermissionsGroupMembership)

  (dependencies* :model/User 1)
;; => [[:model/PermissionsGroup 1] [:model/PermissionsGroup 2]]

  (dependencies :model/Card 113)

  (dependencies :model/Permissions 1)

  (let [model :model/PermissionsGroup
        id 1]
    (let [perms-group-membership (t2/select [:model/PermissionsGroupMembership :group_id] :id id)]
      (concat
       (mapv (fn [perm-id] [:model/Permissions perm-id])
             (distinct-keep :group_id perms-group-membership))
       (mapv (fn [perm-membership-id] [:model/PermissionsGroupMembership perm-membership-id])
               (distinct-keep :id (t2/select [:model/PermissionsGroupMembership :id] :group_id id))))))

  (dependencies :model/Card 113)

  )

(defn dependencies
  "Finds upstream models, used to flow health warnings forward through the entity system"
  ([model-type id]
   (cond-> (dependencies model-type id #{})
     (t2/exists? model-type id) (conj [model-type id])
     true                       sort
     true                       vec))
  ([model-type id seen]
   (loop [queue (dependencies* model-type id) seen seen]
     (if (empty? queue)
       seen
       (let [[m id] (first queue)]
         (if (contains? seen [m id])
           ;; skip if we've already seen this entity
           (recur (rest queue) seen)
           ;; otherwise, add the dependencies of this entity to the queue
           (recur (into (rest queue)
                        (dependencies* m id))
                  (conj seen [m id]))))))))

(comment
  (require '[metabase.models.serialization :as serdes])
  (dependencies :model/Card 108)
  #{[:model/Database 1] [:model/Card 108] [:model/Table 6]}
  (serdes/extract-one "Card" {} (t2/select-one :model/Card :id 108))

  (dependencies :model/Collection 2)

  ;; => #{[:model/Collection 6] [:model/Card 112] [:model/Database 8] [:model/Table 31]}

  )


(defn- add-entity-id [instance]
  (assoc instance :entity_id (t2/select-one-fn :entity_id [:model/User :entity_id] :id (:id instance))))

(defn- extract-one-preprocess [model-type instance]
  (case model-type
    :model/Field (t2/hydrate instance :dimensions)
    :model/User (add-entity-id instance)
    :model/PermissionsGroup (add-entity-id instance)
    instance))

(defn extract-one [[model id]]
  (serdes/extract-one (name model) {}
                      (->> (t2/select-one model :id id)
                           (extract-one-preprocess model)
                           (into {}))))

(defn extract-upstream [model-type id]
  (mapv (fn [[model id]]
          (extract-one [model id])) (dependencies model-type id)))
(comment

  (dependencies :model/Card 113)
  (map :serdes/meta [(extract-one [:model/Card 113])
                     (extract-one [:model/Database 8])
                     (extract-one [:model/Field 303])
                     (extract-one [:model/Field 304])
                     (extract-one [:model/Field 305])
                     (extract-one [:model/Field 306])
                     (extract-one [:model/Field 307])
                     (extract-one [:model/Field 308])
                     (extract-one [:model/Field 309])
                     (extract-one [:model/Field 310])
                     (extract-one [:model/Field 311])
                     (extract-one [:model/Permissions 1])
                     (extract-one [:model/PermissionsGroup 1])
                     (extract-one [:model/PermissionsGroup 2])
                     (extract-one [:model/Table 31])
                     (extract-one [:model/User 1])])
  (extract-one [:model/Card 113])

  (def to-extract (dependencies :model/Card 113))

  (extract-upstream :model/Card 113)

  (def extracted-things (extract-upstream :model/Card 113))

  (map :serdes/meta extracted-things)
  ;; ([{:model "Collection", :id "u8TF1p7cZzamfiYdRoSWX", :label "sqlite_db_coll"}]
  ;;  [{:model "Card", :id "Lyj_5AKS3aUUYFGwt0k4N", :label "namespace_definitions"}]
  ;;  [{:model "Database", :id "my_sqlite_db"}]
  ;;  [{:model "Database", :id "my_sqlite_db"} {:model "Table", :id "namespace_definitions"}])


  (mapv (fn [x] (serdes/load-one! x nil)) extracted-things)




  )

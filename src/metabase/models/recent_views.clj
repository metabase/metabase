(ns metabase.models.recent-views
  "The Recent Views table is used to track the most recent views of objects such as Cards, Models, Tables, Dashboards,
  and Collections for each user. For an up to date list, see [[models-of-interest]].

  It offers a simple API to add a recent, and fetch the list of recents.

  Fetch recent items: `(recent-view/get-list <user-id>)`
                        see: [[get-list]]
  add recent item:    `(recent-views/update-users-recent-views! <user-id> <model> <model-id>)`
                        see: [[update-users-recent-views!]]

  When adding a recent item, duplicates will be removed, and [[*recent-views-stored-per-user-per-model*]] (20
  currently) are kept of each entity type. E.G., if you were to view lots of _cards_, it would not push collections and
  dashboards out of your recents."
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.set :as set]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.models.collection.root :as root]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [steffan-westcott.clj-otel.api.trace.span :as span]
   [toucan2.core :as t2]))

(doto :model/RecentViews (derive :metabase/model))

(methodical/defmethod t2/table-name :model/RecentViews [_model] :recent_views)

(t2/define-before-insert :model/RecentViews
  [log-entry]
  (let [defaults {:timestamp (t/zoned-date-time)}]
    (merge defaults log-entry)))

(def ^:dynamic *recent-views-stored-per-user-per-model*
  "The number of recently viewed items to keep per user per model. This is used to keep the most recent views of each
  model type in [[models-of-interest]]."
  20)

(defn- duplicate-model-ids
  "Returns a set of IDs of duplicate models in the RecentViews table. Duplicate means that the same model and model_id
   shows up more than once. This returns the ids for the copies that are not the most recent entry."
  [user-id]
  (->> (t2/select :model/RecentViews :user_id user-id {:order-by [[:timestamp :desc]]})
       (group-by (juxt :model :model_id))
       ;; skip the first row for each group, since it's the most recent
       (mapcat (fn [[_ rows]] (drop 1 rows)))
       (map :id)
       set))

(def models-of-interest
  "These are models for which we will retrieve recency."
  [:card :model ;; note: these are both stored in recent_views as "card", and a join with report_card is needed to
                ;;       distinguish between them.
   :dashboard :table :collection])

(defn- ids-to-prune-for-user+model [user-id model]
  (t2/select-fn-set :id
                    :model/RecentViews
                    {:select [:rv.id]
                     :from [[:recent_views :rv]]
                     :where [:and
                             [:= :rv.model (get {:model "card"} model (name model))]
                             [:= :rv.user_id user-id]
                             (when (#{:card :model} model)
                               [:= :rc.type (cond (= model :card) (h2x/literal "question")
                                                  (= model :model) (h2x/literal "model"))])]
                     :left-join [[:report_card :rc]
                                 [:and
                                  [:= :rc.id :rv.model_id]
                                  [:= :rv.model (h2x/literal "card")]]]
                     :order-by [[:rv.timestamp :desc]]
                     ;; mysql doesn't support offset without limit :derp:
                     :limit 100000
                     :offset *recent-views-stored-per-user-per-model*}))

(defn- overflowing-model-buckets [user-id]
  (into #{} (mapcat #(ids-to-prune-for-user+model user-id %)) models-of-interest))

(defn ids-to-prune
  "Returns IDs to prune, which includes 2 things:
  1. duplicated views for (user-id, model, model_id), this will return the IDs of the non-latest duplicates.
  2. views that are older than the most recent *recent-views-stored-per-user-per-model* views for the user. "
  [user-id]
  (set/union
   (duplicate-model-ids user-id)
   (overflowing-model-buckets user-id)))

(mu/defn update-users-recent-views!
  "Updates the RecentViews table for a given user with a new view, and prunes old views."
  [user-id  :- [:maybe ms/PositiveInt]
   model    :- [:or
                [:enum :model/Card :model/Table :model/Dashboard :model/Collection]
                :string]
   model-id :- ms/PositiveInt]
  (when user-id
    (span/with-span!
      {:name       "update-users-recent-views!"
       :attributes {:model/id   model-id
                    :user/id    user-id
                    :model/name (u/lower-case-en model)}}
      (t2/with-transaction [_conn]
        (t2/insert! :model/RecentViews {:user_id  user-id
                                        :model    (u/lower-case-en (name model))
                                        :model_id model-id})
        (let [ids-to-prune (ids-to-prune user-id)]
          (when (seq ids-to-prune)
            (t2/delete! :model/RecentViews :id [:in ids-to-prune])))))))

(defn most-recently-viewed-dashboard-id
  "Returns ID of the most recently viewed dashboard for a given user within the last 24 hours, or `nil`."
  [user-id]
  (t2/select-one-fn
   :model_id
   :model/RecentViews
   {:where    [:and
               [:= :user_id user-id]
               [:= :model (h2x/literal "dashboard")]
               [:> :timestamp (t/minus (t/zoned-date-time) (t/days 1))]]
    :order-by [[:id :desc]]}))

(def Item
  "The shape of a recent view item, returned from `GET /recent_views`."
  [:and {:registry {::pc [:map
                          [:id [:or [:int {:min 1}] [:= "root"]]]
                          [:name :string]
                          [:authority_level [:enum :official nil]]]}}
   [:map
    [:id [:int {:min 1}]]
    [:name :string]
    [:description [:maybe :string]]
    [:model [:enum :dataset :card :dashboard :collection :table]]
    [:can_write :boolean]
    [:timestamp :string]]
   [:multi {:dispatch :model}
    [:card [:map
            [:parent_collection ::pc]
            [:display :string]
            [:moderated_status [:enum "verified" nil]]]]
    [:dataset [:map
               [:parent_collection ::pc]
               [:moderated_status [:enum "verified" nil]]]]
    [:dashboard [:map [:parent_collection ::pc]]]
    [:table [:map
             [:display_name :string]
             [:database [:map
                         [:id [:int {:min 1}]]
                         [:name :string]]]]]
    [:collection [:map
                  [:parent_collection ::pc]
                  [:authority_level [:enum :official nil]]]]]])

(defn- classify-recent-view
  [{:keys [model #_model_id #_timestamp card_type]}]
  (or (get {"model" :dataset "question" :card} card_type)
      (keyword model)))

(defmulti fill-recent-view-info
  "Fills in additional information for a recent view, such as the display name of the object.

  - When called from `GET /popular_items`, the `model_object` field will be present, and should be used instead of
  querying the database for the object."
  classify-recent-view)

(defmethod fill-recent-view-info :default [m] (throw (ex-info "Unknown model" {:model m})))

(defn- get-parent-coll*
  "Gets parent collection info for a recent view item."
  ;; user-id is not used, but we need it to memoize the function correctly
  [coll-id]
  (if (nil? coll-id)
    (root/root-collection-with-ui-details {})
    (-> (t2/select-one :model/Collection coll-id)
        (select-keys [:id :name :authority_level])
        (update :authority_level #(some-> % keyword)))))

(def ^{:private true :arglists '([coll-id])}
  get-parent-coll
  (memoize/ttl get-parent-coll* :ttl/threshold 1000))

(mu/defn get-moderated-status
  "Returns moderated_status for a given model and model-id.

  (Currently only used for cards and models, but ought to be extended to dashboards in the future)"
  [model :- [:enum :card] model-id] :- [:maybe "verified"]
  (-> (t2/select-one [:model/ModerationReview :status]
                     {:where [:and
                              [:= :moderated_item_id model-id]
                              [:= :moderated_item_type (name model)]
                              [:= :most_recent true]]})
      :status))

(defn- ellide-archived
  "Returns the model when it's not archived.
  We use this to ensure that archived models are not returned in the recent views."
  [model]
  (when (false? (:archived model)) model))

(defmethod fill-recent-view-info :card [{:keys [_model model_id timestamp model_object]}]
  (when-let [card (ellide-archived (or model_object (t2/select-one :model/Card model_id)))]
    {:id model_id
     :name (:name card)
     :description (:description card)
     :display (some-> card :display name)
     :model :card
     :can_write (mi/can-write? card)
     :timestamp (str timestamp)
     :moderated_status (get-moderated-status :card model_id)
     :parent_collection (get-parent-coll (:collection_id card))}))

(defmethod fill-recent-view-info :dataset [{:keys [_model model_id timestamp model_object]}]
  (when-let [dataset (ellide-archived (or model_object (t2/select-one :model/Card model_id)))]
    {:id model_id
     :name (:name dataset)
     :description (:description dataset)
     :model :dataset
     :can_write (mi/can-write? dataset)
     :timestamp (str timestamp)
     ;; another table that doesn't differentiate between card and dataset :cry:
     :moderated_status (get-moderated-status :card model_id)
     :parent_collection (get-parent-coll (:collection_id dataset))}))

(defmethod fill-recent-view-info :dashboard [{:keys [_model model_id timestamp model_object]}]
  (when-let [dashboard (ellide-archived
                        (or model_object (t2/select-one :model/Dashboard model_id)))]
    {:id model_id
     :name (:name dashboard)
     :description (:description dashboard)
     :model :dashboard
     :can_write (mi/can-write? dashboard)
     :timestamp (str timestamp)
     :parent_collection (get-parent-coll (:collection_id dashboard))}))

(defmethod fill-recent-view-info :collection [{:keys [_model model_id timestamp model_object]}]
  (when-let [collection (ellide-archived
                         (or model_object (t2/select-one :model/Collection model_id)))]
    {:id model_id
     :name (:name collection)
     :description (:description collection)
     :model :collection
     :can_write (mi/can-write? collection)
     :timestamp (str timestamp)
     :authority_level (:authority_level collection)
     :parent_collection (get-parent-coll (:id collection))}))

(defn- ellide-inactive
  "Used to filter out inactive tables in [[fill-recent-view-info]] for `:table`."
  [model]
  (when (true? (:active model)) model))

(defmethod fill-recent-view-info :table [{:keys [_model model_id timestamp model_object]}]
  (when-let [table (ellide-inactive model_object)]
    {:id model_id
     :name (:name table)
     :description (:description table)
     :model :table
     :display_name (:display_name table)
     :can_write (mi/can-write? table)
     :timestamp (str timestamp)
     :database (let [{:keys [name initial_sync_status]}
                     (t2/select-one [:model/Database :name :initial_sync_status]
                                    (:db_id table))]
                 {:id (:db_id table)
                  :name name
                  :initial_sync_status initial_sync_status})}))

(mu/defn ^:private model->return-model [model :- :keyword]
  (if (#{:question} model) :card model))

(defn ^:private do-query [user-id]
  (t2/select :model/RecentViews {:select [:rv.* [:rc.type :card_type]]
                                 :from [[:recent_views :rv]]
                                 :where [:and [:= :rv.user_id user-id]]
                                 :left-join [[:report_card :rc]
                                             [:and
                                              ;; only want to join on card_type if it's a card
                                              [:= :rv.model "card"]
                                              [:= :rc.id :rv.model_id]]]
                                 :order-by [[:rv.timestamp :desc]]}))

(defn- post-process [entity->id->data recent-view]
  (when recent-view
    (let [entity (some-> recent-view :model keyword)
          id (some-> recent-view :model_id)]
      (when-let [model-object (get-in entity->id->data [entity id])]
        (some-> (assoc recent-view :model_object model-object)
                fill-recent-view-info
                (dissoc :card_type)
                (update :model model->return-model))))))

(defn- entities-for-model [model model-ids]
  (if (seq model-ids)
    (m/index-by :id (t2/select model :id [:in model-ids]))
    {}))

(defn- get-entity->id->data [views]
  (let [{:keys [card dashboard collection table]}
        (as-> views views (group-by (comp keyword :model) views))]
    {:card       (entities-for-model :model/Card       (map :model_id card))
     :dashboard  (entities-for-model :model/Dashboard  (map :model_id dashboard))
     :collection (entities-for-model :model/Collection (map :model_id collection))
     :table      (entities-for-model :model/Table      (map :model_id table))}))

(mu/defn get-list :- [:sequential Item]
  "Gets all recent views for a given user. Returns a list of at most 20 `Item` maps per [[models-of-interest]].

  [[do-query]] can return nils, and we remove them here becuase models can be deleted, and we don't want to show those
  in the recent views."
  [user-id]
  (let [views (do-query user-id)
        entity->id->data (get-entity->id->data views)]
    (->> views
         (map (partial post-process entity->id->data))
         (remove nil?)
         vec)))

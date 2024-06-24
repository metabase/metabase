(ns metabase.models.recent-views
  "The Recent Views table is used to track the most recent views of objects such as Cards, Models, Tables, Dashboards,
  and Collections for each user. For an up to date list, see [[rv-models]].

  It offers a simple API to add a recent view item, and fetch the list of recents.

  Adding Recent Items:
     `(recent-views/update-users-recent-views! <user-id> <model> <model-id> <context>)`
       see: [[update-users-recent-views!]]
  Fetching Recent Items:
     `(recent-views/get-recents <user-id> <context>)`
       returns a map like {:recents [Item]}
       see also: [[get-recents]]

  The recent items are partitioned into model and context buckets. So, when adding a recent item, duplicates will be
  removed, and if there are more than [[*recent-views-stored-per-user-per-model*]] (20 currently) of any entity type,
  the oldest one(s) will be deleted, so that the count stays at least 20.

  Context:
  We want to keep track of recents in multiple contexts. e.g. when selecting a value from the data-picker, that should
  log a recent_view row with context=`selection`. At this time there are only `view` and `selection` contexts.

  E.G., if you were to view lots of _cards_, it would not push collections and dashboards out of your recents.

  [Metrics] TODO:
  At some point in 2024, there was an attempt to add `metric` to the list of recent-view models. This
  was never completed, and the code has not been hooked up. There is no query for metrics, despite there being a
  `:metric` model in the `models-of-interest` list. This is a TODO to complete this work."
  (:require
   [clojure.set :as set]
   [colorize.core :as colorize]
   [java-time.api :as t]
   [malli.core :as mc]
   [malli.error :as me]
   [medley.core :as m]
   [metabase.config :as config]
   [metabase.models.collection.root :as root]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(doto :model/RecentViews (derive :metabase/model))

(t2/deftransforms :model/RecentViews
  {:context mi/transform-keyword})

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
  [user-id context]
  (->> (t2/select :model/RecentViews
                  :user_id user-id
                  :context context
                  {:order-by [[:timestamp :desc]]})
       (group-by (juxt :model :model_id))
       ;; skip the first row for each group, since it's the most recent
       (mapcat (fn [[_ rows]] (drop 1 rows)))
       (map :id)
       set))

(def rv-models
  "These are models for which we will retrieve recency."
  [:card :model ;; n.b.: `:card` and `:model` are stored in recent_views as "card", and a join with report_card is
                ;; needed to distinguish between them.
   :dashboard :table :collection])

(mu/defn rv-model->model
  "Given a rv-model, returns the toucan model identifier for it."
  [rvm :- (into [:enum] rv-models)]
  (get {:model      :model/Card
        :card       :model/Card
        :dashboard  :model/Dashboard
        :table      :model/Table
        :collection :model/Collection}
       rvm))

(defn- ids-to-prune-for-user+model [user-id model context]
  (t2/select-fn-set :id
                    :model/RecentViews
                    {:select [:rv.id]
                     :from [[:recent_views :rv]]
                     :where [:and
                             [:= :rv.model (get {:model "card"} model (name model))]
                             [:= :rv.user_id user-id]
                             [:= :rv.context (h2x/literal (name context))]
                             (when (#{:card :model} model) ;; TODO add metric
                               [:= :rc.type (cond (= model :card) (h2x/literal "question")
                                                  ;; TODO add metric
                                                  (= model :model) (h2x/literal "model"))])]
                     :left-join [[:report_card :rc]
                                 [:and
                                  [:= :rc.id :rv.model_id]
                                  [:= :rv.model (h2x/literal "card")]]]
                     :order-by [[:rv.timestamp :desc]]
                     ;; mysql doesn't support offset without limit :derp:
                     :limit 100000
                     :offset *recent-views-stored-per-user-per-model*}))

(defn- overflowing-model-buckets [user-id context]
  (into #{} (mapcat #(ids-to-prune-for-user+model user-id % context)) rv-models))

(defn ids-to-prune
  "Returns IDs to prune, which includes 2 things:
  1. duplicated views for (user-id, model, model_id, context), this will return the IDs of all duplicates except the newest.
  2. views that are older than the most recent *recent-views-stored-per-user-per-model* views for the user. "
  [user-id context]
  (set/union
   (duplicate-model-ids user-id context)
   (overflowing-model-buckets user-id context)))

(mu/defn update-users-recent-views!
  "Updates the RecentViews table for a given user with a new view, and prunes old views."
  [user-id :- [:maybe ms/PositiveInt]
   model :- [:enum :model/Card :model/Table :model/Dashboard :model/Collection]
   model-id :- ms/PositiveInt
   context :- [:enum :view :selection]]
  (when user-id
    (t2/with-transaction [_conn]
      (t2/insert! :model/RecentViews {:user_id user-id
                                      :model (u/lower-case-en (name model))
                                      :model_id model-id
                                      :context (name context)})
      (let [prune-ids (ids-to-prune user-id context)]
        (when (seq prune-ids)
          (t2/delete! :model/RecentViews :id [:in prune-ids]))))))

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
  (mc/schema
   [:and {:registry {::official [:maybe [:enum :official "official"]]
                     ::verified [:maybe [:enum :verified "verified"]]
                     ::pc [:map
                           [:id [:or [:int {:min 1}] [:= "root"]]]
                           [:name :string]
                           [:authority_level ::official]]}}
    [:map
     [:id [:int {:min 1}]]
     [:name :string]
     [:description [:maybe :string]]
     [:model [:enum :dataset :card :metric :dashboard :collection :table]]
     [:can_write :boolean]
     [:timestamp :string]]
    [:multi {:dispatch :model}
     [:card [:map
             [:display :string]
             [:parent_collection ::pc]
             [:moderated_status ::verified]]]
     [:dataset [:map
                [:parent_collection ::pc]
                [:moderated_status ::verified]]]
     [:metric [:map
               [:display :string]
               [:parent_collection ::pc]
               [:moderated_status ::verified]]]
     [:dashboard [:map [:parent_collection ::pc]]]
     [:table [:map
              [:display_name :string]
              [:database [:map
                          [:id [:int {:min 1}]]
                          [:name :string]]]]]
     [:collection [:map
                   [:parent_collection ::pc]
                   [:effective_location :string]
                   [:authority_level ::official]]]]]))

(defmulti fill-recent-view-info
  "Fills in additional information for a recent view, such as the display name of the object.

  For most items, we gather information from the db in a single query, but certain things are more prudent to check with
  code (e.g. a collection's parent collection.)"
  (fn [{:keys [model #_model_id #_timestamp card_type]}]
    (or (get {"model" :dataset "question" :card} card_type)
        (keyword model))))

(defmethod fill-recent-view-info :default [m] (throw (ex-info "Unknown model" {:model m})))

(defn- ellide-archived
  "Returns the model when it's not archived.
  We use this to ensure that archived models are not returned in the recent views."
  [model]
  (when (false? (:archived model)) model))

(defn- root-coll []
  (select-keys
   (root/root-collection-with-ui-details {})
   [:id :name :authority_level]))

;; == Recent Cards ==

(defn card-recents
  "Query to select card data"
  [card-ids]
  (if-not (seq card-ids)
    []
    (t2/select :model/Card
               {:select [:report_card.name
                         :report_card.description
                         :report_card.archived
                         :report_card.collection_id
                         :report_card.id
                         :report_card.display
                         [:mr.status :moderated-status]
                         [:c.id :collection-id]
                         [:c.name :collection-name]
                         [:c.authority_level :collection-authority-level]]
                :where [:in :report_card.id card-ids]
                :left-join [[:moderation_review :mr]
                            [:and
                             [:= :mr.moderated_item_type "card"]
                             [:= :mr.most_recent true]
                             [:in :mr.moderated_item_id card-ids]]
                            [:collection :c]
                            [:and
                             [:= :c.id :report_card.collection_id]
                             [:= :c.archived false]]]})))

(defmethod fill-recent-view-info :card [{:keys [_model model_id timestamp model_object]}]
  (when-let [card (and
                   (mi/can-read? model_object)
                   (ellide-archived model_object))]
    {:id model_id
     :name (:name card)
     :description (:description card)
     :display (some-> card :display name)
     :model :card
     :can_write (mi/can-write? card)
     :timestamp (str timestamp)
     :moderated_status (:moderated-status card)
     :parent_collection (if (:collection-id card)
                          {:id (:collection-id card)
                           :name (:collection-name card)
                           :authority_level (:collection-authority-level card)}
                          (root-coll))}))

(defmethod fill-recent-view-info :dataset [{:keys [_model model_id timestamp model_object]}]
  (when-let [dataset (and
                      (mi/can-read? model_object)
                      (ellide-archived model_object))]
    {:id model_id
     :name (:name dataset)
     :description (:description dataset)
     :model :dataset
     :can_write (mi/can-write? dataset)
     :timestamp (str timestamp)
     ;; another table that doesn't differentiate between card and dataset :cry:
     :moderated_status (:moderated-status dataset)
     :parent_collection (if (:collection-id dataset)
                          {:id (:collection-id dataset)
                           :name (:collection-name dataset)
                           :authority_level (:collection-authority-level dataset)}
                          (root-coll))}))

;; == Recent Dashboards ==

(defn- dashboard-recents
  "Query to select recent dashboard data"
  [dashboard-ids]
  (if (empty? dashboard-ids)
    []
    (t2/select :model/Dashboard
               {:select [:dash.id
                         :dash.name
                         :dash.description
                         :dash.archived
                         :dash.collection_id
                         [:c.id :collection-id]
                         [:c.name :collection-name]
                         [:c.authority_level :collection-authority-level]]
                :from [[:report_dashboard :dash]]
                :where [:in :dash.id dashboard-ids]
                :left-join [[:collection :c]
                            [:and
                             [:= :c.id :dash.collection_id]
                             [:= :c.archived false]]]})))

(defmethod fill-recent-view-info :dashboard [{:keys [_model model_id timestamp model_object]}]
  (when-let [dashboard (and (mi/can-read? model_object)
                            (ellide-archived model_object))]
    {:id model_id
     :name (:name dashboard)
     :description (:description dashboard)
     :model :dashboard
     :can_write (mi/can-write? dashboard)
     :timestamp (str timestamp)
     :parent_collection (if (:collection_id dashboard)
                          {:id (:collection_id dashboard)
                           :name (:collection-name dashboard)
                           :authority_level (:collection-authority-level dashboard)}
                          (root-coll))}))

;; == Recent Collections ==

(defn- collection-recents
  "Query to select recent collection data"
  [collection-ids]
  (if-not (seq collection-ids)
    []
    (let [ ;; these have their parent collection id in effective_location, but we need the id, name, and authority_level.
          collections (t2/select :model/Collection
                                 {:select [:id :name :description :authority_level :archived :location]
                                  :where [:and
                                          [:in :id collection-ids]
                                          [:= :archived false]]})]
      (->> (t2/hydrate collections :effective_parent)
           (map #(m/dissoc-in % [:effective_parent :type]))))))

(defmethod fill-recent-view-info :collection [{:keys [_model model_id timestamp model_object]}]
  (when-let [collection (and
                         (mi/can-read? model_object)
                         (ellide-archived model_object))]
    {:id model_id
     :name (:name collection)
     :description (:description collection)
     :model :collection
     :can_write (mi/can-write? collection)
     :timestamp (str timestamp)
     :authority_level (:authority_level collection)
     :parent_collection (or (:effective_parent collection) (root-coll))}))

;; == Recent Tables ==

(defn- table-recents
  "Query to select recent table data"
  [table-ids]
  (t2/select :model/Table
             {:select [:t.id :t.name :t.description :t.display_name :t.active :t.db_id
                       [:db.name :database-name]
                       [:db.initial_sync_status :initial-sync-status]]
              :from [[:metabase_table :t]]
              :where (if (seq table-ids) [:in :t.id table-ids] [])
              :left-join [[:metabase_database :db]
                          [:= :db.id :t.db_id]]}))

(defmethod fill-recent-view-info :table [{:keys [_model model_id timestamp model_object]}]
  (let [table model_object]
    (when (and (mi/can-read? table) (true? (:active table)))
      {:id model_id
       :name (:name table)
       :description (:description table)
       :model :table
       :display_name (:display_name table)
       :can_write (mi/can-write? table)
       :timestamp (str timestamp)
       :database {:id (:db_id table)
                  :name (:database-name table)
                  :initial_sync_status (:initial-sync-status table)}})))


(def ^:private query-context->recent-context
  {:views      "view"
   :selections "selection"})

(defn ^:private do-query [user-id context]
  (when-not (seq context)
    (throw (ex-info "context must be non-empty" {:context context})))
  (t2/select :model/RecentViews {:select    [:rv.* [:rc.type :card_type]]
                                 :from      [[:recent_views :rv]]
                                 :where     (into [:and
                                                   [:= :rv.user_id user-id]
                                                   [:in :rv.context (map query-context->recent-context context)]])
                                 :left-join [[:report_card :rc]
                                             [:and
                                              ;; only want to join on card_type if it's a card
                                              [:= :rv.model "card"]
                                              [:= :rc.id :rv.model_id]]]
                                 :order-by  [[:rv.timestamp :desc]]}))

(mu/defn ^:private model->return-model [model :- :keyword]
  (if (= :question model) :card model))

(defn- post-process [entity->id->data recent-view]
  (when recent-view
    (let [entity (some-> recent-view :model keyword)
          id (some-> recent-view :model_id)]
      (when-let [model-object (get-in entity->id->data [entity id])]
        (some-> (assoc recent-view :model_object model-object)
                fill-recent-view-info
                (dissoc :card_type)
                (update :model model->return-model))))))

(defn- get-entity->id->data [views]
  (let [{card-ids       :card
         dashboard-ids  :dashboard
         collection-ids :collection
         table-ids      :table} (as-> views views
                                  (group-by (comp keyword :model) views)
                                  (update-vals views #(mapv :model_id %)))]
    {:card       (m/index-by :id (card-recents card-ids))
     :dashboard  (m/index-by :id (dashboard-recents dashboard-ids))
     :collection (m/index-by :id (collection-recents collection-ids))
     :table      (m/index-by :id (table-recents table-ids))}))

(def ^:private ItemValidator (mc/validator Item))

(defn error-avoider
  "The underlying data model here can become inconsistent, and it's better to return the recents data that we know is
  correct than throw an error. So, in prod, we silently filter out known-bad recent views."
  [item]
  (if (and item (ItemValidator item))
    item
    (when-not config/is-prod?
      (log/errorf (colorize/red "Invalid recent view item: %s reason: %s")
                  (pr-str item)
                  (me/humanize (mr/explain Item item))))))

(mu/defn get-recents
  "Gets all recent views for a given user, and context. Returns a list of at most 20 [[Item]]s per [[models-of-interest]], per context.

  Returns: [:map [:recents [:sequential Item]]]

  [[do-query]] can return nils, and we remove them here becuase there can be recent views for deleted entities, and we
  don't want to show those in the recent views.

  Returns a sequence of [[Item]]s. The reason this isn't a `mu/defn`, is that error-avoider validates each Item in the
  sequence, so there's no need to do it twice."
  ([user-id] (get-recents user-id [:views :selections]))
  ([user-id context :- [:sequential [:enum :views :selections]]]
   (let [recent-items (do-query user-id context)
         entity->id->data (get-entity->id->data recent-items)
         view-items (into []
                          (comp
                           (keep (partial post-process entity->id->data))
                           (keep error-avoider)
                           (m/distinct-by (juxt :id :model)))
                          recent-items)]
     {:recents view-items})))

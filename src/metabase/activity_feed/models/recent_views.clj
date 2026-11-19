(ns metabase.activity-feed.models.recent-views
  "The Recent Views table is used to track the most recent views of objects such as Cards, Models, Tables, Dashboards,
  and Collections for each user. For an up to date list, see [[rv-models]].

  It offers a simple API to add a recent view item, and fetch the list of recents.

  Adding Recent Items:
     `(recent-views/update-users-recent-views! <user-id> <model> <model-id> <context>)`
       see: [[update-users-recent-views!]]
      This is almost always called from a published event handler.
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

  E.G., if you were to view lots of _cards_, it would not push collections and dashboards out of your recents."
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.set :as set]
   [colorize.core :as colorize]
   [java-time.api :as t]
   [malli.core :as mc]
   [malli.error :as me]
   [medley.core :as m]
   [metabase.activity-feed.collection-recent-views]
   [metabase.activity-feed.db :as activity-feed.db]
   [metabase.activity-feed.recent-views.spec :as recent-views.spec]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.batch-processing.core :as grouper]
   [metabase.config.core :as config]
   [metabase.models.interface :as mi]
   [metabase.models.resolution :as models.resolution]
   [metabase.util :as u]
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

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *recent-views-stored-per-user-per-model*
  "The number of recently viewed items to keep per user per model. This is used to keep the most recent views of each
  model type in [[rv-models]]."
  20)

(defn- duplicate-model-ids
  "Returns a set of IDs of duplicate models in the RecentViews table. Duplicate means that the same model and model_id
   shows up more than once. This returns the ids for the copies that are not the most recent entry."
  [user-id context]
  (->> (activity-feed.db/recent-views-for-user-context user-id context)
       (group-by (juxt :model :model_id))
       ;; skip the first row for each group, since it's the most recent
       (into #{} (comp (mapcat (fn [[_ rows]] (drop 1 rows)))
                       (map :id)))))

(def rv-models
  "Keywords representing entity types that can be returned as recent views. They are the names of the types of recent
  view that the models declare in their [[metabase.activity-feed.recent-views.spec/spec]]."
  [:card :dataset :metric :dashboard :table :collection :document])

(defn- db-model
  "The `recent_views.model` string a view of `model` is stored under."
  [model]
  (u/lower-case-en (name model)))

(def ^:private specs*
  (memoize/fifo
   (fn [_spec-methods]
     (let [entries (models.resolution/spec-entries-by-name recent-views.spec/spec)]
       {:entries entries
        :names   (into {}
                       (map (fn [[view-name [model {card-type :type}]]]
                              [[(db-model model) card-type] view-name]))
                       entries)}))
   :fifo/threshold 1))

(defn- specs
  "The spec of each type of recent view by its name, as `{:entries {name [model spec]}, :names {[stored-model type] name}}`."
  []
  (specs* (methods recent-views.spec/spec)))

(defn- entry
  "The `[model spec]` of the type of recent view named `view-name`."
  [view-name]
  (get-in (specs) [:entries (name view-name)]))

(mu/defn rv-model->model
  "Given a rv-model, returns the toucan model identifier for it."
  [rvm :- (into [:enum] rv-models)]
  (first (entry rvm)))

(defn- view-name
  "The name of the type of recent view a stored view stands for, from its stored `model` and the `card_type` of the
  Card it is about."
  [{:keys [model card_type]}]
  (let [names (:names (specs))]
    (or (get names [model card_type])
        model)))

(defn- ids-to-prune-for-user+model [user-id rv-model context]
  (let [[model {card-type :type}] (entry rv-model)]
    (activity-feed.db/recent-view-ids-to-prune (db-model model)
                                               user-id
                                               (name context)
                                               card-type
                                               *recent-views-stored-per-user-per-model*)))

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

(defn- update-users-recent-views!*
  "Batch handler for [[update-users-recent-views!]]: inserts the given views and then prunes overflow and
  duplicates once per affected (user, context) pair."
  [views]
  (when (seq views)
    (try
      (t2/with-transaction [_conn]
        (activity-feed.db/insert-recent-views!
         (for [{:keys [user-id model model-id context timestamp]} views]
           {:user_id user-id
            :model (u/lower-case-en (name model))
            :model_id model-id
            :context (name context)
            :timestamp timestamp}))
        ;; The prune queries are per (user, context), not per view, so collapse the batch down to its distinct
        ;; pairs first: N views by one user become one set of prune queries instead of N.
        (let [prune-ids (into #{}
                              (comp (map (juxt :user-id :context))
                                    (distinct)
                                    (mapcat (fn [[user-id context]] (ids-to-prune user-id context))))
                              views)]
          (when (seq prune-ids)
            (activity-feed.db/delete-recent-views! prune-ids))))
      (catch Exception e
        (log/error e "Failed to update users recent views")))))

(def ^:private recent-views-interval-seconds 20)

(def ^:private recent-views-queue-capacity 500)

(defonce ^:private recent-views-queue
  (delay (grouper/start!
          #'update-users-recent-views!*
          :capacity recent-views-queue-capacity
          :interval (* recent-views-interval-seconds 1000))))

(mu/defn update-users-recent-views!
  "Updates the RecentViews table for a given user with a new view, and prunes old views."
  [user-id :- [:maybe ms/PositiveInt]
   model :- [:enum :model/Card :model/Table :model/Dashboard :model/Collection :model/Document]
   model-id :- ms/PositiveInt
   context :- [:enum :view :selection]]
  (when user-id
    (grouper/submit! @recent-views-queue {:user-id   user-id
                                          :model     model
                                          :model-id  model-id
                                          :context   context
                                          :timestamp (t/offset-date-time)})))

(defn most-recently-viewed-dashboard-id
  "Returns ID of the most recently viewed dashboard for a given user within the last 24 hours, or `nil`."
  [user-id]
  (activity-feed.db/most-recently-viewed-dashboard-id user-id (t/minus (t/zoned-date-time) (t/days 1))))

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
     [:model [:enum :dataset :card :metric :dashboard :collection :table :document]]
     [:can_write :boolean]
     [:timestamp :string]]
    ;; database_id was commented out below because this schema was not actually being used correctly
    ;; by [[metabase.activity-feed.api/get-popular-items-model-and-id]] and when I fixed it in #47418
    ;; [[metabase.activity-feed.api-test/popular-items-test]] started failing because things don't actually come back with
    ;; database IDs... commented out for now until someone gets a change to look at this. -- Cam
    [:multi {:dispatch :model}
     [:card [:map
             [:display :string]
             #_[:database_id :int]
             [:parent_collection ::pc]
             [:moderated_status ::verified]]]
     [:dataset [:map
                #_[:database_id :int]
                [:parent_collection ::pc]
                [:moderated_status ::verified]]]
     [:metric [:map
               [:display :string]
               [:parent_collection ::pc]
               [:moderated_status ::verified]]]
     [:dashboard
      [:map
       [:parent_collection ::pc]
       [:moderated_status ::verified]]]
     [:table [:map
              [:display_name :string]
              [:table_schema [:maybe :string]]
              [:database [:map
                          #_[:id [:int {:min 1}]]
                          [:name :string]]]]]
     [:collection [:map
                   [:parent_collection ::pc]
                   [:effective_location :string]
                   [:authority_level ::official]]]
     [:document [:map
                 [:parent_collection ::pc]]]]]))

(defn- view-spec
  "The spec of the type of recent view a stored view stands for, or nil."
  [recent-view]
  (second (entry (view-name recent-view))))

(defn fill-recent-view-info
  "Fills in additional information for a recent view, such as the display name of the object, returns [[Item]], using
  the `:render` of the spec of its type. `recent-view` holds the loaded object as `:model_object`.

  Sometimes we get an invalid or inconsistent recent view record. (E.g. the parent collection for an item no longer
  exists). In these cases we simply do not include the value in the recent views response."
  [{:keys [model_object] :as recent-view}]
  (let [{:keys [render]} (or (view-spec recent-view)
                             (throw (ex-info "Unknown model" {:model recent-view})))]
    (render model_object recent-view)))

(def ^:private query-context->recent-context
  {:views      "view"
   :selections "selection"})

(defn ^:private do-query [user-id context models]
  (when-not (seq context)
    (throw (ex-info "context must be non-empty" {:context context})))
  (let [entries (keep entry models)]
    (activity-feed.db/recent-views-with-card-type user-id
                                                  (map query-context->recent-context context)
                                                  (when (seq models)
                                                    (distinct (map (comp db-model first) entries)))
                                                  (keep (comp :type second) entries)
                                                  (contains? (set context) :selections))))

(mu/defn- model->return-model [model :- :keyword]
  (if (= :question model) :card model))

(defn- load-model-objects
  "Loads the objects of `views` in bulk, one `:load` per fn the specs of the views share, as `{load-fn {id object}}`."
  [views]
  (-> (group-by (comp :load view-spec) (filter view-spec views))
      (update-vals #(m/index-by :id ((:load (view-spec (first %))) (mapv :model_id %))))))

(defn- post-process [model-objects options recent-view]
  (when recent-view
    (when-let [model-object (get-in model-objects [(:load (view-spec recent-view)) (:model_id recent-view)])]
      (let [processed-item (some-> (assoc recent-view :model_object model-object)
                                   fill-recent-view-info
                                   (dissoc :card_type)
                                   (update :model model->return-model))]
        ;; Remove result_metadata if include-metadata? is false
        (cond-> processed-item
          (not (:include-metadata? options)) (dissoc :result_metadata))))))

(def ^:private ItemValidator (mr/validator Item))

(defn error-avoider
  "The underlying data model here can become inconsistent, and it's better to return the recents data that we know is
  correct than throw an error. So, in prod, we silently filter out known-bad recent views."
  [item]
  (if (and item (ItemValidator item))
    item
    (when-not config/is-prod?
      (log/errorf (colorize/red "Invalid recent view item: %s reason: %s")
                  (pr-str (select-keys item [:id :model]))
                  (me/humanize (mr/explain Item item))))))

(mu/defn get-recents
  "Gets all recent views for a given user, and context. Returns a list of at most 20 [[Item]]s per [[rv-models]], per context.

  Returns: [:map [:recents [:sequential Item]]]

  [[do-query]] can return nils, and we remove them here because there can be recent views for deleted entities, and we
  don't want to show those in the recent views.

  Options:
  - `:include-metadata?` - Include result_metadata in the response (default: false)
  - `:models` - Filter to specific model types from [[rv-models]] (default: all models)

  Returns a sequence of [[Item]]s. The reason this isn't a `mu/defn`, is that error-avoider validates each Item in the
  sequence, so there's no need to do it twice."
  ([user-id :- [:maybe ms/PositiveInt]]
   (get-recents user-id [:views :selections]))
  ([user-id :- [:maybe ms/PositiveInt]
    context :- [:sequential [:enum :views :selections]]]
   (get-recents user-id context {}))
  ([user-id :- [:maybe ms/PositiveInt]
    context :- [:sequential [:enum :views :selections]]
    options :- [:map {:closed true}
                [:include-metadata? {:optional true} [:maybe :boolean]]
                [:models {:optional true} [:maybe [:sequential (into [:enum] rv-models)]]]]]
   (let [models (:models options)
         recent-items (do-query user-id context models)
         model-objects (load-model-objects recent-items)
         view-items (into []
                          (comp
                           (keep (partial post-process model-objects options))
                           (keep error-avoider)
                           (m/distinct-by (juxt :id :model)))
                          recent-items)]
     {:recents view-items})))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/RecentViews [_model]
  {:skip? false})

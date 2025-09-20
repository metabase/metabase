(ns metabase.dashboards.api
  "/api/dashboard endpoints."
  (:require
   [clojure.core.cache :as cache]
   [clojure.core.memoize :as memoize]
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.actions.core :as actions]
   [metabase.analytics.core :as analytics]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.app-db.core :as app-db]
   [metabase.collections.api :as api.collection]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.dashboards.models.dashboard :as dashboard]
   [metabase.dashboards.models.dashboard.update :as dashboard.update]
   [metabase.eid-translation.core :as eid-translation]
   [metabase.embedding.validation :as embedding.validation]
   [metabase.events.core :as events]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.parameters.chain-filter :as chain-filter]
   [metabase.parameters.dashboard :as parameters.dashboard]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.permissions.core :as perms]
   [metabase.public-sharing.validation :as public-sharing.validation]
   [metabase.queries.core :as queries]
   [metabase.query-processor.api :as api.dataset]
   [metabase.query-processor.dashboard :as qp.dashboard]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.pivot :as qp.pivot]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.util :as qp.util]
   [metabase.request.core :as request]
   [metabase.revisions.core :as revisions]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.xrays.core :as xrays]
   [ring.util.codec :as codec]
   [steffan-westcott.clj-otel.api.trace.span :as span]
   [toucan2.core :as t2]
   [metabase.dashboards.schema :as dashboards.schema]))

(set! *warn-on-reflection* true)

(defn- dashboards-list [filter-option]
  (as-> (t2/select :model/Dashboard {:where    [:and (case (or (keyword filter-option) :all)
                                                       (:all :archived)  true
                                                       :mine [:= :creator_id api/*current-user-id*])
                                                [:= :archived (= (keyword filter-option) :archived)]]
                                     :order-by [:%lower.name]}) <>
    (t2/hydrate <> :creator)
    (filter mi/can-read? <>)))

(api.macros/defendpoint :get "/"
  "This endpoint is currently unused by the Metabase frontend and may be out of date with the rest of the application.
  It only exists for backwards compatibility and may be removed in the future.

  Get `Dashboards`. With filter option `f` (default `all`), restrict results as follows:
  *  `all`      - Return all Dashboards.
  *  `mine`     - Return Dashboards created by the current user.
  *  `archived` - Return Dashboards that have been archived. (By default, these are *excluded*.)"
  {:deprecated true}
  [_route-params
   {:keys [f]} :- [:map
                   [:f {:optional true} [:maybe [:enum "all" "mine" "archived"]]]]]
  (let [dashboards (dashboards-list f)
        edit-infos (:dashboard (revisions/fetch-last-edited-info {:dashboard-ids (map :id dashboards)}))]
    (into []
          (map (fn [{:keys [id] :as dashboard}]
                 (if-let [edit-info (get edit-infos id)]
                   (assoc dashboard :last-edit-info edit-info)
                   dashboard)))
          dashboards)))

(api.macros/defendpoint :post "/"
  "Create a new Dashboard."
  [_route-params
   _query-params
   {:keys [name description parameters cache_ttl collection_id collection_position], :as _dashboard}
   :- [:map
       [:name                ms/NonBlankString]
       [:parameters          {:optional true} [:maybe [:sequential ::parameters.schema/parameter]]]
       [:description         {:optional true} [:maybe :string]]
       [:cache_ttl           {:optional true} [:maybe ms/PositiveInt]]
       [:collection_id       {:optional true} [:maybe ms/PositiveInt]]
       [:collection_position {:optional true} [:maybe ms/PositiveInt]]]]
  ;; if we're trying to save the new dashboard in a Collection make sure we have permissions to do that
  (collection/check-write-perms-for-collection collection_id)
  (let [dashboard-data {:name                name
                        :description         description
                        :parameters          (or parameters [])
                        :creator_id          api/*current-user-id*
                        :cache_ttl           cache_ttl
                        :collection_id       collection_id
                        :collection_position collection_position}
        dash           (t2/with-transaction [_conn]
                         ;; Adding a new dashboard at `collection_position` could cause other dashboards in this
                         ;; collection to change position, check that and fix up if needed
                         (api/maybe-reconcile-collection-position! dashboard-data)
                         ;; Ok, now save the Dashboard
                         (first (t2/insert-returning-instances! :model/Dashboard dashboard-data)))]
    (events/publish-event! :event/dashboard-create {:object dash :user-id api/*current-user-id*})
    (analytics/track-event! :snowplow/dashboard
                            {:event        :dashboard-created
                             :dashboard-id (u/the-id dash)})
    (-> dash
        dashboard/hydrate-dashboard-details
        collection.root/hydrate-root-collection
        (assoc :last-edit-info (revisions/edit-information-for-user @api/*current-user*)))))

;;; -------------------------------------------- Hiding Unreadable Cards ---------------------------------------------

(defn- hide-unreadable-card
  "If CARD is unreadable, replace it with an object containing only its `:id`."
  [card]
  (when card
    (if (mi/can-read? card)
      card
      (select-keys card [:id]))))

(defn- hide-unreadable-cards
  "Replace the `:card` and `:series` entries from dashcards that they user isn't allowed to read with empty objects."
  [dashboard]
  (update dashboard :dashcards (fn [dashcards]
                                 (vec (for [dashcard dashcards]
                                        (-> dashcard
                                            (update :card hide-unreadable-card)
                                            (update :series (partial mapv hide-unreadable-card))))))))

;;; ------------------------------------------ Query Average Duration Info -------------------------------------------

;; Adding the average execution time to all of the Cards in a Dashboard efficiently is somewhat involved. There are a
;; few things that make this tricky:
;;
;; 1. Queries are usually executed with `:constraints` that different from how they're actually defined, but not
;;    always. This means we should look up hashes for both the query as-is and for the query with
;;    `default-query-constraints` and use whichever one we find
;;
;; 2. The structure of DashCards themselves is complicated. It has a top-level `:card` property and (optionally) a
;;    sequence of additional Cards under `:series`
;;
;; 3. Query hashes are byte arrays, and two identical byte arrays aren't equal to each other in Java; thus they don't
;;    work as one would expect when being used as map keys
;;
;; Here's an overview of the approach used to efficiently add the info:
;;
;; 1. Build a sequence of query hashes (both as-is and with default constraints) for every card and series in the
;;    dashboard cards
;;
;; 2. Fetch all matching entries from Query in the DB and build a map of hash (converted to a Clojure vector) ->
;;    average execution time
;;
;; 3. Iterate back over each card and look for matching entries in the `hash-vec->avg-time` for either the normal hash
;;    or the hash with default constraints, and add the result as `:average_execution_time`

(defn- card->query-hashes
  "Return a tuple of possible hashes that would be associated with executions of CARD. The first is the hash of the
  query dictionary as-is; the second is one with the `default-query-constraints`, which is how it will most likely be
  run.

  Returns nil if `:dataset_query` isn't set, eg. for a markdown card."
  [{:keys [dataset_query]}]
  (when dataset_query
    (u/ignore-exceptions
      [(qp.util/query-hash dataset_query)
       (qp.util/query-hash (assoc dataset_query :constraints (qp.constraints/default-query-constraints)))])))

(defn- dashcard->query-hashes
  "Return a sequence of all the query hashes for this `dashcard`, including the top-level Card and any Series."
  [{:keys [card series]}]
  (reduce concat
          (card->query-hashes card)
          (for [card series]
            (card->query-hashes card))))

(defn- dashcards->query-hashes
  "Return a sequence of all the query hashes used in a `dashcards`."
  [dashcards]
  (apply concat (for [dashcard dashcards]
                  (dashcard->query-hashes dashcard))))

(defn- hashes->hash-vec->avg-time
  "Given some query `hashes`, return a map of hashes (as normal Clojure vectors) to the average query durations.
  (The hashes are represented as normal Clojure vectors because identical byte arrays aren't considered equal to one
  another, and thus do not work as one would expect when used as map keys.)"
  [hashes]
  (when (seq hashes)
    (into {} (for [[k v] (t2/select-fn->fn :query_hash :average_execution_time :model/Query :query_hash [:in hashes])]
               {(vec k) v}))))

(defn- add-query-average-duration-to-card
  "Add `:query_average_duration` info to a `card` (i.e., the `:card` property of a DashCard or an entry in its `:series`
  array)."
  [card hash-vec->avg-time]
  (assoc card :query_average_duration (some (fn [query-hash]
                                              (hash-vec->avg-time (vec query-hash)))
                                            (card->query-hashes card))))

(defn- add-query-average-duration-to-dashcards
  "Add `:query_average_duration` to the top-level Card and any Series in a sequence of `dashcards`."
  ([dashcards]
   (add-query-average-duration-to-dashcards dashcards (hashes->hash-vec->avg-time (dashcards->query-hashes dashcards))))
  ([dashcards hash-vec->avg-time]
   (for [dashcard dashcards]
     (-> dashcard
         (update :card   add-query-average-duration-to-card hash-vec->avg-time)
         (update :series (fn [series]
                           (for [card series]
                             (add-query-average-duration-to-card card hash-vec->avg-time))))))))

(defn add-query-average-durations
  "Add a `average_execution_time` field to each card (and series) belonging to `dashboard`."
  [dashboard]
  ;; Doall is needed to fetch the average durations in this thread, in the context of *dashboard-load-id*.
  ;; Otherwise it happens on other threads without the MetadataProvider caching and makes many more AppDB requests.
  (update dashboard :dashcards (comp doall add-query-average-duration-to-dashcards)))

;; ## Dashboard load caching
;; When the FE loads a dashboard, there is a burst of requests sent to the BE:
;; - One  /api/dashboard/:id
;; - One  /api/dashboard/:id/query_metadata
;; - Many /:dashboard-id/dashcard/:dashcard-id/card/:card-id/query
;; Each of these needs some metadata from the appdb: to hydrate the dashboard, get the query_metadata, and to run the
;; query processor over all the dashcards.
;; That leads to a lot of re-fetching of the same information from the appdb, and is a great opportunity for caching.
;;
;; To connect the dots across these N+2 HTTP requests, the FE attaches a `?dashboard_load_id=UUID` parameter to all
;; the calls coming from a single dashboard load. That gives the BE an excellent cache key!
;;
;; ### Why not cache on dashboard ID?
;; There may be different users with different permissions fetching the same dashboard at the same time. They see a
;; different picture of the queries and their metadata, so must be fetched separately.
(def ^:private dashboard-load-cache-ttl
  "Using 10 seconds for the cache TTL."
  (* 10 1000))

(def ^:private ^:dynamic *dashboard-load-id* nil)

;; This is a kind of two-layer memoization:
;; - The outer layer is a 10-second TTL cache on *dashboard-load-id*.
;; - Its value is the *function* to use to get the dashboard by ID!
;; If *dashboard-load-id* is set, the outer layer returns a forever-memoized wrapper around get-dashboard*.
;; If *dashboard-load-id* is nil, it returns the unwrapped get-dashboard*.

;; TODO: This indirect memoization by *dashboard-load-id* could probably be turned into a macro for reuse elsewhere.
(defn- get-dashboard*
  "Get Dashboard with ID."
  [id]
  (span/with-span!
    {:name       "get-dashboard"
     :attributes {:dashboard/id id}}
    (-> (t2/select-one :model/Dashboard :id id)
        api/read-check
        dashboard/hydrate-dashboard-details
        collection.root/hydrate-root-collection
        hide-unreadable-cards
        add-query-average-durations
        (api/present-in-trash-if-archived-directly (collection/trash-collection-id)))))

(def ^:private get-dashboard-fn
  (memoize/ttl (fn [dashboard-load-id]
                 (if dashboard-load-id
                   (memoize/memo get-dashboard*) ; If dashboard-load-id is set, return a memoized get-dashboard*.
                   get-dashboard*))         ; If unset, just call through to get-dashboard*.
               :ttl/threshold dashboard-load-cache-ttl))

(def ^:private dashboard-load-metadata-provider-cache
  (memoize/ttl (fn [_dashboard-load-id]
                 (atom (cache/basic-cache-factory {})))
               :ttl/threshold dashboard-load-cache-ttl))

(defn- do-with-dashboard-load-id [dashboard-load-id body-fn]
  (if dashboard-load-id
    (binding [*dashboard-load-id*                        dashboard-load-id
              lib.metadata.jvm/*metadata-provider-cache* (dashboard-load-metadata-provider-cache dashboard-load-id)]
      (log/debugf "Using dashboard_load_id %s" dashboard-load-id)
      (body-fn))
    (do
      (log/debug "No dashboard_load_id provided")
      (body-fn))))

(defmacro ^:private with-dashboard-load-id [dashboard-load-id & body]
  `(do-with-dashboard-load-id ~dashboard-load-id (^:once fn* [] ~@body)))

(defn- get-dashboard
  "Get Dashboard with ID.

  Memoized per `*dashboard-load-id*` with a TTL of 10 seconds."
  [id]
  ((get-dashboard-fn *dashboard-load-id*) id))

(mu/defn- cards-to-copy :- [:map
                            [:discard [:sequential :any]]
                            [:copy [:map-of ms/PositiveInt :any]]
                            [:reference [:map-of ms/PositiveInt :any]]]
  "Returns a map of which cards we need to copy, which cards we need to reference, and which are not to be copied. The
  `:copy` and `:reference` keys are maps from id to card. The `:discard` key is a vector of cards which were not
  copied due to permissions.

  If we're making a deep copy, we copy all cards that we have necessary permissions on. Otherwise, we copy Dashboard
  Questions (questions stored 'in' the dashboard rather than a collection) and reference the rest (assuming
  permissions)."
  [deep-copy? :- ms/MaybeBooleanValue
   dashcards :- [:sequential :any]]
  (let [card->cards (fn [{:keys [card series]}] (into [card] series))
        readable? (fn [card] (and (mi/model card) (mi/can-read? card)))
        card->decision (fn [parent-card card]
                         (cond
                           (or
                            (not (readable? parent-card))
                            (not (readable? card))
                            (:archived card))
                           :discard

                           (or (:dashboard_id card)
                               (and deep-copy? (not= :model (:type card))))
                           :copy

                           :else :reference))
        split-cards (fn [{:keys [card] :as db-card}]
                      (let [cards (card->cards db-card)]
                        (group-by (partial card->decision card) cards)))]
    (reduce (fn [acc db-card]
              (let [{:keys [discard copy reference]} (split-cards db-card)]
                (-> acc
                    (update :reference merge (m/index-by :id reference))
                    (update :copy merge (m/index-by :id copy))
                    (update :discard concat discard))))
            {:reference {}
             :copy {}
             :discard []}
            (filter :card_id dashcards))))

(defn- maybe-duplicate-cards
  "Takes a dashboard id, and duplicates the cards both on the dashboard's cards and dashcardseries as necessary.

  Returns a map of {:copied {old-card-id duplicated-card} :uncopied [card]} so that the new dashboard can adjust accordingly.

  If `deep-copy?` is `false`, doesn't copy any cards *except* for Dashboard Questions, which must be copied."
  [deep-copy? new-dashboard old-dashboard dest-coll-id]
  (let [same-collection?                 (= (:collection_id old-dashboard) dest-coll-id)
        {:keys [copy discard reference]} (cards-to-copy deep-copy? (:dashcards old-dashboard))]
    {:copied     (into {} (for [[id to-copy] copy]
                            [id (queries/create-card!
                                 (cond-> to-copy
                                   true                    (assoc :collection_id dest-coll-id)
                                   same-collection?        (update :name #(str % " - " (tru "Duplicate")))
                                   (:dashboard_id to-copy) (assoc :dashboard_id (u/the-id new-dashboard)))
                                 @api/*current-user*
                                 ;; creating cards from a transaction. wait until tx complete to signal event
                                 true
                                 ;; do not autoplace these cards. we will create the dashboard cards ourselves.
                                 false)]))
     :discarded  discard
     :referenced reference}))

(defn- duplicate-tabs
  [new-dashboard existing-tabs]
  (let [new-tab-ids (t2/insert-returning-pks! :model/DashboardTab
                                              (for [tab existing-tabs]
                                                (-> tab
                                                    (assoc :dashboard_id (:id new-dashboard))
                                                    (dissoc :id :entity_id :created_at :updated_at))))]
    (zipmap (map :id existing-tabs) new-tab-ids)))

(defn- update-colvalmap-setting
  "Visualizer dashcards have unique visualization settings which embed column id remapping metadata
  This function iterates through the `:columnValueMapping` viz setting and updates referenced card ids

  col->val-source can look like:
  {:COLUMN_2 [{:sourceId 'card:<OLD_CARD_ID>', :originalName 'sum', :name 'COLUMN_2'}], ...}"
  [col->val-source id->new-card]
  (let [update-cvm-item (fn [item]
                          (if-let [source-id (:sourceId item)]
                            (if-let [[_ card-id] (and (string? source-id)
                                                      (re-find #"^card:(\d+)$" source-id))]
                              (if-let [new-card (get id->new-card (Long/parseLong card-id))]
                                (assoc item :sourceId (str "card:" (:id new-card)))
                                item)
                              item)
                            item))
        update-cvm      (fn [cvm]
                          (when (map? cvm)
                            (update-vals cvm #(mapv update-cvm-item %))))]
    (update-cvm col->val-source)))

(defn update-cards-for-copy
  "Update dashcards in a dashboard for copying.
  If the dashboard has tabs, fix up the tab ids in dashcards to point to the new tabs.
  Then if shallow copy, return the cards. If deep copy, replace ids with id from the newly-copied cards.
  If there is no new id, it means user lacked curate permissions for the cards
  collections and it is omitted."
  [dashcards id->new-card id->referenced-card id->new-tab-id]
  (let [dashcards (if (seq id->new-tab-id)
                    (map #(assoc % :dashboard_tab_id (id->new-tab-id (:dashboard_tab_id %)))
                         dashcards)
                    dashcards)]
    (keep (fn [dashboard-card]
            (cond
              (:action_id dashboard-card)
              nil

              ;; text cards need no manipulation
              (some-> dashboard-card :visualization_settings :virtual_card :display #{"text" "heading"})
              dashboard-card

              ;; referenced cards need no manipulation
              (get id->referenced-card (:card_id dashboard-card))
              dashboard-card

              ;; if we didn't duplicate, it doesn't go in the dashboard
              (not (get id->new-card (:card_id dashboard-card)))
              nil

              :else
              (let [new-id (fn [id]
                             (-> id id->new-card :id))]
                (-> dashboard-card
                    (update :card_id new-id)
                    (assoc :card (-> dashboard-card :card_id id->new-card))
                    (m/update-existing :parameter_mappings
                                       (fn [pms]
                                         (keep (fn [pm]
                                                 (m/update-existing pm :card_id new-id))
                                               pms)))
                    (m/update-existing :series
                                       (fn [series]
                                         (keep (fn [card]
                                                 (when-let [id' (new-id (:id card))]
                                                   (assoc card :id id')))
                                               series)))
                    (m/update-existing-in [:visualization_settings :visualization :columnValuesMapping]
                                          update-colvalmap-setting id->new-card)))))
          dashcards)))

(api.macros/defendpoint :post "/:from-dashboard-id/copy"
  "Copy a Dashboard."
  [{:keys [from-dashboard-id]} :- [:map
                                   [:from-dashboard-id ms/PositiveInt]]
   _query-params
   {:keys [name description collection_id collection_position
           is_deep_copy], :as _dashboard} :- [:map
                                              [:name                {:optional true} [:maybe ms/NonBlankString]]
                                              [:description         {:optional true} [:maybe :string]]
                                              [:collection_id       {:optional true} [:maybe ms/PositiveInt]]
                                              [:collection_position {:optional true} [:maybe ms/PositiveInt]]
                                              [:is_deep_copy        {:default false} [:maybe :boolean]]]]
  ;; if we're trying to save the new dashboard in a Collection make sure we have permissions to do that
  (collection/check-write-perms-for-collection collection_id)
  (api/check-400 (not (and (= is_deep_copy false)
                           (t2/exists? :model/Card
                                       :dashboard_id from-dashboard-id
                                       :archived false)))
                 (deferred-tru "You cannot do a shallow copy of this dashboard because it contains Dashboard Questions."))
  (let [existing-dashboard (get-dashboard from-dashboard-id)
        dashboard-data {:name                (or name (:name existing-dashboard))
                        :description         (or description (:description existing-dashboard))
                        :parameters          (or (:parameters existing-dashboard) [])
                        :creator_id          api/*current-user-id*
                        :collection_id       collection_id
                        :collection_position collection_position
                        :width               (:width existing-dashboard)}
        new-cards      (atom nil)
        dashboard      (t2/with-transaction [_conn]
                        ;; Adding a new dashboard at `collection_position` could cause other dashboards in this
                        ;; collection to change position, check that and fix up if needed
                         (api/maybe-reconcile-collection-position! dashboard-data)
                        ;; Ok, now save the Dashboard
                         (let [dash (first (t2/insert-returning-instances! :model/Dashboard dashboard-data))
                               {id->new-card :copied
                                id->referenced-card :referenced
                                uncopied :discarded}
                               (maybe-duplicate-cards is_deep_copy dash existing-dashboard collection_id)

                               id->new-tab-id (when-let [existing-tabs (seq (:tabs existing-dashboard))]
                                                (duplicate-tabs dash existing-tabs))]
                           (reset! new-cards (vals id->new-card))
                           (when-let [dashcards (seq (update-cards-for-copy (:dashcards existing-dashboard)
                                                                            id->new-card
                                                                            id->referenced-card
                                                                            id->new-tab-id))]
                             (api/check-500 (dashboard/add-dashcards! dash dashcards)))
                           (cond-> dash
                             (seq uncopied)
                             (assoc :uncopied uncopied))))]
    (analytics/track-event! :snowplow/dashboard
                            {:event        :dashboard-created
                             :dashboard-id (u/the-id dashboard)})
    ;; must signal event outside of tx so cards are visible from other threads
    (when-let [newly-created-cards (seq @new-cards)]
      (doseq [card newly-created-cards]
        (events/publish-event! :event/card-create {:object card :user-id api/*current-user-id*})))
    (events/publish-event! :event/dashboard-create {:object dashboard :user-id api/*current-user-id*})
    dashboard))

;;; --------------------------------------------- List public and embeddable dashboards ------------------------------

(api.macros/defendpoint :get "/public"
  "Fetch a list of Dashboards with public UUIDs. These dashboards are publicly-accessible *if* public sharing is
  enabled."
  []
  (perms/check-has-application-permission :setting)
  (public-sharing.validation/check-public-sharing-enabled)
  (t2/select [:model/Dashboard :name :id :public_uuid], :public_uuid [:not= nil], :archived false))

(api.macros/defendpoint :get "/embeddable"
  "Fetch a list of Dashboards where `enable_embedding` is `true`. The dashboards can be embedded using the embedding
  endpoints and a signed JWT."
  []
  (perms/check-has-application-permission :setting)
  (embedding.validation/check-embedding-enabled)
  (t2/select [:model/Dashboard :name :id], :enable_embedding true, :archived false))

;;; --------------------------------------------- Fetching/Updating/Etc. ---------------------------------------------

(api.macros/defendpoint :get "/:id"
  "Get Dashboard with ID."
  [{:keys [id]} :- [:map
                    [:id [:or ms/PositiveInt ms/NanoIdString]]]
   {dashboard-load-id :dashboard_load_id}]
  (with-dashboard-load-id dashboard-load-id
    (let [resolved-id (eid-translation/->id-or-404 :dashboard id)
          dashboard (get-dashboard resolved-id)]
      (u/prog1 (first (revisions/with-last-edit-info [dashboard] :dashboard))
        (events/publish-event! :event/dashboard-read {:object-id (:id dashboard) :user-id api/*current-user-id*})))))

(api.macros/defendpoint :get "/:id/items"
  "Get Dashboard with ID."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  ;; Output should match the shape of api/collection/<:id|root>/items. There's a test that asserts that this remains
  ;; the case, but if you change one, you'll want to change both.
  (let [dashboard  (api/read-check :model/Dashboard id)
        query      (merge
                    {:select [:c.id :c.name :c.description :c.entity_id :c.collection_position :c.display :c.collection_preview
                              :last_used_at :c.collection_id :c.archived_directly :c.archived :c.database_id
                              :c.dashboard_id
                              [nil :location]
                              [(h2x/literal "card")  :model]
                              [{:select   [:status]
                                :from     [:moderation_review]
                                :where    [:and
                                           [:= :moderated_item_type "card"]
                                           [:= :moderated_item_id :c.id]
                                           [:= :most_recent true]]
                                ;; limit 1 to ensure that there is only one result but this invariant should hold true, just
                                ;; protecting against potential bugs
                                :order-by [[:id :desc]]
                                :limit    1}
                               :moderated_status]]
                     :from      [[:report_card :c]]
                     :where     [:and
                                 [:= :c.dashboard_id id]
                                 [:exists {:select 1
                                           :from [[:report_dashboardcard :dc]]
                                           :where [:and [:= :c.id :dc.card_id] [:= :c.dashboard_id :dc.dashboard_id]]}]
                                 [:= :c.archived false]]}
                    (when (request/paged?)
                      {:limit (request/limit)
                       :offset (request/offset)}))
        cards      (app-db/query query)]
    {:total  (count cards)
     :data   (api.collection/post-process-rows {}
                                               (t2/select-one :model/Collection :id (:collection_id dashboard))
                                               cards)
     :limit  (request/limit)
     :offset (request/offset)
     :models (if (seq cards) ["card"] [])}))



(api.macros/defendpoint :delete "/:id"
  "Hard delete a Dashboard. To soft delete, use `PUT /api/dashboard/:id`

  This will remove also any questions/models/segments/metrics that use this database."
  [{:keys [id]} :- [:map
                    [:id ::lib.schema.id/dashboard]]]
  (let [dashboard (api/write-check :model/Dashboard id)]
    (t2/delete! :model/Dashboard :id id)
    (events/publish-event! :event/dashboard-delete {:object dashboard :user-id api/*current-user-id*}))
  api/generic-204-no-content)

(api.macros/defendpoint :put "/:id"
  "Update a Dashboard, and optionally the `dashcards` and `tabs` of a Dashboard. The request body should be a JSON
  object with the same structure as the response from `GET /api/dashboard/:id`."
  [{:keys [id]} :- [:map
                    [:id ::lib.schema.id/dashboard]]
   _query-params
   dash-updates :- ::dashboards.schema/dashboard.update]
  (dashboard.update/update-dashboard! id dash-updates))

(api.macros/defendpoint :put "/:id/cards"
  "(DEPRECATED -- Use the `PUT /api/dashboard/:id` endpoint instead.)
   Update `Cards` and `Tabs` on a Dashboard. Request body should have the form:

    {:cards        [{:id                 ... ; DashboardCard ID
                     :size_x             ...
                     :size_y             ...
                     :row                ...
                     :col                ...
                     :parameter_mappings ...
                     :series             [{:id 123
                                           ...}]}
                     ...]
     :tabs [{:id       ... ; DashboardTab ID
                     :name     ...}]}"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   {:keys [cards tabs]} :- [:map
                            [:cards ::dashboards.schema/dashcards.update]
                            [:tabs  {:optional true} [:maybe ::dashboards.schema/dashboard-tabs.update]]]]
  (log/warn
   "DELETE /api/dashboard/:id/cards is deprecated. Use PUT /api/dashboard/:id instead.")
  (let [dashboard (dashboard.update/update-dashboard! id {:dashcards cards :tabs tabs})]
    {:cards (:dashcards dashboard)
     :tabs  (:tabs dashboard)}))

(api.macros/defendpoint :get "/:id/query_metadata"
  "Get all of the required query metadata for the cards on dashboard."
  [{:keys [id]} :- [:map
                    [:id [:or ms/PositiveInt ms/NanoIdString]]]
   {dashboard-load-id :dashboard_load_id}]
  (with-dashboard-load-id dashboard-load-id
    (perms/with-relevant-permissions-for-user api/*current-user-id*
      (let [resolved-id (eid-translation/->id-or-404 :dashboard id)
            dashboard (get-dashboard resolved-id)]
        (queries/batch-fetch-dashboard-metadata [dashboard])))))

;;; ----------------------------------------------- Sharing is Caring ------------------------------------------------

(api.macros/defendpoint :post "/:dashboard-id/public_link"
  "Generate publicly-accessible links for this Dashboard. Returns UUID to be used in public links. (If this
  Dashboard has already been shared, it will return the existing public link rather than creating a new one.) Public
  sharing must be enabled."
  [{:keys [dashboard-id]} :- [:map
                              [:dashboard-id ms/PositiveInt]]]
  (api/check-superuser)
  (public-sharing.validation/check-public-sharing-enabled)
  (api/check-not-archived (api/read-check :model/Dashboard dashboard-id))
  {:uuid (or (t2/select-one-fn :public_uuid :model/Dashboard :id dashboard-id)
             (u/prog1 (str (random-uuid))
               (t2/update! :model/Dashboard dashboard-id
                           {:public_uuid       <>
                            :made_public_by_id api/*current-user-id*})))})

(api.macros/defendpoint :delete "/:dashboard-id/public_link"
  "Delete the publicly-accessible link to this Dashboard."
  [{:keys [dashboard-id]} :- [:map
                              [:dashboard-id ms/PositiveInt]]]
  (perms/check-has-application-permission :setting)
  (public-sharing.validation/check-public-sharing-enabled)
  (api/check-exists? :model/Dashboard :id dashboard-id, :public_uuid [:not= nil], :archived false)
  (t2/update! :model/Dashboard dashboard-id
              {:public_uuid       nil
               :made_public_by_id nil})
  {:status 204, :body nil})

(api.macros/defendpoint :get "/:id/related"
  "Return related entities."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (-> (t2/select-one :model/Dashboard :id id) api/read-check xrays/related))

;;; ---------------------------------------------- Transient dashboards ----------------------------------------------

(api.macros/defendpoint :post "/save/collection/:parent-collection-id"
  "Save a denormalized description of dashboard into collection with ID `:parent-collection-id`."
  [{:keys [parent-collection-id]} :- [:map
                                      [:parent-collection-id ms/PositiveInt]]
   _query-params
   dashboard]
  (collection/check-write-perms-for-collection parent-collection-id)
  (let [dashboard (dashboard/save-transient-dashboard! dashboard parent-collection-id)]
    (events/publish-event! :event/dashboard-create {:object dashboard :user-id api/*current-user-id*})
    dashboard))

(api.macros/defendpoint :post "/save"
  "Save a denormalized description of dashboard."
  [_route-params
   _query-params
   dashboard]
  (let [parent-collection-id (:id (xrays/get-or-create-container-collection
                                   (if api/*is-superuser?*
                                     "/"
                                     (collection/children-location
                                      (t2/select-one :model/Collection :personal_owner_id api/*current-user-id*)))))
        dashboard (dashboard/save-transient-dashboard! (assoc dashboard :creator_id api/*current-user-id*) parent-collection-id)]
    (events/publish-event! :event/dashboard-create {:object dashboard :user-id api/*current-user-id*})
    dashboard))

;;; ------------------------------------- Chain-filtering param value endpoints --------------------------------------

(api.macros/defendpoint :get "/:id/params/:param-key/values"
  "Fetch possible values of the parameter whose ID is `:param-key`. If the values come directly from a query, optionally
  restrict these values by passing query parameters like `other-parameter=value` e.g.

    ;; fetch values for Dashboard 1 parameter 'abc' that are possible when parameter 'def' is set to 100
    GET /api/dashboard/1/params/abc/values?def=100"
  [{:keys [id param-key]}      :- [:map
                                   [:id ms/PositiveInt]]
   constraint-param-key->value :- [:map-of string? any?]]
  (let [dashboard (dashboard/hydrate-dashboard-details (api/read-check :model/Dashboard id))]
    ;; If a user can read the dashboard, then they can lookup filters. This also works with sandboxing.
    (binding [qp.perms/*param-values-query* true]
      (parameters.dashboard/param-values dashboard param-key constraint-param-key->value))))

(api.macros/defendpoint :get "/:id/params/:param-key/search/:query"
  "Fetch possible values of the parameter whose ID is `:param-key` that contain `:query`. Optionally restrict
  these values by passing query parameters like `other-parameter=value` e.g.

    ;; fetch values for Dashboard 1 parameter 'abc' that contain 'Cam' and are possible when parameter 'def' is set
    ;; to 100
     GET /api/dashboard/1/params/abc/search/Cam?def=100

  Currently limited to first 1000 results."
  [{:keys [id param-key query]} :- [:map
                                    [:id    ms/PositiveInt]
                                    [:query ms/NonBlankString]]
   constraint-param-key->value  :- [:map-of string? any?]]
  (let [dashboard (api/read-check :model/Dashboard id)]
    ;; If a user can read the dashboard, then they can lookup filters. This also works with sandboxing.
    (binding [qp.perms/*param-values-query* true
              chain-filter/*allow-implicit-uuid-field-remapping* false]
      (parameters.dashboard/param-values dashboard param-key constraint-param-key->value query))))

(api.macros/defendpoint :get "/:id/params/:param-key/remapping"
  "Fetch the remapped value for a given value of the parameter with ID `:param-key`.

    ;; fetch the remapped value for Dashboard 1 parameter 'abc' for value 100
    GET /api/dashboard/1/params/abc/remapping?value=100"
  [{:keys [id param-key]} :- [:map
                              [:id ms/PositiveInt]
                              [:param-key :string]]
   {:keys [value]}        :- [:map [:value :string]]]
  (let [dashboard (api/read-check :model/Dashboard id)]
    (binding [qp.perms/*param-values-query* true]
      (parameters.dashboard/dashboard-param-remapped-value dashboard param-key (codec/url-decode value)))))

(api.macros/defendpoint :get "/params/valid-filter-fields"
  "Utility endpoint for powering Dashboard UI. Given some set of `filtered` Field IDs (presumably Fields used in
  parameters) and a set of `filtering` Field IDs that will be used to restrict values of `filtered` Fields, for each
  `filtered` Field ID return the subset of `filtering` Field IDs that would actually be used in a chain filter query
  with these Fields.

  e.g. in a chain filter query like

  GET /api/dashboard/10/params/PARAM_1/values?PARAM_2=100

  Assume `PARAM_1` maps to Field 1 and `PARAM_2` maps to Fields 2 and 3. The underlying MBQL query may or may not
  filter against Fields 2 and 3, depending on whether an FK relationship that lets us create a join against Field 1
  can be found. You can use this endpoint to determine which of those Fields is actually used:

  GET /api/dashboard/params/valid-filter-fields?filtered=1&filtering=2&filtering=3
  ;; ->
  {1 [2 3]}

  Results are returned as a map of

  `filtered` Field ID -> subset of `filtering` Field IDs that would be used in chain filter query"
  [_route-params
   {:keys [filtered filtering]} :- [:map
                                    [:filtered  (ms/QueryVectorOf ms/PositiveInt)]
                                    [:filtering {:optional true} [:maybe (ms/QueryVectorOf ms/PositiveInt)]]]]
  (let [filtered-field-ids  (if (sequential? filtered) (set filtered) #{filtered})
        filtering-field-ids (if (sequential? filtering) (set filtering) #{filtering})]
    (doseq [field-id (set/union filtered-field-ids filtering-field-ids)]
      (api/read-check :model/Field field-id))
    (into {} (for [field-id filtered-field-ids]
               [field-id (sort (chain-filter/filterable-field-ids field-id filtering-field-ids))]))))

;;; TODO -- why don't we use [[metabase.util.malli.schema/Parameter]] for this? Are the parameters passed here
;;; different?
(def ParameterWithID
  "Schema for a parameter map with an string `:id`."
  (mu/with-api-error-message
   [:and
    [:map
     [:id ms/NonBlankString]]
    [:map-of :keyword :any]]
   (deferred-tru "value must be a parameter map with an ''id'' key")))

;;; ---------------------------------- Executing the action associated with a Dashcard -------------------------------

(api.macros/defendpoint :get "/:dashboard-id/dashcard/:dashcard-id/execute"
  "Fetches the values for filling in execution parameters. Pass PK parameters and values to select."
  [{:keys [dashboard-id dashcard-id]} :- [:map
                                          [:dashboard-id ms/PositiveInt]
                                          [:dashcard-id  ms/PositiveInt]]
   {:keys [parameters]} :- [:map
                            [:parameters {:optional true} ms/JSONString]]]
  (api/read-check :model/Dashboard dashboard-id)
  (actions/fetch-values
   (api/check-404 (actions/dashcard->action dashcard-id))
   (json/decode parameters)))

(api.macros/defendpoint :post "/:dashboard-id/dashcard/:dashcard-id/execute"
  "Execute the associated Action in the context of a `Dashboard` and `DashboardCard` that includes it.

   `parameters` should be the mapped dashboard parameters with values.
   `extra_parameters` should be the extra, user entered parameter values."
  [{:keys [dashboard-id dashcard-id]} :- [:map
                                          [:dashboard-id ms/PositiveInt]
                                          [:dashcard-id  ms/PositiveInt]]
   _query-params
   {:keys [parameters]} :- [:map
                            [:parameters {:optional true} [:maybe [:map-of :string :any]]]]]
  (api/read-check :model/Dashboard dashboard-id)
  ;; Undo middleware string->keyword coercion
  (actions/execute-dashcard! dashboard-id dashcard-id parameters))

;;; ---------------------------------- Running the query associated with a Dashcard ----------------------------------

(api.macros/defendpoint :post "/:dashboard-id/dashcard/:dashcard-id/card/:card-id/query"
  "Run the query associated with a Saved Question (`Card`) in the context of a `Dashboard` that includes it."
  [{:keys [dashboard-id dashcard-id card-id]} :- [:map
                                                  [:dashboard-id ms/PositiveInt]
                                                  [:dashcard-id  ms/PositiveInt]
                                                  [:card-id      ms/PositiveInt]]
   _query-params
   {:keys [dashboard_load_id], :as body} :- [:map
                                             [:dashboard_load_id {:optional true} [:maybe ms/NonBlankString]]
                                             [:parameters        {:optional true} [:maybe [:sequential ParameterWithID]]]]]
  (with-dashboard-load-id dashboard_load_id
    (u/prog1 (m/mapply qp.dashboard/process-query-for-dashcard
                       (merge
                        body
                        {:dashboard-id dashboard-id
                         :card-id      card-id
                         :dashcard-id  dashcard-id}))
      (events/publish-event! :event/card-read {:object-id card-id, :user-id api/*current-user-id*, :context :dashboard}))))

(api.macros/defendpoint :post "/:dashboard-id/dashcard/:dashcard-id/card/:card-id/query/:export-format"
  "Run the query associated with a Saved Question (`Card`) in the context of a `Dashboard` that includes it, and return
  its results as a file in the specified format.

  `parameters` should be passed as query parameter encoded as a serialized JSON string (this is because this endpoint
  is normally used to power 'Download Results' buttons that use HTML `form` actions)."
  [{:keys [dashboard-id dashcard-id card-id export-format]} :- [:map
                                                                [:dashboard-id  ms/PositiveInt]
                                                                [:dashcard-id   ms/PositiveInt]
                                                                [:card-id       ms/PositiveInt]
                                                                [:export-format ::qp.schema/export-format]]
   _query-params
   {:keys          [parameters]
    format-rows?   :format_rows
    pivot-results? :pivot_results}
   :- [:map
       [:parameters    {:optional true} [:maybe [:or
                                                 [:sequential ParameterWithID]
                                                 ;; support <form> encoded params for backwards compatibility... see
                                                 ;; https://metaboat.slack.com/archives/C010L1Z4F9S/p1738003606875659
                                                 ms/JSONString]]]
       [:format_rows   {:default false} ms/BooleanValue]
       [:pivot_results {:default false} ms/BooleanValue]]]
  (m/mapply qp.dashboard/process-query-for-dashcard
            {:dashboard-id  dashboard-id
             :card-id       card-id
             :dashcard-id   dashcard-id
             :export-format export-format
             :parameters    (cond-> parameters
                              (string? parameters) json/decode+kw)
             :context       (api.dataset/export-format->context export-format)
             :constraints   nil
             ;; TODO -- passing this `:middleware` map is a little repetitive, need to think of a way to not have to
             ;; specify this all over the codebase any time we want to do a query with an export format. Maybe this
             ;; should be the default if `export-format` isn't `:api`?
             :middleware    {:process-viz-settings?  true
                             :skip-results-metadata? true
                             :ignore-cached-results? true
                             :format-rows?           format-rows?
                             :pivot?                 pivot-results?
                             :js-int-to-string?      false}}))

(api.macros/defendpoint :post "/pivot/:dashboard-id/dashcard/:dashcard-id/card/:card-id/query"
  "Run a pivot table query for a specific DashCard."
  [{:keys [dashboard-id dashcard-id card-id]} :- [:map
                                                  [:dashboard-id ms/PositiveInt]
                                                  [:dashcard-id  ms/PositiveInt]
                                                  [:card-id      ms/PositiveInt]]
   _query-params
   body :- [:map
            [:parameters {:optional true} [:maybe [:sequential ParameterWithID]]]]]
  (u/prog1 (m/mapply qp.dashboard/process-query-for-dashcard
                     (merge
                      body
                      {:dashboard-id dashboard-id
                       :card-id      card-id
                       :dashcard-id  dashcard-id
                       :qp           qp.pivot/run-pivot-query}))
    (events/publish-event! :event/card-read {:object-id card-id, :user-id api/*current-user-id*, :context :dashboard})))

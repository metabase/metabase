(ns metabase.api.dashboard
  "/api/dashboard endpoints."
  (:require
   [cheshire.core :as json]
   [clojure.core.cache :as cache]
   [clojure.core.memoize :as memoize]
   [clojure.set :as set]
   [compojure.core :refer [DELETE GET POST PUT]]
   [medley.core :as m]
   [metabase.actions.core :as actions]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.api.dataset :as api.dataset]
   [metabase.api.query-metadata :as api.query-metadata]
   [metabase.email.messages :as messages]
   [metabase.events :as events]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.models.action :as action]
   [metabase.models.card :as card :refer [Card]]
   [metabase.models.collection :as collection]
   [metabase.models.collection.root :as collection.root]
   [metabase.models.dashboard :as dashboard :refer [Dashboard]]
   [metabase.models.dashboard-card :as dashboard-card :refer [DashboardCard]]
   [metabase.models.dashboard-tab :as dashboard-tab]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.field :refer [Field]]
   [metabase.models.interface :as mi]
   [metabase.models.params :as params]
   [metabase.models.params.chain-filter :as chain-filter]
   [metabase.models.params.custom-values :as custom-values]
   [metabase.models.pulse :as pulse]
   [metabase.models.query :as query :refer [Query]]
   [metabase.models.query.permissions :as query-perms]
   [metabase.models.revision :as revision]
   [metabase.models.revision.last-edit :as last-edit]
   [metabase.models.table :refer [Table]]
   [metabase.query-processor.dashboard :as qp.dashboard]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.pivot :as qp.pivot]
   [metabase.query-processor.util :as qp.util]
   [metabase.related :as related]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.xrays :as xrays]
   [steffan-westcott.clj-otel.api.trace.span :as span]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- dashboards-list [filter-option]
  (as-> (t2/select :model/Dashboard {:where    [:and (case (or (keyword filter-option) :all)
                                                      (:all :archived)  true
                                                      :mine [:= :creator_id api/*current-user-id*])
                                                [:= :archived (= (keyword filter-option) :archived)]]
                                     :order-by [:%lower.name]}) <>
    (t2/hydrate <> :creator)
    (filter mi/can-read? <>)))

(api/defendpoint ^:deprecated GET "/"
  "This endpoint is currently unused by the Metabase frontend and may be out of date with the rest of the application.
  It only exists for backwards compatibility and may be removed in the future.

  Get `Dashboards`. With filter option `f` (default `all`), restrict results as follows:
  *  `all`      - Return all Dashboards.
  *  `mine`     - Return Dashboards created by the current user.
  *  `archived` - Return Dashboards that have been archived. (By default, these are *excluded*.)"
  [f]
  {f [:maybe [:enum "all" "mine" "archived"]]}
  (let [dashboards (dashboards-list f)
        edit-infos (:dashboard (last-edit/fetch-last-edited-info {:dashboard-ids (map :id dashboards)}))]
    (into []
          (map (fn [{:keys [id] :as dashboard}]
                 (if-let [edit-info (get edit-infos id)]
                   (assoc dashboard :last-edit-info edit-info)
                   dashboard)))
          dashboards)))

(defn- hydrate-dashboard-details
  "Get dashboard details for the complete dashboard, including tabs, dashcards, params, etc."
  [{dashboard-id :id :as dashboard}]
  ;; I'm a bit worried that this is an n+1 situation here. The cards can be batch hydrated i think because they
  ;; have a hydration key and an id. moderation_reviews currently aren't batch hydrated but i'm worried they
  ;; cannot be in this situation
  (span/with-span!
    {:name       "hydrate-dashboard-details"
     :attributes {:dashboard/id dashboard-id}}
    (t2/hydrate dashboard [:dashcards
                           ;; disabled :can_run_adhoc_query for performance reasons in 50 release
                           [:card :can_write #_:can_run_adhoc_query [:moderation_reviews :moderator_details]]
                           [:series :can_write #_:can_run_adhoc_query]
                           :dashcard/action
                           :dashcard/linkcard-info]
                :last_used_param_values
                :tabs
                :collection_authority_level
                :can_write
                :param_fields
                :param_values
                [:collection :is_personal])))

(api/defendpoint POST "/"
  "Create a new Dashboard."
  [:as {{:keys [name description parameters cache_ttl collection_id collection_position], :as _dashboard} :body}]
  {name                ms/NonBlankString
   parameters          [:maybe [:sequential ms/Parameter]]
   description         [:maybe :string]
   cache_ttl           [:maybe ms/PositiveInt]
   collection_id       [:maybe ms/PositiveInt]
   collection_position [:maybe ms/PositiveInt]}
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
                        ;; Adding a new dashboard at `collection_position` could cause other dashboards in this collection to change
                        ;; position, check that and fix up if needed
                        (api/maybe-reconcile-collection-position! dashboard-data)
                        ;; Ok, now save the Dashboard
                        (first (t2/insert-returning-instances! :model/Dashboard dashboard-data)))]
    (events/publish-event! :event/dashboard-create {:object dash :user-id api/*current-user-id*})
    (snowplow/track-event! ::snowplow/dashboard-created api/*current-user-id* {:dashboard-id (u/the-id dash)})
    (-> dash
        hydrate-dashboard-details
        collection.root/hydrate-root-collection
        (assoc :last-edit-info (last-edit/edit-information-for-user @api/*current-user*)))))

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
    (into {} (for [[k v] (t2/select-fn->fn :query_hash :average_execution_time Query :query_hash [:in hashes])]
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
  (update dashboard :dashcards add-query-average-duration-to-dashcards))

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
        hydrate-dashboard-details
        collection.root/hydrate-root-collection
        api/check-not-archived
        hide-unreadable-cards
        add-query-average-durations)))

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

(defn- cards-to-copy
  "Returns a map of which cards we need to copy and which are not to be copied. The `:copy` key is a map from id to
  card. The `:discard` key is a vector of cards which were not copied due to permissions."
  [dashcards]
  (letfn [(split-cards [{:keys [card series] :as db-card}]
            (cond
              (nil? (:card_id db-card)) ; text card
              {}

              ;; cards without permissions are just a map with an :id from [[hide-unreadable-card]]
              (not (mi/model card))
              {:retain nil, :discard (into [card] series)}

              (mi/can-read? card)
              (let [{writable true unwritable false} (group-by (comp boolean mi/can-read?)
                                                               series)]
                {:retain (into [card] writable), :discard unwritable})
              ;; if you can't write the base, we don't have anywhere to put the series
              :else
              {:discard (into [card] series)}))]
    (reduce (fn [acc db-card]
              (let [{:keys [retain discard]} (split-cards db-card)]
                (-> acc
                    (update :copy merge (m/index-by :id retain))
                    (update :discard concat discard))))
            {:copy {}
             :discard []}
            dashcards)))

(defn- duplicate-cards
  "Takes a dashboard id, and duplicates the cards both on the dashboard's cards and dashcardseries. Returns a map of
  {:copied {old-card-id duplicated-card} :uncopied [card]} so that the new dashboard can adjust accordingly."
  [dashboard dest-coll-id]
  (let [same-collection? (= (:collection_id dashboard) dest-coll-id)
        {:keys [copy discard]} (cards-to-copy (:dashcards dashboard))]
    (reduce (fn [m [id card]]
              (assoc-in m
                        [:copied id]
                        (if (= (:type card) :model)
                          card
                          (card/create-card!
                           (cond-> (assoc card :collection_id dest-coll-id)
                             same-collection?
                             (update :name #(str % " - " (tru "Duplicate"))))
                           @api/*current-user*
                           ;; creating cards from a transaction. wait until tx complete to signal event
                           true))))
            {:copied {}
             :uncopied discard}
            copy)))

(defn- duplicate-tabs
  [new-dashboard existing-tabs]
  (let [new-tab-ids (t2/insert-returning-pks! :model/DashboardTab
                                              (for [tab existing-tabs]
                                                (-> tab
                                                    (assoc :dashboard_id (:id new-dashboard))
                                                    (dissoc :id :entity_id :created_at :updated_at))))]
    (zipmap (map :id existing-tabs) new-tab-ids)))

(defn update-cards-for-copy
  "Update dashcards in a dashboard for copying.
  If the dashboard has tabs, fix up the tab ids in dashcards to point to the new tabs.
  Then if shallow copy, return the cards. If deep copy, replace ids with id from the newly-copied cards.
  If there is no new id, it means user lacked curate permissions for the cards
  collections and it is omitted. Dashboard-id is only needed for useful errors."
  [dashboard-id dashcards deep? id->new-card id->new-tab-id]
  (when (and deep? (nil? id->new-card))
    (throw (ex-info (tru "No copied card information found")
                    {:user-id api/*current-user-id*
                     :dashboard-id dashboard-id})))
  (let [dashcards (if (seq id->new-tab-id)
                    (map #(assoc % :dashboard_tab_id (id->new-tab-id (:dashboard_tab_id %)))
                         dashcards)
                    dashcards)]
    (if-not deep?
      dashcards
      (keep (fn [dashboard-card]
              (cond
               ;; text cards need no manipulation
               (nil? (:card_id dashboard-card))
               dashboard-card

               ;; if we didn't duplicate, it doesn't go in the dashboard
               (not (id->new-card (:card_id dashboard-card)))
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
                                                series)))))))
            dashcards))))

(api/defendpoint POST "/:from-dashboard-id/copy"
  "Copy a Dashboard."
  [from-dashboard-id :as {{:keys [name description collection_id collection_position
                                  is_deep_copy], :as _dashboard} :body}]
  {from-dashboard-id      [:maybe ms/PositiveInt]
   name                   [:maybe ms/NonBlankString]
   description            [:maybe :string]
   collection_id          [:maybe ms/PositiveInt]
   collection_position    [:maybe ms/PositiveInt]
   is_deep_copy           [:maybe :boolean]}
  ;; if we're trying to save the new dashboard in a Collection make sure we have permissions to do that
  (collection/check-write-perms-for-collection collection_id)
  (let [existing-dashboard (get-dashboard from-dashboard-id)
        dashboard-data {:name                (or name (:name existing-dashboard))
                        :description         (or description (:description existing-dashboard))
                        :parameters          (or (:parameters existing-dashboard) [])
                        :creator_id          api/*current-user-id*
                        :collection_id       collection_id
                        :collection_position collection_position}
        new-cards      (atom nil)
        dashboard      (t2/with-transaction [_conn]
                        ;; Adding a new dashboard at `collection_position` could cause other dashboards in this
                        ;; collection to change position, check that and fix up if needed
                        (api/maybe-reconcile-collection-position! dashboard-data)
                        ;; Ok, now save the Dashboard
                        (let [dash (first (t2/insert-returning-instances! :model/Dashboard dashboard-data))
                              {id->new-card :copied uncopied :uncopied}
                              (when is_deep_copy
                                (duplicate-cards existing-dashboard collection_id))

                              id->new-tab-id (when-let [existing-tabs (seq (:tabs existing-dashboard))]
                                               (duplicate-tabs dash existing-tabs))]
                          (reset! new-cards (vals id->new-card))
                          (when-let [dashcards (seq (update-cards-for-copy from-dashboard-id
                                                                           (:dashcards existing-dashboard)
                                                                           is_deep_copy
                                                                           id->new-card
                                                                           id->new-tab-id))]
                            (api/check-500 (dashboard/add-dashcards! dash dashcards)))
                          (cond-> dash
                            (seq uncopied)
                            (assoc :uncopied uncopied))))]
    (snowplow/track-event! ::snowplow/dashboard-created api/*current-user-id* {:dashboard-id (u/the-id dashboard)})
    ;; must signal event outside of tx so cards are visible from other threads
    (when-let [newly-created-cards (seq @new-cards)]
      (doseq [card newly-created-cards]
        (events/publish-event! :event/card-create {:object card :user-id api/*current-user-id*})))
    (events/publish-event! :event/dashboard-create {:object dashboard :user-id api/*current-user-id*})
    dashboard))

;;; --------------------------------------------- Fetching/Updating/Etc. ---------------------------------------------

(api/defendpoint GET "/:id"
  "Get Dashboard with ID."
  [id :as {{dashboard-load-id "dashboard_load_id"} :query-params}]
  {id ms/PositiveInt}
  (with-dashboard-load-id dashboard-load-id
    (let [dashboard (get-dashboard id)]
      (u/prog1 (first (last-edit/with-last-edit-info [dashboard] :dashboard))
               (events/publish-event! :event/dashboard-read {:object-id (:id dashboard) :user-id api/*current-user-id*})))))

(defn- check-allowed-to-change-embedding
  "You must be a superuser to change the value of `enable_embedding` or `embedding_params`. Embedding must be
  enabled."
  [dash-before-update dash-updates]
  (when (or (api/column-will-change? :enable_embedding dash-before-update dash-updates)
            (api/column-will-change? :embedding_params dash-before-update dash-updates))
    (validation/check-embedding-enabled)
    (api/check-superuser)))

(api/defendpoint DELETE "/:id"
  "Hard delete a Dashboard. To soft delete, use `PUT /api/dashboard/:id`

  This will remove also any questions/models/segments/metrics that use this database."
  [id]
  {id ms/PositiveInt}
  (let [dashboard (api/write-check :model/Dashboard id)]
    (t2/delete! :model/Dashboard :id id)
    (events/publish-event! :event/dashboard-delete {:object dashboard :user-id api/*current-user-id*}))
  api/generic-204-no-content)

(defn- param-target->field-id [target query]
  (when-let [field-clause (params/param-target->field-clause target {:dataset_query query})]
    (lib.util.match/match-one field-clause [:field (id :guard integer?) _] id)))

;; TODO -- should we only check *new* or *modified* mappings?
(mu/defn ^:private check-parameter-mapping-permissions
  "Starting in 0.41.0, you must have *data* permissions in order to add or modify a DashboardCard parameter mapping."
  {:added "0.41.0"}
  [parameter-mappings :- [:sequential dashboard-card/ParamMapping]]
  (when (seq parameter-mappings)
    ;; calculate a set of all Field IDs referenced by parameter mappings; then from those Field IDs calculate a set of
    ;; all Table IDs to which those Fields belong. This is done in a batched fashion so we can avoid N+1 query issues
    ;; if there happen to be a lot of parameters
    (let [card-ids              (into #{}
                                      (comp (map :card-id)
                                            (remove nil?))
                                      parameter-mappings)]
      (when (seq card-ids)
        (let [card-id->query        (t2/select-pk->fn :dataset_query Card :id [:in card-ids])
              field-ids             (set (for [{:keys [target card-id]} parameter-mappings
                                               :when                    card-id
                                               :let                     [query    (or (card-id->query card-id)
                                                                                      (throw (ex-info (tru "Card {0} does not exist or does not have a valid query."
                                                                                                           card-id)
                                                                                                      {:status-code 404
                                                                                                       :card-id     card-id})))
                                                                         field-id (param-target->field-id target query)]
                                               :when                    field-id]
                                           field-id))
              table-ids             (when (seq field-ids)
                                      (t2/select-fn-set :table_id Field :id [:in field-ids]))
              table-id->database-id (when (seq table-ids)
                                      (t2/select-pk->fn :db_id Table :id [:in table-ids]))]
          (doseq [table-id table-ids
                  :let     [database-id (table-id->database-id table-id)]]
            ;; check whether we'd actually be able to query this Table (do we have ad-hoc data perms for it?)
            (when-not (query-perms/can-query-table? database-id table-id)
              (throw (ex-info (tru "You must have data permissions to add a parameter referencing the Table {0}."
                                   (pr-str (t2/select-one-fn :name Table :id table-id)))
                              {:status-code        403
                               :database-id        database-id
                               :table-id           table-id
                               :actual-permissions @api/*current-user-permissions-set*})))))))))

(defn- existing-parameter-mappings
  "Returns a map of DashboardCard ID -> parameter mappings for a Dashboard of the form

  {<dashboard-card-id> #{{:target       [:dimension [:field 1000 nil]]
                          :parameter_id \"abcdef\"}}}"
  [dashboard-id]
  (m/map-vals (fn [mappings]
                (into #{} (map #(select-keys % [:target :parameter_id])) mappings))
              (t2/select-pk->fn :parameter_mappings DashboardCard :dashboard_id dashboard-id)))

(defn- check-updated-parameter-mapping-permissions
  "In 0.41.0+ you now require data permissions for the Table in question to add or modify Dashboard parameter mappings.
  Check that the current user has the appropriate permissions. Don't check any parameter mappings that already exist
  for this Dashboard -- only check permissions for new or modified ones."
  [dashboard-id dashcards]
  (let [dashcard-id->existing-mappings (existing-parameter-mappings dashboard-id)
        existing-mapping?              (fn [dashcard-id mapping]
                                         (let [[mapping]         (mi/normalize-parameters-list [mapping])
                                               existing-mappings (get dashcard-id->existing-mappings dashcard-id)]
                                           (contains? existing-mappings (select-keys mapping [:target :parameter_id]))))
        new-mappings                   (for [{mappings :parameter_mappings, dashcard-id :id} dashcards
                                             mapping mappings
                                             :when (not (existing-mapping? dashcard-id mapping))]
                                         (assoc mapping :dashcard-id dashcard-id))
        ;; need to add the appropriate `:card-id` for all the new mappings we're going to check.
        dashcard-id->card-id           (when (seq new-mappings)
                                         (t2/select-pk->fn :card_id DashboardCard
                                           :dashboard_id dashboard-id
                                           :id           [:in (set (map :dashcard-id new-mappings))]))
        new-mappings                   (for [{:keys [dashcard-id], :as mapping} new-mappings]
                                         (assoc mapping :card-id (get dashcard-id->card-id dashcard-id)))]
    (check-parameter-mapping-permissions new-mappings)))

(defn- create-dashcards!
  [dashboard dashcards]
  (doseq [{:keys [card_id]} dashcards
          :when  (pos-int? card_id)]
    (api/check-not-archived (api/read-check Card card_id)))
  (check-parameter-mapping-permissions (for [{:keys [card_id parameter_mappings]} dashcards
                                             mapping parameter_mappings]
                                        (assoc mapping :card-id card_id)))
  (api/check-500 (dashboard/add-dashcards! dashboard dashcards)))

(defn- update-dashcards! [dashboard dashcards]
  (check-updated-parameter-mapping-permissions (:id dashboard) dashcards)
  ;; transform the dashcard data to the format of the DashboardCard model
  ;; so update-dashcards! can compare them with existing dashcards
  (dashboard/update-dashcards! dashboard (map dashboard-card/from-parsed-json dashcards))
  dashcards)

(defn- delete-dashcards! [dashcard-ids]
  (let [dashboard-cards (t2/select DashboardCard :id [:in dashcard-ids])]
    (dashboard-card/delete-dashboard-cards! dashcard-ids)
    dashboard-cards))

(defn- do-update-dashcards!
  [dashboard current-cards new-cards]
  (let [{:keys [to-create to-update to-delete]} (u/row-diff current-cards new-cards)]
    (when (seq to-update)
      (update-dashcards! dashboard to-update))
    {:deleted-dashcards (when (seq to-delete)
                          (delete-dashcards! (map :id to-delete)))
     :created-dashcards (when (seq to-create)
                          (create-dashcards! dashboard to-create))}))

(def ^:private UpdatedDashboardCard
  [:map
   ;; id can be negative, it indicates a new card and BE should create them
   [:id                                  int?]
   [:size_x                              ms/PositiveInt]
   [:size_y                              ms/PositiveInt]
   [:row                                 ms/IntGreaterThanOrEqualToZero]
   [:col                                 ms/IntGreaterThanOrEqualToZero]
   [:parameter_mappings {:optional true} [:maybe [:sequential [:map
                                                               [:parameter_id ms/NonBlankString]
                                                               [:target       :any]]]]]
   [:series             {:optional true} [:maybe [:sequential map?]]]])

(def ^:private UpdatedDashboardTab
  [:map
   ;; id can be negative, it indicates a new card and BE should create them
   [:id   ms/Int]
   [:name ms/NonBlankString]])

(defn- track-dashcard-and-tab-events!
  [{dashboard-id :id :as dashboard}
   {:keys [created-dashcards deleted-dashcards
           created-tab-ids deleted-tab-ids total-num-tabs]}]
  ;; Dashcard events
  (when (seq deleted-dashcards)
    (events/publish-event! :event/dashboard-remove-cards
                           {:object dashboard :user-id api/*current-user-id* :dashcards deleted-dashcards}))
  (when (seq created-dashcards)
    (events/publish-event! :event/dashboard-add-cards
                           {:object dashboard :user-id api/*current-user-id* :dashcards created-dashcards})
    (for [{:keys [card_id]} created-dashcards
          :when             (pos-int? card_id)]
      (snowplow/track-event! ::snowplow/question-added-to-dashboard
                             api/*current-user-id*
                             {:dashboard-id dashboard-id :question-id card_id :user-id api/*current-user-id*})))
  ;; Tabs events
  (when (seq deleted-tab-ids)
    (snowplow/track-event! ::snowplow/dashboard-tab-deleted
                           api/*current-user-id*
                           {:dashboard-id   dashboard-id
                            :num-tabs       (count deleted-tab-ids)
                            :total-num-tabs total-num-tabs}))
  (when (seq created-tab-ids)
    (snowplow/track-event! ::snowplow/dashboard-tab-created
                           api/*current-user-id*
                           {:dashboard-id   dashboard-id
                            :num-tabs       (count created-tab-ids)
                            :total-num-tabs total-num-tabs})))

;;;;;;;;;;;; Bad pulse check & repair

(defn- bad-pulse-notification-data
  "Given a pulse and bad parameters, return relevant notification data:
  - The name of the pulse
  - Which selected parameter values are broken
  - The user info for the creator of the pulse
  - The users affected by the pulse"
  [{bad-pulse-id :id pulse-name :name :keys [parameters creator_id]}]
  (let [creator (t2/select-one [:model/User :first_name :last_name :email] creator_id)]
    {:pulse-id       bad-pulse-id
     :pulse-name     pulse-name
     :bad-parameters parameters
     :pulse-creator  creator
     :affected-users (flatten
                       (for [{pulse-channel-id  :id
                              channel-type      :channel_type
                              {:keys [channel]} :details} (t2/select [:model/PulseChannel :id :channel_type :details]
                                                            :pulse_id [:= bad-pulse-id])]
                         (case channel-type
                           :email (let [pulse-channel-recipients (when (= :email channel-type)
                                                                   (t2/select :model/PulseChannelRecipient
                                                                     :pulse_channel_id pulse-channel-id))]
                                    (when (seq pulse-channel-recipients)
                                      (map
                                        (fn [{:keys [common_name] :as recipient}]
                                          (assoc recipient
                                            :notification-type channel-type
                                            :recipient common_name))
                                        (t2/select [:model/User :first_name :last_name :email]
                                          :id [:in (map :user_id pulse-channel-recipients)]))))
                           :slack {:notification-type channel-type
                                   :recipient         channel}
                           nil)))}))

(defn- broken-pulses
  "Identify and return any pulses used in a subscription that contain parameters that are no longer on the dashboard."
  [dashboard-id original-dashboard-params]
  (when (seq original-dashboard-params)
    (let [{:keys [resolved-params]} (t2/hydrate
                                      (t2/select-one [:model/Dashboard :id :parameters] dashboard-id)
                                      :resolved-params)
          dashboard-params (set (keys resolved-params))]
      (->> (t2/select :model/Pulse :dashboard_id dashboard-id :archived false)
           (keep (fn [{:keys [parameters] :as pulse}]
                   (let [bad-params (filterv
                                      (fn [{param-id :id}] (not (contains? dashboard-params param-id)))
                                      parameters)]
                     (when (seq bad-params)
                       (assoc pulse :parameters bad-params)))))
           seq))))

(defn- broken-subscription-data
  "Given a dashboard id and original parameters, return data (if any) on any broken subscriptions. This will be a seq
  of maps, each containing:
  - The pulse id that was broken
  - name and email data for the dashboard creator and pulse creator
  - Affected recipient information
  - Basic descriptive data on the affected dashboard, pulse, and parameters for use in downstream notifications"
  [dashboard-id original-dashboard-params]
  (when-some [broken-pulses (broken-pulses dashboard-id original-dashboard-params)]
    (let [{dashboard-name        :name
           dashboard-description :description
           dashboard-creator     :creator} (t2/hydrate
                                             (t2/select-one [:model/Dashboard :name :description :creator_id] dashboard-id)
                                             :creator)]
      (for [broken-pulse broken-pulses]
        (assoc
          (bad-pulse-notification-data broken-pulse)
          :dashboard-id dashboard-id
          :dashboard-name dashboard-name
          :dashboard-description dashboard-description
          :dashboard-creator (select-keys dashboard-creator [:first_name :last_name :email :common_name]))))))

(defn- handle-broken-subscriptions
  "Given a dashboard id and original parameters, determine if any of the subscriptions are broken (we've removed params
  that subscriptions require). If so, delete the subscriptions and notify the dashboard and pulse creators."
  [dashboard-id original-dashboard-params]
  (doseq [{:keys [pulse-id] :as broken-subscription} (broken-subscription-data dashboard-id original-dashboard-params)]
    ;; Archive the pulse
    (pulse/update-pulse! {:id pulse-id :archived true})
    ;; Let the pulse and subscription creator know about the broken pulse
    (messages/send-broken-subscription-notification! broken-subscription)))

;;;;;;;;;;;;;;;;;;;;; End functions to handle broken subscriptions

(defn- update-dashboard
  "Updates a Dashboard. Designed to be reused by PUT /api/dashboard/:id and PUT /api/dashboard/:id/cards"
  [id {:keys [dashcards tabs parameters] :as dash-updates}]
  (span/with-span!
    {:name       "update-dashboard"
     :attributes {:dashboard/id id}}
    (let [current-dash               (api/write-check Dashboard id)
          ;; If there are parameters in the update, we want the old params so that we can do a check to see if any of
          ;; the notifications were broken by the update.
          {original-params :resolved-params} (when parameters
                                               (t2/hydrate
                                                 (t2/select-one :model/Dashboard id)
                                                 [:dashcards :card]
                                                 :resolved-params))
          changes-stats              (atom nil)
          ;; tabs are always sent in production as well when dashcards are updated, but there are lots of
          ;; tests that exclude it. so this only checks for dashcards
          update-dashcards-and-tabs? (contains? dash-updates :dashcards)]
      (collection/check-allowed-to-change-collection current-dash dash-updates)
      (check-allowed-to-change-embedding current-dash dash-updates)
      (api/check-500
        (do
          (t2/with-transaction [_conn]
            ;; If the dashboard has an updated position, or if the dashboard is moving to a new collection, we might need to
            ;; adjust the collection position of other dashboards in the collection
            (api/maybe-reconcile-collection-position! current-dash dash-updates)
            (when-let [updates (not-empty
                                 (u/select-keys-when
                                   dash-updates
                                   :present #{:description :position :width :collection_id :collection_position :cache_ttl}
                                   :non-nil #{:name :parameters :caveats :points_of_interest :show_in_getting_started :enable_embedding
                                              :embedding_params :archived :auto_apply_filters}))]
              (t2/update! Dashboard id updates)
              (when (contains? updates :collection_id)
                (events/publish-event! :event/collection-touch {:collection-id id :user-id api/*current-user-id*}))
              ;; Handle broken subscriptions, if any, when parameters changed
              (when parameters
                (handle-broken-subscriptions id original-params)))
            (when update-dashcards-and-tabs?
              (when (not (false? (:archived false)))
                (api/check-not-archived current-dash))
              (let [{current-dashcards :dashcards
                     current-tabs      :tabs
                     :as               hydrated-current-dash} (t2/hydrate current-dash [:dashcards :series :card] :tabs)
                    _                       (when (and (seq current-tabs)
                                                                         (not (every? #(some? (:dashboard_tab_id %)) dashcards)))
                                                                (throw (ex-info (tru "This dashboard has tab, makes sure every card has a tab")
                                                                                {:status-code 400})))
                    new-tabs                (map-indexed (fn [idx tab] (assoc tab :position idx)) tabs)
                    {:keys [old->new-tab-id
                            deleted-tab-ids]
                     :as   tabs-changes-stats} (dashboard-tab/do-update-tabs! (:id current-dash) current-tabs new-tabs)
                    deleted-tab-ids         (set deleted-tab-ids)
                    current-dashcards       (remove (fn [dashcard]
                                                      (contains? deleted-tab-ids (:dashboard_tab_id dashcard)))
                                                    current-dashcards)
                    new-dashcards           (cond->> dashcards
                                                     ;; fixup the temporary tab ids with the real ones
                                                     (seq old->new-tab-id)
                                                     (map (fn [card]
                                                            (if-let [real-tab-id (get old->new-tab-id (:dashboard_tab_id card))]
                                                              (assoc card :dashboard_tab_id real-tab-id)
                                                              card))))
                    dashcards-changes-stats (do-update-dashcards! hydrated-current-dash current-dashcards new-dashcards)]
                (reset! changes-stats
                        (merge
                         (select-keys tabs-changes-stats [:created-tab-ids :deleted-tab-ids :total-num-tabs])
                         (select-keys dashcards-changes-stats [:created-dashcards :deleted-dashcards]))))))
          true))
      (let [dashboard (t2/select-one :model/Dashboard id)]
        ;; skip publishing the event if it's just a change in its collection position
        (when-not (= #{:collection_position}
                     (set (keys dash-updates)))
          (events/publish-event! :event/dashboard-update {:object dashboard :user-id api/*current-user-id*}))
        (track-dashcard-and-tab-events! dashboard @changes-stats)
        (-> dashboard
            hydrate-dashboard-details
            (assoc :last-edit-info (last-edit/edit-information-for-user @api/*current-user*)))))))

(api/defendpoint PUT "/:id"
  "Update a Dashboard, and optionally the `dashcards` and `tabs` of a Dashboard. The request body should be a JSON object with the same
  structure as the response from `GET /api/dashboard/:id`."
  [id :as {{:keys [description name parameters caveats points_of_interest show_in_getting_started enable_embedding
                   embedding_params position width archived collection_id collection_position cache_ttl dashcards tabs]
            :as   dash-updates} :body}]
  {id                      ms/PositiveInt
   name                    [:maybe ms/NonBlankString]
   description             [:maybe :string]
   caveats                 [:maybe :string]
   points_of_interest      [:maybe :string]
   show_in_getting_started [:maybe :boolean]
   enable_embedding        [:maybe :boolean]
   embedding_params        [:maybe ms/EmbeddingParams]
   parameters              [:maybe [:sequential ms/Parameter]]
   position                [:maybe ms/PositiveInt]
   width                   [:maybe [:enum "fixed" "full"]]
   archived                [:maybe :boolean]
   collection_id           [:maybe ms/PositiveInt]
   collection_position     [:maybe ms/PositiveInt]
   cache_ttl               [:maybe ms/PositiveInt]
   dashcards               [:maybe (ms/maps-with-unique-key [:sequential UpdatedDashboardCard] :id)]
   tabs                    [:maybe (ms/maps-with-unique-key [:sequential UpdatedDashboardTab] :id)]}
  (update-dashboard id dash-updates))

(api/defendpoint PUT "/:id/cards"
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
  [id :as {{:keys [cards tabs]} :body}]
  {id           ms/PositiveInt
   cards        (ms/maps-with-unique-key [:sequential UpdatedDashboardCard] :id)
   ;; tabs should be required in production, making it optional because lots of
   ;; e2e tests curerntly doesn't include it
   tabs [:maybe (ms/maps-with-unique-key [:sequential UpdatedDashboardTab] :id)]}
  (log/warn
   "DELETE /api/dashboard/:id/cards is deprecated. Use PUT /api/dashboard/:id instead.")
  (let [dashboard (update-dashboard id {:dashcards cards :tabs tabs})]
    {:cards (:dashcards dashboard)
     :tabs  (:tabs dashboard)}))

(api/defendpoint GET "/:id/revisions"
  "Fetch `Revisions` for Dashboard with ID."
  [id]
  {id ms/PositiveInt}
  (api/read-check :model/Dashboard id)
  (revision/revisions+details :model/Dashboard id))

(api/defendpoint POST "/:id/revert"
  "Revert a Dashboard to a prior `Revision`."
  [id :as {{:keys [revision_id]} :body}]
  {id ms/PositiveInt
   revision_id ms/PositiveInt}
  (api/write-check :model/Dashboard id)
  (revision/revert!
   {:entity      :model/Dashboard
    :id          id
    :user-id     api/*current-user-id*
    :revision-id revision_id}))

(api/defendpoint GET "/:id/query_metadata"
  "Get all of the required query metadata for the cards on dashboard."
  [id :as {{dashboard-load-id "dashboard_load_id"} :query-params}]
  {id ms/PositiveInt}
  (with-dashboard-load-id dashboard-load-id
    (data-perms/with-relevant-permissions-for-user api/*current-user-id*
      (let [dashboard (get-dashboard id)]
        (api.query-metadata/batch-fetch-dashboard-metadata [dashboard])))))

;;; ----------------------------------------------- Sharing is Caring ------------------------------------------------

(api/defendpoint POST "/:dashboard-id/public_link"
  "Generate publicly-accessible links for this Dashboard. Returns UUID to be used in public links. (If this
  Dashboard has already been shared, it will return the existing public link rather than creating a new one.) Public
  sharing must be enabled."
  [dashboard-id]
  {dashboard-id ms/PositiveInt}
  (api/check-superuser)
  (validation/check-public-sharing-enabled)
  (api/check-not-archived (api/read-check :model/Dashboard dashboard-id))
  {:uuid (or (t2/select-one-fn :public_uuid :model/Dashboard :id dashboard-id)
             (u/prog1 (str (random-uuid))
               (t2/update! :model/Dashboard dashboard-id
                           {:public_uuid       <>
                            :made_public_by_id api/*current-user-id*})))})

(api/defendpoint DELETE "/:dashboard-id/public_link"
  "Delete the publicly-accessible link to this Dashboard."
  [dashboard-id]
  {dashboard-id ms/PositiveInt}
  (validation/check-has-application-permission :setting)
  (validation/check-public-sharing-enabled)
  (api/check-exists? :model/Dashboard :id dashboard-id, :public_uuid [:not= nil], :archived false)
  (t2/update! :model/Dashboard dashboard-id
              {:public_uuid       nil
               :made_public_by_id nil})
  {:status 204, :body nil})

(api/defendpoint GET "/public"
  "Fetch a list of Dashboards with public UUIDs. These dashboards are publicly-accessible *if* public sharing is
  enabled."
  []
  (validation/check-has-application-permission :setting)
  (validation/check-public-sharing-enabled)
  (t2/select [:model/Dashboard :name :id :public_uuid], :public_uuid [:not= nil], :archived false))

(api/defendpoint GET "/embeddable"
  "Fetch a list of Dashboards where `enable_embedding` is `true`. The dashboards can be embedded using the embedding
  endpoints and a signed JWT."
  []
  (validation/check-has-application-permission :setting)
  (validation/check-embedding-enabled)
  (t2/select [:model/Dashboard :name :id], :enable_embedding true, :archived false))

(api/defendpoint GET "/:id/related"
  "Return related entities."
  [id]
  {id ms/PositiveInt}
  (-> (t2/select-one :model/Dashboard :id id) api/read-check related/related))

;;; ---------------------------------------------- Transient dashboards ----------------------------------------------

(api/defendpoint POST "/save/collection/:parent-collection-id"
  "Save a denormalized description of dashboard into collection with ID `:parent-collection-id`."
  [parent-collection-id :as {dashboard :body}]
  {parent-collection-id ms/PositiveInt}
  (collection/check-write-perms-for-collection parent-collection-id)
  (let [dashboard (dashboard/save-transient-dashboard! dashboard parent-collection-id)]
    (events/publish-event! :event/dashboard-create {:object dashboard :user-id api/*current-user-id*})
    dashboard))

(api/defendpoint POST "/save"
  "Save a denormalized description of dashboard."
  [:as {dashboard :body}]
  (let [parent-collection-id (if api/*is-superuser?*
                               (:id (xrays/get-or-create-root-container-collection))
                               (t2/select-one-fn :id 'Collection
                                                 :personal_owner_id api/*current-user-id*))
        dashboard (dashboard/save-transient-dashboard! dashboard parent-collection-id)]
    (events/publish-event! :event/dashboard-create {:object dashboard :user-id api/*current-user-id*})
    dashboard))

;;; ------------------------------------- Chain-filtering param value endpoints --------------------------------------

(def ^:const result-limit
  "How many results to return when chain filtering"
  1000)

(defn- get-template-tag
  "Fetch the `:field` clause from `dashcard` referenced by `:template-tag`.

    (get-template-tag [:template-tag :company] some-dashcard) ; -> [:field 100 nil]"
  [dimension card]
  (when-let [[_ tag] (mbql.u/check-clause :template-tag dimension)]
    (get-in card [:dataset_query :native :template-tags (u/qualified-name tag)])))

(defn- param-type->op [type]
  (if (get-in lib.schema.parameter/types [type :operator])
    (keyword (name type))
    :=))

(mu/defn ^:private param->fields
  [{:keys [mappings] :as param} :- mbql.s/Parameter]
  (for [{:keys [target] {:keys [card]} :dashcard} mappings
        :let  [[_ dimension] (->> (mbql.normalize/normalize-tokens target :ignore-path)
                                  (mbql.u/check-clause :dimension))]
        :when dimension
        :let  [ttag      (get-template-tag dimension card)
               dimension (condp mbql.u/is-clause? dimension
                           :field        dimension
                           :expression   dimension
                           :template-tag (:dimension ttag)
                           (log/error "cannot handle this dimension" {:dimension dimension}))
               field-id  (or
                          ;; Get the field id from the field-clause if it contains it. This is the common case
                          ;; for mbql queries.
                          (lib.util.match/match-one dimension [:field (id :guard integer?) _] id)
                          ;; Attempt to get the field clause from the model metadata corresponding to the field.
                          ;; This is the common case for native queries in which mappings from original columns
                          ;; have been performed using model metadata.
                          (:id (qp.util/field->field-info dimension (:result_metadata card))))]
        :when field-id]
    {:field-id field-id
     :op       (param-type->op (:type param))
     :options  (merge (:options ttag)
                      (:options param))}))

(mu/defn ^:private chain-filter-constraints :- chain-filter/Constraints
  [dashboard constraint-param-key->value]
  (vec (for [[param-key value] constraint-param-key->value
             :let              [param (get-in dashboard [:resolved-params param-key])]
             :when             param
             field             (param->fields param)]
         (assoc field :value value))))

(defn filter-values-from-field-refs
  "Get filter values when only field-refs (e.g. `[:field \"SOURCE\" {:base-type :type/Text}]`)
  are provided (rather than field-ids). This is a common case for nested queries."
  [dashboard param-key]
  (let [dashboard       (t2/hydrate dashboard :resolved-params)
        param           (get-in dashboard [:resolved-params param-key])
        results         (for [{:keys [target] {:keys [card]} :dashcard} (:mappings param)
                              :let [[_ dimension] (->> (mbql.normalize/normalize-tokens target :ignore-path)
                                                       (mbql.u/check-clause :dimension))]
                              :when dimension]
                          (custom-values/values-from-card card dimension))]
    (when-some [values (seq (distinct (mapcat :values results)))]
      (let [has_more_values (boolean (some true? (map :has_more_values results)))]
        {:values          (cond->> values
                                   (seq values)
                                   (sort-by (case (count (first values))
                                              2 second
                                              1 first)))
         :has_more_values has_more_values}))))

(defn- combine-chained-fitler-results
  [results]
  (let [;; merge values with remapped values taking priority
        values (->> (mapcat :values results)
                    (sort-by count)
                    (m/index-by first)
                    vals)]
    (cond->> values
      (seq values)
      ;; sort by remapped values only if all values are remapped
      (sort-by (case (count (first values))
                 2 second
                 1 first)))))

(mu/defn chain-filter :- ms/FieldValuesResult
  "C H A I N filters!

  Used to query for values that populate chained filter dropdowns and text search boxes."
  ([dashboard param-key constraint-param-key->value]
   (chain-filter dashboard param-key constraint-param-key->value nil))

  ([dashboard                   :- ms/Map
    param-key                   :- ms/NonBlankString
    constraint-param-key->value :- ms/Map
    query                       :- [:maybe ms/NonBlankString]]
   (let [dashboard   (t2/hydrate dashboard :resolved-params)
         constraints (chain-filter-constraints dashboard constraint-param-key->value)
         param       (get-in dashboard [:resolved-params param-key])
         field-ids   (into #{} (map :field-id (param->fields param)))]
     (if (empty? field-ids)
       (or (filter-values-from-field-refs dashboard param-key)
           (throw (ex-info (tru "Parameter {0} does not have any Fields associated with it" (pr-str param-key))
                           {:param       (get (:resolved-params dashboard) param-key)
                            :status-code 400})))
       (try
         (let [;; results can come back as [[value] ...] *or* as [[value remapped] ...].
               results         (map (if (seq query)
                                      #(chain-filter/chain-filter-search % constraints query :limit result-limit)
                                      #(chain-filter/chain-filter % constraints :limit result-limit))
                                    field-ids)
               has_more_values (boolean (some true? (map :has_more_values results)))]
           {:values          (or (combine-chained-fitler-results results)
                                 ;; chain filter results can't be nil
                                 [])
            :has_more_values has_more_values})
         (catch clojure.lang.ExceptionInfo e
           (if (= (:type (u/all-ex-data e)) qp.error-type/missing-required-permissions)
             (api/throw-403 e)
             (throw e))))))))

(mu/defn param-values
  "Fetch values for a parameter.

  The source of values could be:
  - static-list: user defined values list
  - card: values is result of running a card
  - nil: chain-filter"
  ([dashboard param-key constraint-param-key->value]
   (param-values dashboard param-key constraint-param-key->value nil))

  ([dashboard                   :- :map
    param-key                   :- ms/NonBlankString
    constraint-param-key->value :- :map
    query                       :- [:maybe ms/NonBlankString]]
   (let [dashboard (t2/hydrate dashboard :resolved-params)
         param     (get (:resolved-params dashboard) param-key)]
     (when-not param
       (throw (ex-info (tru "Dashboard does not have a parameter with the ID {0}" (pr-str param-key))
                       {:resolved-params (keys (:resolved-params dashboard))
                        :status-code     400})))
     (custom-values/parameter->values
       param
       query
       (fn [] (chain-filter dashboard param-key constraint-param-key->value query))))))

(api/defendpoint GET "/:id/params/:param-key/values"
  "Fetch possible values of the parameter whose ID is `:param-key`. If the values come directly from a query, optionally
  restrict these values by passing query parameters like `other-parameter=value` e.g.

    ;; fetch values for Dashboard 1 parameter 'abc' that are possible when parameter 'def' is set to 100
    GET /api/dashboard/1/params/abc/values?def=100"
  [id param-key :as {constraint-param-key->value :query-params}]
  {id ms/PositiveInt}
  (let [dashboard (api/read-check :model/Dashboard id)]
    ;; If a user can read the dashboard, then they can lookup filters. This also works with sandboxing.
    (binding [qp.perms/*param-values-query* true]
      (param-values dashboard param-key constraint-param-key->value))))

(api/defendpoint GET "/:id/params/:param-key/search/:query"
  "Fetch possible values of the parameter whose ID is `:param-key` that contain `:query`. Optionally restrict
  these values by passing query parameters like `other-parameter=value` e.g.

    ;; fetch values for Dashboard 1 parameter 'abc' that contain 'Cam' and are possible when parameter 'def' is set
    ;; to 100
     GET /api/dashboard/1/params/abc/search/Cam?def=100

  Currently limited to first 1000 results."
  [id param-key query :as {constraint-param-key->value :query-params}]
  {id    ms/PositiveInt
   query ms/NonBlankString}
  (let [dashboard (api/read-check :model/Dashboard id)]
    ;; If a user can read the dashboard, then they can lookup filters. This also works with sandboxing.
    (binding [qp.perms/*param-values-query* true]
      (param-values dashboard param-key constraint-param-key->value query))))

(api/defendpoint GET "/params/valid-filter-fields"
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
  [:as {{:keys [filtered filtering]} :params}]
  {filtered  (ms/QueryVectorOf ms/IntGreaterThanOrEqualToZero)
   filtering [:maybe (ms/QueryVectorOf ms/IntGreaterThanOrEqualToZero)]}
  (let [filtered-field-ids  (if (sequential? filtered) (set filtered) #{filtered})
        filtering-field-ids (if (sequential? filtering) (set filtering) #{filtering})]
    (doseq [field-id (set/union filtered-field-ids filtering-field-ids)]
      (api/read-check Field field-id))
    (into {} (for [field-id filtered-field-ids]
               [field-id (sort (chain-filter/filterable-field-ids field-id filtering-field-ids))]))))

(def ParameterWithID
  "Schema for a parameter map with an string `:id`."
  (mu/with-api-error-message
    [:and
     [:map
      [:id ms/NonBlankString]]
     [:map-of :keyword :any]]
    (deferred-tru "value must be a parameter map with an 'id' key")))

;;; ---------------------------------- Executing the action associated with a Dashcard -------------------------------

(api/defendpoint GET "/:dashboard-id/dashcard/:dashcard-id/execute"
  "Fetches the values for filling in execution parameters. Pass PK parameters and values to select."
  [dashboard-id dashcard-id parameters]
  {dashboard-id ms/PositiveInt
   dashcard-id  ms/PositiveInt
   parameters   ms/JSONString}
  (api/read-check :model/Dashboard dashboard-id)
  (actions/fetch-values
   (api/check-404 (action/dashcard->action dashcard-id))
   (json/parse-string parameters)))

(api/defendpoint POST "/:dashboard-id/dashcard/:dashcard-id/execute"
  "Execute the associated Action in the context of a `Dashboard` and `DashboardCard` that includes it.

   `parameters` should be the mapped dashboard parameters with values.
   `extra_parameters` should be the extra, user entered parameter values."
  [dashboard-id dashcard-id :as {{:keys [parameters], :as _body} :body}]
  {dashboard-id ms/PositiveInt
   dashcard-id  ms/PositiveInt
   parameters  [:maybe [:map-of :string :any]]}
  (api/read-check :model/Dashboard dashboard-id)
  ;; Undo middleware string->keyword coercion
  (actions/execute-dashcard! dashboard-id dashcard-id parameters))

;;; ---------------------------------- Running the query associated with a Dashcard ----------------------------------

(api/defendpoint POST "/:dashboard-id/dashcard/:dashcard-id/card/:card-id/query"
  "Run the query associated with a Saved Question (`Card`) in the context of a `Dashboard` that includes it."
  [dashboard-id dashcard-id card-id :as {{:keys [dashboard_load_id parameters], :as body} :body}]
  {dashboard-id      ms/PositiveInt
   dashcard-id       ms/PositiveInt
   card-id           ms/PositiveInt
   dashboard_load_id [:maybe ms/NonBlankString]
   parameters        [:maybe [:sequential ParameterWithID]]}
  (with-dashboard-load-id dashboard_load_id
    (u/prog1 (m/mapply qp.dashboard/process-query-for-dashcard
                       (merge
                         body
                         {:dashboard-id dashboard-id
                          :card-id      card-id
                          :dashcard-id  dashcard-id}))
             (events/publish-event! :event/card-read {:object-id card-id, :user-id api/*current-user-id*, :context :dashboard}))))

(api/defendpoint POST "/:dashboard-id/dashcard/:dashcard-id/card/:card-id/query/:export-format"
  "Run the query associated with a Saved Question (`Card`) in the context of a `Dashboard` that includes it, and return
  its results as a file in the specified format.

  `parameters` should be passed as query parameter encoded as a serialized JSON string (this is because this endpoint
  is normally used to power 'Download Results' buttons that use HTML `form` actions)."
  [dashboard-id dashcard-id card-id export-format :as {{:keys [parameters format_rows], :as request-parameters} :params}]
  {dashboard-id  ms/PositiveInt
   dashcard-id   ms/PositiveInt
   card-id       ms/PositiveInt
   parameters    [:maybe ms/JSONString]
   export-format api.dataset/ExportFormat
   format_rows   [:maybe :boolean]}
  (m/mapply qp.dashboard/process-query-for-dashcard
            (merge
             request-parameters
             {:dashboard-id  dashboard-id
              :card-id       card-id
              :dashcard-id   dashcard-id
              :export-format export-format
              :parameters    (json/parse-string parameters keyword)
              :context       (api.dataset/export-format->context export-format)
              :constraints   nil
              ;; TODO -- passing this `:middleware` map is a little repetitive, need to think of a way to not have to
              ;; specify this all over the codebase any time we want to do a query with an export format. Maybe this
              ;; should be the default if `export-format` isn't `:api`?
              :middleware    {:process-viz-settings?  true
                              :skip-results-metadata? true
                              :ignore-cached-results? true
                              :format-rows?           format_rows
                              :js-int-to-string?      false}})))

(api/defendpoint POST "/pivot/:dashboard-id/dashcard/:dashcard-id/card/:card-id/query"
  "Run a pivot table query for a specific DashCard."
  [dashboard-id dashcard-id card-id :as {{:keys [parameters], :as body} :body}]
  {dashboard-id ms/PositiveInt
   dashcard-id  ms/PositiveInt
   card-id      ms/PositiveInt
   parameters   [:maybe [:sequential ParameterWithID]]}
  (u/prog1 (m/mapply qp.dashboard/process-query-for-dashcard
                     (merge
                      body
                      {:dashboard-id dashboard-id
                       :card-id      card-id
                       :dashcard-id  dashcard-id
                       :qp           qp.pivot/run-pivot-query}))
    (events/publish-event! :event/card-read {:object-id card-id, :user-id api/*current-user-id*, :context :dashboard})))

(api/define-routes)

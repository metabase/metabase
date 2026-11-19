(ns metabase.dashboards-rest.api
  "/api/dashboard endpoints."
  (:require
   [clojure.core.cache :as cache]
   [clojure.core.memoize :as memoize]
   [clojure.set :as set]
   [malli.util :as mut]
   [medley.core :as m]
   [metabase.actions.core :as actions]
   [metabase.actions.schema :as actions.schema]
   [metabase.analytics.core :as analytics]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.channel.render.core :as channel.render]
   [metabase.collection-items.core :as collection-items]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.dashboards-rest.db :as dashboards-rest.db]
   [metabase.dashboards.models.dashboard :as dashboard]
   [metabase.dashboards.settings :as dashboards.settings]
   [metabase.dashboards.write :as dashboards.write]
   [metabase.eid-translation.core :as eid-translation]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.lib.schema.visualization :as lib.schema.visualization]
   [metabase.models.interface :as mi]
   [metabase.parameters.chain-filter :as chain-filter]
   [metabase.parameters.dashboard :as parameters.dashboard]
   [metabase.parameters.params :as params]
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
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.query-processor.util :as qp.util]
   [metabase.request.core :as request]
   [metabase.revisions.core :as revisions]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.xrays.core :as xrays]
   [ring.util.codec :as codec]
   [steffan-westcott.clj-otel.api.trace.span :as span]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- dashboards-list [filter-option]
  (as-> (dashboards-rest.db/dashboards (= (keyword filter-option) :archived)
                                       (when (= (keyword filter-option) :mine)
                                         api/*current-user-id*)) <>
    (t2/hydrate <> :creator)
    (mi/readable <>)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "This endpoint is currently unused by the Metabase frontend and may be out of date with the rest of the application.
  It only exists for backwards compatibility and may be removed in the future.

  Get `Dashboards`. With filter option `f` (default `all`), restrict results as follows:
  *  `all`      - Return all Dashboards.
  *  `mine`     - Return Dashboards created by the current user.
  *  `archived` - Return Dashboards that have been archived. (By default, these are *excluded*.)"
  {:deprecated true}
  [_route-params
   {:keys [f]} :- [:map {:closed true}
                   [:f {:optional true} [:maybe [:enum "all" "mine" "archived"]]]]]
  (let [dashboards (dashboards-list f)
        edit-infos (:dashboard (revisions/fetch-last-edited-info {:dashboard-ids (map :id dashboards)}))]
    (into []
          (map (fn [{:keys [id] :as dashboard}]
                 (if-let [edit-info (get edit-infos id)]
                   (assoc dashboard :last-edit-info edit-info)
                   dashboard)))
          dashboards)))

(defn- remove-unreadable-actions
  [dashboard]
  (m/update-existing dashboard :dashcards
                     (fn [dashcards]
                       (let [readable (into #{} (map :id) (mi/readable (keep :action dashcards)))]
                         (mapv (fn [dashcard]
                                 (cond-> dashcard
                                   (and (:action dashcard) (not (contains? readable (:id (:action dashcard)))))
                                   (dissoc :action)))
                               dashcards)))))

(defn- hydrate-dashboard-details
  "Get dashboard details for the complete dashboard, including tabs, dashcards, params, etc."
  [{dashboard-id :id :as dashboard}]
  ;; I'm a bit worried that this is an n+1 situation here. The cards can be batch hydrated i think because they
  ;; have a hydration key and an id. moderation_reviews currently aren't batch hydrated but i'm worried they
  ;; cannot be in this situation
  (span/with-span!
    {:name       "hydrate-dashboard-details"
     :attributes {:dashboard/id dashboard-id}}
    (binding [params/*field-id-context* (atom params/empty-field-id-context)]
      (cond->>  [[:dashcards
                  [:card :can_read :can_write [:moderation_reviews :moderator_details]]
                  [:series :can_read :can_write]
                  :dashcard/action
                  :dashcard/linkcard-info]
                 :creator
                 :can_restore
                 :can_delete
                 :tabs
                 :collection_authority_level
                 :can_write
                 :can_set_cache_policy
                 :param_fields
                 :is_remote_synced
                 [:moderation_reviews :moderator_details]
                 [:collection :is_personal :effective_location]]
        (dashboards.settings/dashboards-save-last-used-parameters) (cons :last_used_param_values)
        true (apply t2/hydrate dashboard)
        true remove-unreadable-actions))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Create a new Dashboard."
  [_route-params
   _query-params
   dashboard
   :- [:map {:closed true}
       [:name                :metabase.dashboards.schema/dashboard.name]
       [:parameters          {:optional true} [:maybe ::parameters.schema/parameters]]
       [:description         {:optional true} [:maybe :string]]
       [:cache_ttl           {:optional true} [:maybe ms/PositiveInt]]
       [:collection_id       {:optional true} [:maybe ms/PositiveInt]]
       [:collection_position {:optional true} [:maybe ms/PositiveInt]]]]
  (-> (dashboards.write/create-dashboard! dashboard)
      hydrate-dashboard-details
      collection.root/hydrate-root-collection
      (assoc :last-edit-info (revisions/edit-information-for-user @api/*current-user*))))

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
  [{query :dataset_query, :as _card}]
  (when query
    (try
      [(qp.util/query-hash query)
       (qp.util/query-hash (assoc query :constraints (qp.constraints/default-query-constraints)))]
      (catch Throwable e
        (log/errorf "Error hashing query: %s" (ex-message e))
        nil))))

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
    (into {} (for [[k v] (dashboards-rest.db/query-average-execution-times hashes)]
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
  ;; Doall is needed to fetch the average durations in this thread, in the context of *dashboard-load-key*.
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

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:private ^:dynamic *dashboard-load-key*
  "`[current-user-id dashboard-load-id]` for the dashboard load in progress, or nil when nothing should be cached."
  nil)

(defn- dashboard-load-key
  "Cache key for a dashboard load: the client-supplied `dashboard-load-id` scoped to the current user.

  Returns nil, disabling caching, when there is no load ID or no current user."
  [dashboard-load-id]
  (when (and dashboard-load-id api/*current-user-id*)
    [api/*current-user-id* dashboard-load-id]))

;; This is a kind of two-layer memoization:
;; - The outer layer is a 10-second TTL cache on *dashboard-load-key*.
;; - Its value is the *function* to use to get the dashboard by ID!
;; If *dashboard-load-key* is set, the outer layer returns a forever-memoized wrapper around get-dashboard*.
;; If *dashboard-load-key* is nil, it returns the unwrapped get-dashboard*.

(defn- set-download-perms-on-dashcards
  "Set each dashcard's nested :card map :download_perms based on the current user's actual permissions."
  [dashboard]
  (update dashboard :dashcards
          (fn [dashcards]
            (vec (for [dashcard dashcards]
                   (update dashcard :card
                           (fn [card]
                             (when card
                               (let [dataset-query (or (:dataset_query card)
                                                       (dashboards-rest.db/card-query (:id card)))
                                     download-level (when (seq dataset-query)
                                                      (perms/download-perms-level dataset-query api/*current-user-id*))]
                                 (assoc card :download_perms (case download-level
                                                               :no :none
                                                               :ten-thousand-rows :limited
                                                               :one-million-rows :full
                                                               :full :full
                                                               :none)))))))))))

(defn- apply-card-permission-filters
  "Apply collection-permission-aware filtering to dashboard cards. Hides details of
   cards the current user cannot read and sets download permission levels."
  [dashboard]
  (-> dashboard
      hide-unreadable-cards
      add-query-average-durations
      set-download-perms-on-dashcards))

;; TODO: This indirect memoization by *dashboard-load-key* could probably be turned into a macro for reuse elsewhere.
(defn- get-dashboard*
  "Get Dashboard with ID."
  [id]
  (span/with-span!
    {:name       "get-dashboard"
     :attributes {:dashboard/id id}}
    (-> (dashboards-rest.db/dashboard id)
        api/read-check
        hydrate-dashboard-details
        collection.root/hydrate-root-collection
        apply-card-permission-filters
        (api/present-in-trash-if-archived-directly (collection/trash-collection-id)))))

(def ^:private get-dashboard-fn
  (memoize/ttl (fn [dashboard-load-key]
                 (if dashboard-load-key
                   (memoize/memo get-dashboard*) ; If dashboard-load-key is set, return a memoized get-dashboard*.
                   get-dashboard*))          ; If unset, just call through to get-dashboard*.
               :ttl/threshold dashboard-load-cache-ttl))

(def ^:private dashboard-load-metadata-provider-cache
  (memoize/ttl (fn [_dashboard-load-key]
                 (atom (cache/basic-cache-factory {})))
               :ttl/threshold dashboard-load-cache-ttl))

(defn- do-with-dashboard-load-id [dashboard-load-id body-fn]
  (if-let [load-key (dashboard-load-key dashboard-load-id)]
    (binding [*dashboard-load-key* load-key]
      (lib-be/with-existing-metadata-provider-cache (dashboard-load-metadata-provider-cache load-key)
        (log/debugf "Using dashboard_load_id %s" dashboard-load-id)
        (body-fn)))
    (do
      (log/debug "No dashboard_load_id provided")
      (body-fn))))

(defmacro ^:private with-dashboard-load-id [dashboard-load-id & body]
  `(do-with-dashboard-load-id ~dashboard-load-id (^:once fn* [] ~@body)))

(defn- get-dashboard
  "Get Dashboard with ID.

  Memoized per `*dashboard-load-key*` with a TTL of 10 seconds."
  [id]
  ((get-dashboard-fn *dashboard-load-key*) id))

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
   dashcards :- [:sequential :metabase.dashboards.schema/dashboard-card]]
  (let [card->cards (fn [{:keys [card series]}] (into [card] series))
        readable-ids (into #{} (map :id) (mi/readable (into [] (comp (mapcat card->cards) (filter mi/model)) dashcards)))
        readable? (fn [card] (and (mi/model card) (contains? readable-ids (:id card))))
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
                            [id (queries/with-copy-source-card to-copy
                                  (api/create-check :model/Card (assoc to-copy :collection_id dest-coll-id))
                                  (queries/create-card!
                                   (cond-> to-copy
                                     true                    (assoc :collection_id dest-coll-id)
                                     same-collection?        (update :name #(str % " - " (tru "Duplicate")))
                                     (:dashboard_id to-copy) (assoc :dashboard_id (u/the-id new-dashboard)))
                                   @api/*current-user*
                                   false))]))
     :discarded  discard
     :referenced reference}))

(defn- duplicate-tabs
  [new-dashboard existing-tabs]
  (let [new-tab-ids (dashboards-rest.db/insert-dashboard-tabs!
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

              (some-> dashboard-card :visualization_settings :virtual_card :display #{"iframe"})
              dashboard-card

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

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/:from-dashboard-id/copy"
  "Copy a Dashboard."
  [{:keys [from-dashboard-id]} :- [:map {:closed true}
                                   [:from-dashboard-id ms/PositiveInt]]
   _query-params
   {:keys [name description collection_id collection_position
           is_deep_copy], :as _dashboard} :- [:map {:closed true}
                                              [:name                {:optional true} [:maybe :metabase.dashboards.schema/dashboard.name]]
                                              [:description         {:optional true} [:maybe :string]]
                                              [:collection_id       {:optional true} [:maybe ms/PositiveInt]]
                                              [:collection_position {:optional true} [:maybe ms/PositiveInt]]
                                              [:is_deep_copy        {:default false} [:maybe :boolean]]]]
  ;; if we're trying to save the new dashboard in a Collection make sure we have permissions to do that
  (api/create-check :model/Dashboard {:name name, :description description, :collection_id collection_id
                                      :collection_position collection_position})
  (api/check-400 (not (and (= is_deep_copy false)
                           (dashboards-rest.db/unarchived-dashboard-question-exists? from-dashboard-id)))
                 (deferred-tru "You cannot do a shallow copy of this dashboard because it contains Dashboard Questions."))
  (let [existing-dashboard (get-dashboard from-dashboard-id)
        dashboard-data {:name                (or name (:name existing-dashboard))
                        :description         (or description (:description existing-dashboard))
                        :parameters          (or (:parameters existing-dashboard) [])
                        :creator_id          api/*current-user-id*
                        :collection_id       collection_id
                        :collection_position collection_position
                        :width               (:width existing-dashboard)}
        dashboard      (t2/with-transaction [_conn]
                         (events/with-batched-events
                           ;; Adding a new dashboard at `collection_position` could cause other dashboards in this
                           ;; collection to change position, check that and fix up if needed
                           (api/maybe-reconcile-collection-position! (select-keys dashboard-data [:collection_id :collection_position]))
                           ;; Ok, now save the Dashboard
                           (let [dash (dashboards-rest.db/insert-dashboard! dashboard-data)
                                 {id->new-card :copied
                                  id->referenced-card :referenced
                                  uncopied :discarded}
                                 (maybe-duplicate-cards is_deep_copy dash existing-dashboard collection_id)

                                 id->new-tab-id (when-let [existing-tabs (seq (:tabs existing-dashboard))]
                                                  (duplicate-tabs dash existing-tabs))]
                             (when-let [dashcards (seq (update-cards-for-copy (:dashcards existing-dashboard)
                                                                              id->new-card
                                                                              id->referenced-card
                                                                              id->new-tab-id))]
                               (api/check-500 (dashboard/add-dashcards! dash dashcards)))
                             (cond-> dash
                               (seq uncopied)
                               (assoc :uncopied uncopied)))))]
    (analytics/track-event! :snowplow/dashboard
                            {:event        :dashboard-created
                             :dashboard-id (u/the-id dashboard)})
    dashboard))

;;; --------------------------------------------- List public and embeddable dashboards ------------------------------

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/public"
  "Fetch a list of Dashboards with public UUIDs. These dashboards are publicly-accessible *if* public sharing is
  enabled."
  []
  (perms/check-has-application-permission :setting)
  (public-sharing.validation/check-public-sharing-enabled)
  (dashboards-rest.db/public-dashboards))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/embeddable"
  "Fetch a list of Dashboards where `enable_embedding` is `true`. The dashboards can be embedded using the embedding
  endpoints and a signed JWT."
  []
  (perms/check-has-application-permission :setting)
  ;; Not gated on `enable-embedding-modular`: an admin who turned guest embeds off still needs to see what is already
  ;; published. Publishing itself stays gated.
  (dashboards-rest.db/embeddable-dashboards))

;;; --------------------------------------------- Fetching/Updating/Etc. ---------------------------------------------

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id"
  "Get Dashboard with ID."
  [{:keys [id]} :- [:map {:closed true}
                    [:id [:or ms/PositiveInt ms/NanoIdString]]]
   {dashboard-load-id :dashboard_load_id} :- [:map {:closed true}
                                              [:dashboard_load_id {:optional true} [:maybe ms/NonBlankString]]]
   _body]
  (with-dashboard-load-id dashboard-load-id
    (let [resolved-id (eid-translation/->id-or-404 :dashboard id)
          dashboard (get-dashboard resolved-id)]
      (u/prog1 (first (revisions/with-last-edit-info [dashboard] :dashboard))
        (events/publish-event! :event/dashboard-read {:object-id (:id dashboard) :user-id api/*current-user-id*})))))

(api.macros/defendpoint :post "/:id/pdf" :- :any
  "Render Dashboard with ID to a PDF (server-side, the same way dashboard subscriptions render charts) and stream it
  back as a file download.

  `parameters` are runtime parameter overrides -- the same shape the dashcard query endpoints accept: a sequence of
  `{:id ... :value ...}` maps, or a JSON-encoded string of that sequence (the string form lets an HTML `<form>`
  action drive the download). Parameters left unspecified fall back to the dashboard's own defaults.

  `paper_size` is `\"a4\"` (default) or `\"letter\"`."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]
   _query-params
   {:keys [parameters paper_size]} :- [:map {:closed true}
                                       [:parameters {:optional true} [:maybe ::parameters.schema/api.parameter-values]]
                                       [:paper_size {:default "a4"} [:maybe [:enum "a4" "letter"]]]]
   _request
   respond
   raise]
  (try
    (let [dashboard (api/read-check :model/Dashboard id)
          pdf-bytes (channel.render/render-dashboard-to-pdf id api/*current-user-id*
                                                            (or parameters [])
                                                            (keyword (or paper_size "a4")))
          filename  (str (or (not-empty (u/slugify (:name dashboard)))
                             (str "dashboard-" id))
                         ".pdf")]
      (respond {:status  200
                :headers {"Content-Type"        "application/pdf"
                          "Content-Disposition" (format "attachment; filename=\"%s\"" filename)}
                :body    (java.io.ByteArrayInputStream. pdf-bytes)}))
    (catch Throwable e
      (raise e))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id/items"
  "Get Dashboard with ID."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  ;; Output should match the shape of api/collection/<:id|root>/items. There's a test that asserts that this remains
  ;; the case, but if you change one, you'll want to change both.
  (let [dashboard  (api/read-check :model/Dashboard id)
        cards      (dashboards-rest.db/dashboard-item-cards id (request/paged?) (request/limit) (request/offset))]
    {:total  (count cards)
     :data   (collection-items/post-process-rows {}
                                                 (dashboards-rest.db/collection (:collection_id dashboard))
                                                 cards)
     :limit  (request/limit)
     :offset (request/offset)
     :models (if (seq cards) ["card"] [])}))

(api.macros/defendpoint :delete "/:id" :- ::api/generic-204-no-content
  "Hard delete a Dashboard. To soft delete, use `PUT /api/dashboard/:id`

  This will remove also any questions/models/segments/metrics that use this database."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (api/write-check :model/Dashboard id)
  (dashboards-rest.db/delete-dashboard! id)
  api/generic-204-no-content)

(def ^:private UpdatedDashboardCard
  "Schema for one dashcard in a dashboard update request: [[dashboards.write/UpdatedDashboardCard]], closed."
  (mut/closed-schema dashboards.write/UpdatedDashboardCard))

(def ^:private UpdatedDashboardTab
  "Schema for one tab in a dashboard update request: [[dashboards.write/UpdatedDashboardTab]], closed."
  (mut/closed-schema dashboards.write/UpdatedDashboardTab))

(def ^:private DashUpdates
  "Schema for Dashboard Updates: [[dashboards.write/DashUpdates]], closed."
  (mut/closed-schema dashboards.write/DashUpdates))

(defn- update-dashboard!
  "Updates a Dashboard and returns it hydrated. Designed to be reused by PUT /api/dashboard/:id and PUT /api/dashboard/:id/cards"
  [id dash-updates]
  (-> (dashboards.write/update-dashboard! id dash-updates)
      hydrate-dashboard-details
      collection.root/hydrate-root-collection
      apply-card-permission-filters
      (assoc :last-edit-info (revisions/edit-information-for-user @api/*current-user*))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:id"
  "Update a Dashboard, and optionally the `dashcards` and `tabs` of a Dashboard. The request body should be a JSON object with the same
  structure as the response from `GET /api/dashboard/:id`."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]
   _query-params
   dash-updates :- DashUpdates]
  (update-dashboard! id dash-updates))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
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
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]
   _query-params
   {:keys [cards tabs]} :- [:map {:closed true}
                            [:cards (ms/maps-with-unique-key [:sequential UpdatedDashboardCard] :id)]
                            [:tabs  {:optional true} [:maybe (ms/maps-with-unique-key [:sequential UpdatedDashboardTab] :id)]]]]
  (log/warn
   "DELETE /api/dashboard/:id/cards is deprecated. Use PUT /api/dashboard/:id instead.")
  (let [dashboard (update-dashboard! id {:dashcards cards :tabs tabs})]
    {:cards (:dashcards dashboard)
     :tabs  (:tabs dashboard)}))

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id/query_metadata"
  "Get all of the required query metadata for the cards on dashboard."
  [{:keys [id]} :- [:map {:closed true}
                    [:id [:or ms/PositiveInt ms/NanoIdString]]]
   {dashboard-load-id :dashboard_load_id} :- [:map {:closed true}
                                              [:dashboard_load_id {:optional true} [:maybe ms/NonBlankString]]]
   _body]
  (with-dashboard-load-id dashboard-load-id
    (let [resolved-id (eid-translation/->id-or-404 :dashboard id)
          dashboard (get-dashboard resolved-id)]
      (queries/batch-fetch-dashboard-metadata [dashboard]))))

;;; ----------------------------------------------- Sharing is Caring ------------------------------------------------

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/:dashboard-id/public_link"
  "Generate publicly-accessible links for this Dashboard. Returns UUID to be used in public links. (If this
  Dashboard has already been shared, it will return the existing public link rather than creating a new one.) Public
  sharing must be enabled."
  [{:keys [dashboard-id]} :- [:map {:closed true}
                              [:dashboard-id ms/PositiveInt]]]
  (let [dashboard (api/check-404 (dashboards-rest.db/dashboard dashboard-id))
        new-uuid  (str (random-uuid))]
    (api/update-check dashboard {:public_uuid new-uuid, :made_public_by_id api/*current-user-id*})
    (public-sharing.validation/check-public-sharing-enabled)
    (api/check-not-archived dashboard)
    (let [existing-public-uuid (dashboards-rest.db/dashboard-public-uuid dashboard-id)
          uuid (or existing-public-uuid
                   (u/prog1 new-uuid
                     (t2/with-transaction [_conn]
                       (dashboards-rest.db/update-dashboard! dashboard-id
                                                             {:public_uuid       <>
                                                              :made_public_by_id api/*current-user-id*}))))]
      {:uuid uuid})))

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case]}
(api.macros/defendpoint :delete "/:dashboard-id/public_link" :- ::api/generic-204-no-content
  "Delete the publicly-accessible link to this Dashboard."
  [{:keys [dashboard-id]} :- [:map {:closed true}
                              [:dashboard-id ms/PositiveInt]]]
  (let [dashboard (api/check-404 (dashboards-rest.db/dashboard dashboard-id))]
    (api/update-check dashboard {:public_uuid nil, :made_public_by_id nil}))
  (public-sharing.validation/check-public-sharing-enabled)
  (api/check-exists? :model/Dashboard :id dashboard-id, :public_uuid [:not= nil], :archived false)
  (t2/with-transaction [_conn]
    (dashboards-rest.db/update-dashboard! dashboard-id
                                          {:public_uuid       nil
                                           :made_public_by_id nil}))
  {:status 204, :body nil})

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id/related"
  "Return related entities."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (-> (dashboards-rest.db/dashboard id) api/read-check xrays/related))

;;; ---------------------------------------------- Transient dashboards ----------------------------------------------

(def ^:private TransientCard
  [:map {:closed true}
   [:id                     {:optional true} [:maybe [:or ms/PositiveInt ms/NonBlankString]]]
   [:name                   {:optional true} [:maybe ms/NonBlankString]]
   [:description            {:optional true} [:maybe :string]]
   [:display                {:optional true} [:maybe ms/NonBlankString]]
   [:dataset_query          {:optional true} [:maybe ::lib-be.schema/maybe-legacy-or-empty-query]]
   [:visualization_settings {:optional true} [:maybe ::lib.schema.visualization/visualization-settings]]])

(def ^:private TransientDashboardCard
  [:map {:closed true}
   [:card                   {:optional true} [:maybe TransientCard]]
   [:series                 {:optional true} [:maybe [:sequential TransientCard]]]
   [:row                    {:optional true} [:maybe :metabase.dashboards.schema/dashboard-card.position]]
   [:col                    {:optional true} [:maybe :metabase.dashboards.schema/dashboard-card.position]]
   [:size_x                 {:optional true} [:maybe :metabase.dashboards.schema/dashboard-card.size]]
   [:size_y                 {:optional true} [:maybe :metabase.dashboards.schema/dashboard-card.size]]
   [:dashboard_tab_id       {:optional true} [:maybe ms/Int]]
   [:parameter_mappings     {:optional true} [:maybe [:ref ::parameters.schema/parameter-mappings]]]
   [:visualization_settings {:optional true} [:maybe ::lib.schema.visualization/visualization-settings]]])

(def ^:private TransientDashboard
  [:map {:closed true}
   [:name               {:optional true} [:maybe :metabase.dashboards.schema/dashboard.name]]
   [:description        {:optional true} [:maybe :string]]
   [:parameters         {:optional true} [:maybe [:ref ::parameters.schema/parameters]]]
   [:auto_apply_filters {:optional true} [:maybe :boolean]]
   [:width              {:optional true} [:maybe :metabase.dashboards.schema/dashboard.width]]
   [:dashcards          {:optional true} [:maybe [:sequential TransientDashboardCard]]]
   [:tabs               {:optional true} [:maybe [:sequential UpdatedDashboardTab]]]])

(defn- check-create-transient-dashboard-cards
  "Checks the current user can create the new Cards of `dashboard` in the Collection `parent-collection-id`."
  [dashboard parent-collection-id]
  (doseq [{:keys [card series]} (:dashcards dashboard)
          new-card              (cons card series)
          :when                 (and (map? new-card) (not (pos-int? (:id new-card))) (seq (:dataset_query new-card)))]
    (api/create-check :model/Card (assoc new-card :collection_id parent-collection-id))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/save/collection/:parent-collection-id"
  "Save a denormalized description of dashboard into collection with ID `:parent-collection-id`."
  [{:keys [parent-collection-id]} :- [:map {:closed true}
                                      [:parent-collection-id ms/PositiveInt]]
   _query-params
   dashboard :- TransientDashboard]
  (api/create-check :model/Dashboard (assoc dashboard :collection_id parent-collection-id))
  (check-create-transient-dashboard-cards dashboard parent-collection-id)
  (dashboard/save-transient-dashboard! dashboard parent-collection-id))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/save"
  "Save a denormalized description of dashboard."
  [_route-params
   _query-params
   dashboard :- TransientDashboard]
  (let [parent-collection-id (:id (xrays/get-or-create-container-collection
                                   (if api/*is-superuser?*
                                     "/"
                                     (collection/children-location
                                      (dashboards-rest.db/personal-collection-for-user api/*current-user-id*)))))
        _         (check-create-transient-dashboard-cards dashboard parent-collection-id)
        dashboard (dashboard/save-transient-dashboard! dashboard parent-collection-id)]
    dashboard))

;;; ------------------------------------- Chain-filtering param value endpoints --------------------------------------

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id/params/:param-key/values"
  "Fetch possible values of the parameter whose ID is `:param-key`. If the values come directly from a query, optionally
  restrict these values by passing query parameters like `other-parameter=value` e.g.

    ;; fetch values for Dashboard 1 parameter 'abc' that are possible when parameter 'def' is set to 100
    GET /api/dashboard/1/params/abc/values?def=100"
  [{:keys [id param-key]}      :- [:map {:closed true}
                                   [:id ms/PositiveInt]
                                   [:param-key ms/NonBlankString]]
   constraint-param-key->value :- (ms/string-keyed-map [:ref ::lib.schema.parameter/parameter.value])
   _body]
  (let [dashboard (api/read-check :model/Dashboard id)]
    ;; If a user can read the dashboard, then they can lookup filters. This also works with sandboxing.
    (binding [qp.perms/*param-values-query* true]
      (parameters.dashboard/param-values dashboard param-key constraint-param-key->value))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id/params/:param-key/search/:query"
  "Fetch possible values of the parameter whose ID is `:param-key` that contain `:query`. Optionally restrict
  these values by passing query parameters like `other-parameter=value` e.g.

    ;; fetch values for Dashboard 1 parameter 'abc' that contain 'Cam' and are possible when parameter 'def' is set
    ;; to 100
     GET /api/dashboard/1/params/abc/search/Cam?def=100

  Currently limited to first 1000 results."
  [{:keys [id param-key query]} :- [:map {:closed true}
                                    [:id    ms/PositiveInt]
                                    [:param-key ms/NonBlankString]
                                    [:query ms/NonBlankString]]
   constraint-param-key->value  :- (ms/string-keyed-map [:ref ::lib.schema.parameter/parameter.value])
   _body]
  (let [dashboard (api/read-check :model/Dashboard id)]
    ;; If a user can read the dashboard, then they can lookup filters. This also works with sandboxing.
    (binding [qp.perms/*param-values-query* true
              chain-filter/*allow-implicit-uuid-field-remapping* false]
      (parameters.dashboard/param-values dashboard param-key constraint-param-key->value query))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id/params/:param-key/remapping"
  "Fetch the remapped value for a given value of the parameter with ID `:param-key`.

    ;; fetch the remapped value for Dashboard 1 parameter 'abc' for value 100
    GET /api/dashboard/1/params/abc/remapping?value=100"
  [{:keys [id param-key]} :- [:map {:closed true}
                              [:id ms/PositiveInt]
                              [:param-key ms/NonBlankString]]
   {:keys [value]}        :- [:map {:closed true} [:value :string]]
   _body]
  (let [dashboard (api/read-check :model/Dashboard id)]
    (binding [qp.perms/*param-values-query* true]
      (parameters.dashboard/dashboard-param-remapped-value dashboard param-key (codec/url-decode value)))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
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
   {:keys [filtered filtering]} :- [:map {:closed true}
                                    [:filtered  (ms/QueryVectorOf ::lib.schema.id/field)]
                                    [:filtering {:optional true} [:maybe (ms/QueryVectorOf ::lib.schema.id/field)]]]
   _body]
  (let [filtered-field-ids  (if (sequential? filtered) (set filtered) #{filtered})
        filtering-field-ids (if (sequential? filtering) (set filtering) #{filtering})]
    (dashboards.write/read-check-all (dashboards-rest.db/fields-by-ids (into [] (remove nil?) (set/union filtered-field-ids filtering-field-ids)))
                                     (set/union filtered-field-ids filtering-field-ids))
    (into {} (for [field-id filtered-field-ids]
               [field-id (sort (chain-filter/filterable-field-ids field-id filtering-field-ids))]))))

;;; ---------------------------------- Executing the action associated with a Dashcard -------------------------------

(api.macros/defendpoint :post "/:dashboard-id/dashcard/:dashcard-id/execute/values" :- [:map-of :string :any]
  "Fetches the values for filling in execution parameters. Pass PK parameters and values to select.

  Parameters are sent in the request body rather than the query string so their values stay out of URLs and logs."
  [{:keys [dashboard-id dashcard-id]} :- [:map {:closed true}
                                          [:dashboard-id ms/PositiveInt]
                                          [:dashcard-id  ms/PositiveInt]]
   _query-params
   {:keys [parameters]} :- [:map {:closed true}
                            [:parameters {:optional true} ::actions.schema/prefetch-parameter-values]]]
  (api/read-check :model/Dashboard dashboard-id)
  (let [dashcard (api/check-404 (dashboards-rest.db/dashcard-in-dashboard dashcard-id dashboard-id))]
    (actions/fetch-values
     (api/check-404 (actions/dashcard->action dashcard))
     parameters)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/:dashboard-id/dashcard/:dashcard-id/execute"
  "Execute the associated Action in the context of a `Dashboard` and `DashboardCard` that includes it.

   `parameters` should be the mapped dashboard parameters with values.
   `extra_parameters` should be the extra, user entered parameter values."
  [{:keys [dashboard-id dashcard-id]} :- [:map {:closed true}
                                          [:dashboard-id ms/PositiveInt]
                                          [:dashcard-id  ms/PositiveInt]]
   _query-params
   {:keys [parameters]} :- [:map {:closed true}
                            [:parameters {:optional true}
                             [:maybe ::actions.schema/execute-parameter-values.string-keys]]]]
  (api/read-check :model/Dashboard dashboard-id)
  (actions/execute-dashcard! dashboard-id dashcard-id parameters))

;;; ---------------------------------- Running the query associated with a Dashcard ----------------------------------

(api.macros/defendpoint :post "/:dashboard-id/dashcard/:dashcard-id/card/:card-id/query"
  :- ::qp.streaming/query-result-response
  "Run the query associated with a Saved Question (`Card`) in the context of a `Dashboard` that includes it."
  [{:keys [dashboard-id dashcard-id card-id]} :- [:map {:closed true}
                                                  [:dashboard-id ms/PositiveInt]
                                                  [:dashcard-id  ms/PositiveInt]
                                                  [:card-id      ms/PositiveInt]]
   _query-params
   {:keys [dashboard_load_id], :as body} :- [:map {:closed true}
                                             [:dashboard_load_id {:optional true} [:maybe ms/NonBlankString]]
                                             [:parameters        {:optional true} [:maybe [:sequential ::parameters.schema/parameter-with-value]]]]]
  (with-dashboard-load-id dashboard_load_id
    (m/mapply qp.dashboard/process-query-for-dashcard
              (merge
               (dissoc body :dashboard_load_id)
               {:dashboard (api/check-404 (dashboards-rest.db/dashboard dashboard-id))
                :card      (api/check-404 (dashboards-rest.db/card card-id))
                :dashcard  (api/check-404 (dashboards-rest.db/dashcard dashcard-id))}))))

(api.macros/defendpoint :post "/:dashboard-id/dashcard/:dashcard-id/card/:card-id/query/:export-format"
  :- ::qp.streaming/export-response
  "Run the query associated with a Saved Question (`Card`) in the context of a `Dashboard` that includes it, and return
  its results as a file in the specified format.

  `parameters` should be passed as query parameter encoded as a serialized JSON string (this is because this endpoint
  is normally used to power 'Download Results' buttons that use HTML `form` actions)."
  [{:keys [dashboard-id dashcard-id card-id export-format]} :- [:map {:closed true}
                                                                [:dashboard-id  ms/PositiveInt]
                                                                [:dashcard-id   ms/PositiveInt]
                                                                [:card-id       ms/PositiveInt]
                                                                [:export-format ::qp.schema/export-format]]
   _query-params
   {:keys          [parameters]
    format-rows?   :format_rows
    pivot-results? :pivot_results}
   :- [:map {:closed true}
       [:parameters    {:optional true} [:maybe ::parameters.schema/api.parameter-values]]
       [:format_rows   {:default false} ms/BooleanValue]
       [:pivot_results {:default false} ms/BooleanValue]]]
  (m/mapply qp.dashboard/process-query-for-dashcard
            {:dashboard     (api/check-404 (dashboards-rest.db/dashboard dashboard-id))
             :card          (api/check-404 (dashboards-rest.db/card card-id))
             :dashcard      (api/check-404 (dashboards-rest.db/dashcard dashcard-id))
             :export-format export-format
             :parameters    parameters
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
  :- ::qp.streaming/query-result-response
  "Run a pivot table query for a specific DashCard."
  [{:keys [dashboard-id dashcard-id card-id]} :- [:map {:closed true}
                                                  [:dashboard-id ms/PositiveInt]
                                                  [:dashcard-id  ms/PositiveInt]
                                                  [:card-id ms/PositiveInt]]
   _query-params
   body :- [:map {:closed true}
            [:parameters {:optional true} [:maybe [:sequential ::parameters.schema/parameter-with-value]]]]]
  (m/mapply qp.dashboard/process-query-for-dashcard
            (merge
             body
             {:dashboard (api/check-404 (dashboards-rest.db/dashboard dashboard-id))
              :card      (api/check-404 (dashboards-rest.db/card card-id))
              :dashcard  (api/check-404 (dashboards-rest.db/dashcard dashcard-id))
              :qp        qp.pivot/run-pivot-query})))

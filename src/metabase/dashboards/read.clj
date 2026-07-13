(ns metabase.dashboards.read
  "The read path for a single Dashboard: hydrating a `Dashboard` row into the shape the frontend expects, with
  collection-permission-aware filtering of its cards and per-load caching of the metadata needed to do so."
  (:require
   [clojure.core.cache :as cache]
   [clojure.core.memoize :as memoize]
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.dashboards.settings :as dashboards.settings]
   [metabase.lib-be.core :as lib-be]
   [metabase.models.interface :as mi]
   [metabase.parameters.params :as params]
   [metabase.permissions.core :as perms]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.query-processor.util :as qp.util]
   [metabase.util.log :as log]
   [steffan-westcott.clj-otel.api.trace.span :as span]
   [toucan2.core :as t2]))

(defn hydrate-dashboard-details
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
                  ;; disabled :can_run_adhoc_query for performance reasons in 50 release
                  [:card :can_write #_:can_run_adhoc_query [:moderation_reviews :moderator_details]]
                  [:series :can_write #_:can_run_adhoc_query]
                  :dashcard/action
                  :dashcard/linkcard-info]
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
        true (apply t2/hydrate dashboard)))))

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
        (log/errorf e "Error hashing query %s: %s" (pr-str query) (ex-message e))
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
                                                       (t2/select-one-fn :dataset_query :model/Card :id (:id card)))
                                     download-level (when (seq dataset-query)
                                                      (perms/download-perms-level dataset-query api/*current-user-id*))]
                                 (assoc card :download_perms (case download-level
                                                               :no :none
                                                               :ten-thousand-rows :limited
                                                               :one-million-rows :full
                                                               :full :full
                                                               :none)))))))))))

(defn apply-card-permission-filters
  "Apply collection-permission-aware filtering to dashboard cards. Hides details of
   cards the current user cannot read and sets download permission levels."
  [dashboard]
  (-> dashboard
      hide-unreadable-cards
      add-query-average-durations
      set-download-perms-on-dashcards))

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
        apply-card-permission-filters
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

(defn do-with-dashboard-load-id
  "Implementation of [[with-dashboard-load-id]]."
  [dashboard-load-id body-fn]
  (if dashboard-load-id
    (binding [*dashboard-load-id* dashboard-load-id]
      (lib-be/with-existing-metadata-provider-cache (dashboard-load-metadata-provider-cache dashboard-load-id)
        (log/debugf "Using dashboard_load_id %s" dashboard-load-id)
        (body-fn)))
    (do
      (log/debug "No dashboard_load_id provided")
      (body-fn))))

(defmacro with-dashboard-load-id
  "Evaluates `body` with metadata-provider caching keyed by `dashboard-load-id`, so that the burst of requests a
  single dashboard load sends to the backend (the dashboard itself, its query metadata, and each dashcard's query)
  can share cached appdb lookups instead of repeating them per-request."
  [dashboard-load-id & body]
  `(do-with-dashboard-load-id ~dashboard-load-id (^:once fn* [] ~@body)))

(defn get-dashboard
  "Get Dashboard with ID.

  Memoized per `*dashboard-load-id*` with a TTL of 10 seconds."
  [id]
  ((get-dashboard-fn *dashboard-load-id*) id))

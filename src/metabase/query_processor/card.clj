(ns metabase.query-processor.card
  "Code for running a query in the context of a specific Card."
  (:require [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase.api.common :as api]
            [metabase.models.card :as card :refer [Card]]
            [metabase.models.dashboard :refer [Dashboard]]
            [metabase.models.database :refer [Database]]
            [metabase.models.query :as query]
            [metabase.public-settings :as public-settings]
            [metabase.query-processor :as qp]
            [metabase.query-processor.middleware.constraints :as constraints]
            [metabase.query-processor.middleware.permissions :as qp.perms]
            [metabase.query-processor.streaming :as qp.streaming]
            [metabase.query-processor.util :as qputil]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]
            [toucan.db :as db]))

(defn- query-magic-ttl
  "Compute a 'magic' cache TTL time (in seconds) for QUERY by multipling its historic average execution times by the
  `query-caching-ttl-ratio`. If the TTL is less than a second, this returns `nil` (i.e., the cache should not be
  utilized.)"
  [query]
  (when-let [average-duration (query/average-execution-time-ms (qputil/query-hash query))]
    (let [ttl-seconds (Math/round (float (/ (* average-duration (public-settings/query-caching-ttl-ratio))
                                            1000.0)))]
      (when-not (zero? ttl-seconds)
        (log/info (trs "Question''s average execution duration is {0}; using ''magic'' TTL of {1}"
                       (u/format-milliseconds average-duration) (u/format-seconds ttl-seconds))
                  (u/emoji "💾"))
        ttl-seconds))))

(defn- ttl-hierarchy
  "Returns the cache ttl (in seconds), by first checking whether there is a stored value for the database,
  dashboard, or card (in that order of increasing preference), and if all of those don't exist, then the
  `query-magic-ttl`, which is based on average execution time."
  [card dashboard database query]
  (when (public-settings/enable-query-caching)
    (let [ttls (map :cache_ttl [card dashboard database])
          most-granular-ttl (first (filter some? ttls))]
      (or (when most-granular-ttl ; stored TTLs are in hours; convert to seconds
            (* most-granular-ttl 3600))
          (query-magic-ttl query)))))

(defn query-for-card
  "Generate a query for a saved Card"
  [{query :dataset_query
    :as   card} parameters constraints middleware & [ids]]
  (let [query     (-> query
                      ;; don't want default constraints overridding anything that's already there
                      (m/dissoc-in [:middleware :add-default-userland-constraints?])
                      (assoc :constraints constraints
                             :parameters  parameters
                             :middleware  middleware))
        dashboard (db/select-one [Dashboard :cache_ttl] :id (:dashboard-id ids))
        database  (db/select-one [Database :cache_ttl] :id (:database_id card))
        ttl-secs  (ttl-hierarchy card dashboard database query)]
    (assoc query :cache-ttl ttl-secs)))

(defn run-query-for-card-async
  "Run the query for Card with `parameters` and `constraints`, and return results in a
  `metabase.async.streaming_response.StreamingResponse` (see [[metabase.async.streaming-response]]) that should be
  returned as the result of an API endpoint fn. Will throw an Exception if preconditions (such as read perms) are not
  met before returning the `StreamingResponse`.

  `context` is a keyword describing the situation in which this query is being ran, e.g. `:question` (from a Saved
  Question) or `:dashboard` (from a Saved Question in a Dashboard). See [[metabase.mbql.schema/Context]] for all valid
  options."
  [card-id export-format
   & {:keys [parameters constraints context dashboard-id middleware qp-runner run ignore_cache]
      :or   {constraints constraints/default-query-constraints
             context     :question
             qp-runner   qp/process-query-and-save-execution!}}]
  {:pre [(u/maybe? sequential? parameters)]}
  (let [run   (or run
                  ;; param `run` can be used to control how the query is ran, e.g. if you need to
                  ;; customize the `context` passed to the QP
                  (^:once fn* [query info]
                   (qp.streaming/streaming-response [context export-format (u/slugify (:card-name info))]
                     (binding [qp.perms/*card-id* card-id]
                       (qp-runner query info context)))))
        card  (api/read-check (db/select-one [Card :id :name :dataset_query :database_id :cache_ttl :collection_id] :id card-id))
        query (-> (assoc (query-for-card card parameters constraints middleware {:dashboard-id dashboard-id}) :async? true)
                  (update :middleware (fn [middleware]
                                        (merge
                                         {:js-int-to-string? true :ignore-cached-results? ignore_cache}
                                         middleware))))
        info  {:executed-by  api/*current-user-id*
               :context      context
               :card-id      card-id
               :card-name    (:name card)
               :dashboard-id dashboard-id}]
    (api/check-not-archived card)
    (run query info)))

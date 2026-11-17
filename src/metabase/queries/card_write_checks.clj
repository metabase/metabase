(ns metabase.queries.card-write-checks
  "The pre-write permission and validation check stack for creating and updating cards. Extracted
   from the REST card endpoints so the REST API and the MCP `question_write` tool run the exact
   same checks and can't drift apart."
  (:require
   [metabase.api.common :as api]
   [metabase.embedding.validation :as embedding.validation]
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.lib.core :as lib]
   [metabase.queries.db :as queries.db]
   [metabase.queries.schema :as queries.schema]
   [metabase.query-permissions.core :as query-perms]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn check-card-can-be-saved!
  "Throw a 400 when a `:metric` card's `dataset-query` can't be saved. No-op for other card types."
  [dataset-query :- [:maybe ::lib-be.schema/maybe-legacy-query]
   card-type     :- [:maybe ::queries.schema/card.type]]
  (when (and (seq dataset-query) (= card-type :metric))
    (when-not (lib/can-save? dataset-query card-type)
      (throw (ex-info (tru "Card of type {0} is invalid, cannot be saved." (name card-type))
                      {:type        card-type
                       :status-code 400})))))

(defn- check-no-save-cycle
  "Run [[metabase.lib.core/check-card-overwrite]] for a Card that is not saved yet and `query`, re-throwing its error as a
  400."
  [query]
  (try
    (lib/check-card-overwrite ::no-id query)
    (catch clojure.lang.ExceptionInfo e
      (throw (ex-info (ex-message e) (assoc (ex-data e) :status-code 400))))))

(defn actual-collection-id
  "The `collection_id` a card will actually be placed in, given a create/update body. A dashboard
   question's collection is inferred from its `dashboard_id`; if both are given they must match."
  [body]
  (let [[_ collection-id :as specified-collection-id?] (find body :collection_id)
        ;; unlike collection_id, `dashboard_id=null` isn't different than not specifying it at all.
        dashboard-id (:dashboard_id body)]
    (cond
      ;; you specified both - they must match
      (and specified-collection-id? dashboard-id)
      (let [dashboard-collection-id (queries.db/dashboard-collection-id dashboard-id)]
        (api/check-400 (= collection-id dashboard-collection-id)
                       (tru "Mismatch detected between Dashboard''s `collection_id` ({0}) and `collection_id` ({1})"
                            dashboard-collection-id
                            collection-id))
        collection-id)

      specified-collection-id? collection-id

      dashboard-id (queries.db/dashboard-collection-id dashboard-id)

      :else nil)))

(mu/defn- check-allowed-to-modify-query
  "If the query is being modified, check that we have data permissions to run the query."
  [card-before-updates :- ::queries.schema/card
   card-updates        :- ::queries.schema/card]
  (when (api/column-will-change? (:dataset_query card-before-updates) (get card-updates :dataset_query ::api/not-provided))
    (query-perms/check-run-permissions-for-query (dissoc (:dataset_query card-updates) :query-permissions/perms))))

(defn- check-embedding-enabled-to-change-embedding
  "Embedding must be enabled to change the value of `enable_embedding`, `embedding_type` or `embedding_params`."
  [card-before-updates card-updates]
  (when (or (api/column-will-change? (:enable_embedding card-before-updates) (get card-updates :enable_embedding ::api/not-provided))
            (api/column-will-change? (:embedding_type card-before-updates) (get card-updates :embedding_type ::api/not-provided))
            (api/column-will-change? (:embedding_params card-before-updates) (get card-updates :embedding_params ::api/not-provided)))
    (embedding.validation/check-embedding-enabled)))

(mu/defn- check-update-result-metadata-data-perms
  [card-before-updates :- ::queries.schema/card
   card-updates        :- ::queries.schema/card]
  (when (api/column-will-change? (:result_metadata card-before-updates) (get card-updates :result_metadata ::api/not-provided))
    (let [database-id (some :database_id [card-before-updates card-updates])
          result-metadata (:result_metadata card-updates)]
      (query-perms/check-result-metadata-data-perms database-id result-metadata))))

(defn check-allowed-to-run-query!
  "Throw unless the current user has data permission to run `query`."
  [query]
  ;; Strip :query-permissions/perms first -- it is populated internally by the QP middleware, so
  ;; any value already on the incoming query is dropped here.
  (query-perms/check-run-permissions-for-query (dissoc query :query-permissions/perms)))

(defn check-allowed-to-create-card!
  "Throws unless `card` can be saved as `card-type` and the current user may create it and run its query."
  [card card-type]
  (check-card-can-be-saved! (:dataset_query card) card-type)
  (check-allowed-to-run-query! (:dataset_query card))
  ;; if a `dashboard-id` is specified, check permissions on the *dashboard's* collection ID.
  (api/create-check :model/Card (assoc card :collection_id (actual-collection-id card)))
  (check-no-save-cycle (:dataset_query card)))

(mu/defn check-allowed-to-update-card!
  "Throws unless the current user may apply `card-updates` to `card-before-update`."
  [card-before-update :- ::queries.schema/card
   card-updates       :- ::queries.schema/card]
  (check-embedding-enabled-to-change-embedding card-before-update card-updates)
  (api/update-check card-before-update card-updates)
  (doseq [f [check-update-result-metadata-data-perms
             check-allowed-to-modify-query]]
    (f card-before-update card-updates)))

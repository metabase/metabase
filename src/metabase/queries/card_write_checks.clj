(ns metabase.queries.card-write-checks
  "The pre-write permission and validation check stack for creating and updating cards. Extracted
   from the REST card endpoints so the REST API and the MCP `question_write` tool run the exact
   same checks and can't drift apart."
  (:require
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.embedding.validation :as embedding.validation]
   [metabase.lib.core :as lib]
   [metabase.queries.schema :as queries.schema]
   [metabase.query-permissions.core :as query-perms]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mu/defn check-card-can-be-saved!
  "Throw a 400 when a `:metric` card's `dataset-query` can't be saved. No-op for other card types."
  [dataset-query :- [:maybe ::queries.schema/query]
   card-type     :- [:maybe ::queries.schema/card-type]]
  (when (and (seq dataset-query) (= card-type :metric))
    (when-not (lib/can-save? dataset-query card-type)
      (throw (ex-info (tru "Card of type {0} is invalid, cannot be saved." (name card-type))
                      {:type        card-type
                       :status-code 400})))))

(defn check-no-save-cycle!
  "Run [[metabase.lib.core/check-card-overwrite]] for `card-id`/`query` (cycle detection),
   re-throwing its error as a 400. Pass `:metabase.queries.card-write-checks/no-id` for `card-id`
   on create."
  [card-id query]
  (try
    (lib/check-card-overwrite card-id query)
    (catch clojure.lang.ExceptionInfo e
      (throw (ex-info (ex-message e) (assoc (ex-data e) :status-code 400))))))

(defn actual-collection-id
  "The `collection_id` a card will actually be placed in, given a create/update body. A dashboard
   question's collection is inferred from its `dashboard_id`; if both are given they must match."
  [body]
  (let [[_ collection-id :as specified-collection-id?] (find body :collection_id)
        ;; unlike collection_id, `dashboard_id=null` isn't different than not specifying it at all.
        dashboard-id (:dashboard_id body)
        dashboard-id->collection-id #(t2/select-one-fn :collection_id [:model/Dashboard :collection_id] %)]
    (cond
      ;; you specified both - they must match
      (and specified-collection-id? dashboard-id)
      (let [dashboard-collection-id (dashboard-id->collection-id dashboard-id)]
        (api/check-400 (= collection-id dashboard-collection-id)
                       (tru "Mismatch detected between Dashboard''s `collection_id` ({0}) and `collection_id` ({1})"
                            dashboard-collection-id
                            collection-id))
        collection-id)

      specified-collection-id? collection-id

      dashboard-id (dashboard-id->collection-id dashboard-id)

      :else nil)))

(defn- check-allowed-to-remove-from-existing-dashboards [card]
  (let [dashboards (or (:in_dashboards card)
                       (:in_dashboards (t2/hydrate card :in_dashboards)))]
    (doseq [dashboard dashboards]
      (api/write-check dashboard))))

(mu/defn- check-allowed-to-modify-query
  "If the query is being modified, check that we have data permissions to run the query."
  [card-before-updates :- ::queries.schema/card
   card-updates        :- ::queries.schema/card]
  (when (api/column-will-change? :dataset_query card-before-updates card-updates)
    (query-perms/check-run-permissions-for-query (dissoc (:dataset_query card-updates) :query-permissions/perms))))

(defn- check-allowed-to-change-embedding
  "You must be a superuser to change the value of `enable_embedding`, `embedding_type` or `embedding_params`. Embedding must be
  enabled."
  [card-before-updates card-updates]
  (when (or (api/column-will-change? :enable_embedding card-before-updates card-updates)
            (api/column-will-change? :embedding_type card-before-updates card-updates)
            (api/column-will-change? :embedding_params card-before-updates card-updates))
    (embedding.validation/check-embedding-enabled)
    (api/check-superuser)))

(mu/defn- check-allowed-to-move
  [card-before-update :- ::queries.schema/card
   card-updates       :- ::queries.schema/card]
  (when (api/column-will-change? :dashboard_id card-before-update card-updates)
    (check-allowed-to-remove-from-existing-dashboards card-before-update))
  (collection/check-allowed-to-change-collection card-before-update card-updates))

(mu/defn- check-update-result-metadata-data-perms
  [card-before-updates :- ::queries.schema/card
   card-updates        :- ::queries.schema/card]
  (when (api/column-will-change? :result_metadata card-before-updates card-updates)
    (let [database-id (some :database_id [card-before-updates card-updates])
          result-metadata (:result_metadata card-updates)]
      (query-perms/check-result-metadata-data-perms database-id result-metadata))))

(defn check-allowed-to-create-card!
  "The full pre-write permission/validation stack for creating a card, mirroring `POST /api/card`.
   `card` is the create body (with `:dataset_query`, and `:collection_id` and/or `:dashboard_id`);
   `card-type` its keyword type. Runs run-permissions on the query, create-permission on the
   target collection, and cycle detection. Throws on any failure."
  [card card-type]
  (let [query (:dataset_query card)]
    (check-card-can-be-saved! query card-type)
    ;; Strip :query-permissions/perms first -- it is populated internally by the QP middleware, so
    ;; any value already on the incoming query is dropped here.
    (query-perms/check-run-permissions-for-query (dissoc query :query-permissions/perms))
    ;; if a `dashboard-id` is specified, check permissions on the *dashboard's* collection ID.
    (api/create-check :model/Card {:collection_id (actual-collection-id card)})
    (check-no-save-cycle! ::no-id query)))

(mu/defn check-allowed-to-update-card!
  "The post-write permission/validation stack for updating a card, mirroring `PUT /api/card/:id`.
   Run *after* the card's write-check: `card-before-update` is the existing card, `card-updates`
   the patch (after [[metabase.api.common/updates-with-archived-directly]]). Checks
   result-metadata data perms, collection/dashboard moves, query-run perms, and embedding changes."
  [card-before-update :- ::queries.schema/card
   card-updates       :- ::queries.schema/card]
  (doseq [f [check-update-result-metadata-data-perms
             check-allowed-to-move
             check-allowed-to-modify-query
             check-allowed-to-change-embedding]]
    (f card-before-update card-updates)))

(ns metabase.transforms-rest.api.transform
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.request.core :as request]
   [metabase.transforms-inspector.core :as inspector]
   [metabase.transforms-inspector.schema :as inspector.schema]
   [metabase.transforms-rest.api.transform-job]
   [metabase.transforms-rest.api.transform-tag]
   [metabase.transforms.core :as transforms.core]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.transforms.util :as transforms.util]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [ring.util.response :as response]
   [toucan2.core :as t2])
  ;; TODO (Chris 2026-01-22) -- Remove jsqlparser imports/typehints to be SQL parser-agnostic
  (:import
   ^{:clj-kondo/ignore [:metabase/no-jsqlparser-imports]}
   (net.sf.jsqlparser.statement.select PlainSelect)))

(comment metabase.transforms-rest.api.transform-job/keep-me
         metabase.transforms-rest.api.transform-tag/keep-me)

(set! *warn-on-reflection* true)

(mr/def ::transform-source ::transforms.schema/transform-source)

(mr/def ::transform-target ::transforms.schema/transform-target)

(mr/def ::run-trigger
  [:enum "none" "global-schedule"])

(def ^:private CreatorResponse
  [:map {:closed true}
   [:id pos-int?]
   [:email :string]
   [:first_name [:maybe :string]]
   [:last_name [:maybe :string]]
   [:common_name {:optional true} [:maybe :string]]
   [:last_login {:optional true} [:maybe :any]]
   [:is_qbnewb {:optional true} :boolean]
   [:is_superuser {:optional true} :boolean]
   [:is_data_analyst {:optional true} :boolean]
   [:tenant_id {:optional true} [:maybe :any]]
   [:date_joined {:optional true} :any]])

(def ^:private OwnerResponse
  [:map {:closed true}
   [:id {:optional true} pos-int?]
   [:email :string]
   [:first_name {:optional true} [:maybe :string]]
   [:last_name {:optional true} [:maybe :string]]
   [:common_name {:optional true} [:maybe :string]]])

(def ^:private TransformLastRunResponse
  [:map {:closed true}
   [:id pos-int?]
   [:transform_id pos-int?]
   [:run_method :keyword]
   [:status [:enum :started :succeeded :failed :timeout :canceled :canceling]]
   [:is_active [:maybe :boolean]]
   [:start_time :any]
   [:end_time {:optional true} [:maybe :any]]
   [:message [:maybe :string]]
   [:user_id [:maybe pos-int?]]
   [:transform_name {:optional true} [:maybe :string]]
   [:transform_entity_id {:optional true} [:maybe :string]]])

(def ^:private TransformResponse
  [:map {:closed true}
   [:id pos-int?]
   [:name :string]
   [:description [:maybe :string]]
   [:source :any]
   [:target :any]
   [:source_type :keyword]
   [:source_database_id {:optional true} [:maybe pos-int?]]
   [:source_readable {:optional true} [:maybe :boolean]]
   [:entity_id [:maybe :string]]
   [:created_at :any]
   [:updated_at :any]
   [:creator_id pos-int?]
   [:collection_id [:maybe pos-int?]]
   [:target_db_id {:optional true} [:maybe pos-int?]]
   [:run_trigger {:optional true} [:maybe :keyword]]
   [:dependency_analysis_version :int]
   [:creator CreatorResponse]
   [:last_run {:optional true} [:maybe TransformLastRunResponse]]
   [:tag_ids {:optional true} [:sequential pos-int?]]
   [:table {:optional true} [:maybe :map]]
   [:owner_user_id {:optional true} [:maybe pos-int?]]
   [:owner_email {:optional true} [:maybe :string]]
   [:owner {:optional true} [:maybe OwnerResponse]]])

(def ^:private TransformRunResponse
  [:map {:closed true}
   [:id pos-int?]
   [:transform_id [:maybe pos-int?]]
   [:run_method :keyword]
   [:status [:enum :started :succeeded :failed :timeout :canceled :canceling]]
   [:is_active [:maybe :boolean]]
   [:start_time :any]
   [:end_time {:optional true} [:maybe :any]]
   [:message [:maybe :string]]
   [:user_id [:maybe pos-int?]]
   [:transform_name {:optional true} [:maybe :string]]
   [:transform_entity_id {:optional true} [:maybe :string]]
   ;; Transform can have id/name when exists, or be nil when deleted
   [:transform {:optional true} [:maybe [:map {:closed true}
                                         [:id {:optional true} pos-int?]
                                         [:name {:optional true} :string]
                                         [:deleted {:optional true} :boolean]
                                         [:collection_id {:optional true} [:maybe pos-int?]]
                                         [:collection {:optional true} [:maybe :map]]
                                         [:tag_ids {:optional true} [:sequential pos-int?]]]]]])

(comment
  ;; Examples
  [{:id 1
    :name "Gadget Products"
    :source {:type "query"
             :query {:database 1
                     :type "native",
                     :native {:query "SELECT * FROM PRODUCTS WHERE CATEGORY = 'Gadget'"
                              :template-tags {}}}}
    :target {:type "table"
             :schema "transforms"
             :name "gadget_products"}}])

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case]}
(api.macros/defendpoint :get "/" :- [:sequential TransformResponse]
  "Get a list of transforms."
  [_route-params
   query-params :-
   [:map
    [:last_run_start_time {:optional true} [:maybe ms/NonBlankString]]
    [:last_run_statuses {:optional true} [:maybe (ms/QueryVectorOf [:enum "started" "succeeded" "failed" "timeout"])]]
    [:tag_ids {:optional true} [:maybe (ms/QueryVectorOf ms/IntGreaterThanOrEqualToZero)]]
    [:database_id {:optional true} [:maybe ms/PositiveInt]]]]
  (transforms.core/get-transforms query-params))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
(api.macros/defendpoint :post "/" :- TransformResponse
  "Create a new transform."
  [_route-params
   _query-params
   body :- [:map
            [:name :string]
            [:description {:optional true} [:maybe :string]]
            [:source ::transforms.schema/transform-source]
            [:target ::transforms.schema/transform-target]
            [:run_trigger {:optional true} ::run-trigger]
            [:tag_ids {:optional true} [:sequential ms/PositiveInt]]
            [:collection_id {:optional true} [:maybe ms/PositiveInt]]
            [:owner_user_id {:optional true} [:maybe ms/PositiveInt]]
            [:owner_email {:optional true} [:maybe :string]]]]
  (api/create-check :model/Transform body)
  (transforms.core/check-database-feature body)
  (transforms.core/check-feature-enabled! body)
  (transforms.core/validate-incremental-column-type! body)

  (api/check (not (transforms.util/target-table-exists? body))
             403
             (deferred-tru "A table with that name already exists."))
  (-> (transforms.core/create-transform! body)
      transforms.core/python-source-table-ref->table-id
      transforms.util/add-source-readable))

(api.macros/defendpoint :get "/:id" :- TransformResponse
  "Get a specific transform."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (transforms.core/get-transform id))

(api.macros/defendpoint :get "/:id/dependencies" :- [:sequential TransformResponse]
  "Get the dependencies of a specific transform."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (api/read-check :model/Transform id)
  (let [id->transform (t2/select-pk->fn identity :model/Transform)
        global-ordering (transforms.core/transform-ordering (vals id->transform))
        dep-ids         (get global-ordering id)
        dependencies    (map id->transform dep-ids)]
    (->> (t2/hydrate dependencies :creator :owner)
         (mapv transforms.core/python-source-table-ref->table-id)
         transforms.util/add-source-readable)))

(def ^:private MergeHistoryEntry
  [:map
   [:id ms/PositiveInt]
   [:workspace_merge_id ms/PositiveInt]
   [:commit_message :string]
   [:workspace_id [:maybe ms/PositiveInt]]
   [:workspace_name :string]
   [:merging_user_id ms/PositiveInt]
   [:created_at :any]])

(api.macros/defendpoint :get "/:id/merge-history"
  :- [:sequential MergeHistoryEntry]
  "Get merge history for a transform. Returns all merge events that affected this transform,
   ordered by created_at descending (newest first)."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/Transform id))
  (t2/select [:model/WorkspaceMergeTransform
              :id
              :workspace_merge_id
              :commit_message
              :workspace_id
              :workspace_name
              :merging_user_id
              :created_at]
             {:where    [:= :transform_id id]
              :order-by [[:created_at :desc]]}))

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case]}
(api.macros/defendpoint :get "/run" :- [:map {:closed true}
                                        [:data [:sequential TransformRunResponse]]
                                        [:limit pos-int?]
                                        [:offset :int]
                                        [:total :int]]
  "Get transform runs based on a set of filter params."
  [_route-params
   query-params :-
   [:map
    [:sort_column    {:optional true} [:enum "transform-name" "start-time" "end-time" "status" "run-method" "transform-tags"]]
    [:sort_direction {:optional true} [:enum "asc" "desc"]]
    [:transform_ids {:optional true} [:maybe (ms/QueryVectorOf ms/IntGreaterThanOrEqualToZero)]]
    [:statuses {:optional true} [:maybe (ms/QueryVectorOf [:enum "started" "succeeded" "failed" "timeout"])]]
    [:transform_tag_ids {:optional true} [:maybe (ms/QueryVectorOf ms/IntGreaterThanOrEqualToZero)]]
    [:start_time {:optional true} [:maybe ms/NonBlankString]]
    [:end_time {:optional true} [:maybe ms/NonBlankString]]
    [:run_methods {:optional true} [:maybe (ms/QueryVectorOf [:enum "manual" "cron"])]]]]
  (api/check-data-analyst)
  (-> (transforms.core/paged-runs (assoc query-params
                                         :offset (request/offset)
                                         :limit  (request/limit)))
      (update :data #(map transforms.util/localize-run-timestamps %))))

(api.macros/defendpoint :put "/:id" :- TransformResponse
  "Update a transform."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   body :- [:map
            [:name {:optional true} :string]
            [:description {:optional true} [:maybe :string]]
            [:source {:optional true} ::transforms.schema/transform-source]
            [:target {:optional true} ::transforms.schema/transform-target]
            [:run_trigger {:optional true} ::run-trigger]
            [:tag_ids {:optional true} [:sequential ms/PositiveInt]]
            [:collection_id {:optional true} [:maybe ms/PositiveInt]]
            [:owner_user_id {:optional true} [:maybe ms/PositiveInt]]
            [:owner_email {:optional true} [:maybe :string]]]]
  (api/write-check :model/Transform id)
  (transforms.core/update-transform! id body))

(api.macros/defendpoint :delete "/:id" :- :nil
  "Delete a transform."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (transforms.core/delete-transform! (api/write-check :model/Transform id)))

(api.macros/defendpoint :delete "/:id/table" :- :nil
  "Delete a transform's output table."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (api/write-check :model/Transform id)
  (transforms.util/delete-target-table-by-id! id)
  nil)

(api.macros/defendpoint :post "/:id/cancel" :- :nil
  "Cancel the current run for a given transform."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (let [transform (api/write-check :model/Transform id)
        run       (api/check-404 (transforms.core/running-run-for-transform-id id))]
    (transforms.core/mark-cancel-started-run! (:id run))
    (when (transforms.util/python-transform? transform)
      (transforms.core/cancel-run! (:id run))))
  nil)

(defn run-transform!
  "Run a transform. Returns a 202 response with run_id.
   The transform must already be fetched and validated."
  [transform]
  (transforms.core/check-feature-enabled! transform)
  (let [start-promise (promise)]
    (u.jvm/in-virtual-thread*
     (transforms.core/execute! transform {:start-promise start-promise
                                          :run-method :manual
                                          :user-id api/*current-user-id*}))
    (when (instance? Throwable @start-promise)
      (throw @start-promise))
    (let [result @start-promise
          run-id (when (and (vector? result) (= (first result) :started))
                   (second result))]
      (-> (response/response {:message (deferred-tru "Transform run started")
                              :run_id run-id})
          (assoc :status 202)))))

(api.macros/defendpoint :post "/:id/run" :- [:map
                                             [:status [:= 202]]
                                             [:body [:map {:closed true}
                                                     [:message :any]
                                                     [:run_id [:maybe pos-int?]]]]]
  "Run a transform."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (run-transform! (api/write-check :model/Transform id)))

(defn- simple-native-query?
  "Checks if a native SQL query string is simple enough for automatic checkpoint insertion."
  [sql-string]
  (try
    ;; BEWARE: The API endpoint (caller) does not have info on database engine this query should run on. Hence
    ;;         there's no way of providing appropriate [[metabase.driver.util/macaw-options]]. `nil` is best-effort
    ;;         adding at least default :non-resserved-words.
    ;; TODO (Chris 2026-01-22) -- Remove jsqlparser typehints to be SQL parser-agnostic
    (let [^PlainSelect parsed (driver.u/parsed-query sql-string nil)]
      (cond
        (not (instance? PlainSelect parsed))
        {:is_simple false
         :reason "Not a simple SELECT"}

        (.getLimit parsed)
        {:is_simple false
         :reason "Contains a LIMIT"}

        (.getOffset ^PlainSelect parsed)
        {:is_simple false
         :reason "Contains an OFFSET"}

        (seq (.getWithItemsList ^PlainSelect parsed))
        {:is_simple false
         :reason "Contains a CTE"}

        :else
        {:is_simple true}))
    (catch Exception e
      (log/debugf e "Failed to parse query: %s" (ex-message e))
      {:is_simple false})))

(api.macros/defendpoint :post "/is-simple-query" :- [:map
                                                     [:is_simple :boolean]
                                                     [:reason {:optional true} :string]]
  "Checks if a native SQL query string is simple enough for automatic checkpoint insertion"
  [_route-params
   _query-params
   {:keys [query]} :- [:map [:query string?]]]
  (api/check-superuser)
  (simple-native-query? query))

(api.macros/defendpoint :post "/extract-columns"
  :- [:map [:columns [:maybe [:sequential :string]]]]
  "Extract column names suitable for incremental transform checkpoint filtering.

  This endpoint is specifically for populating the checkpoint column dropdown in
  incremental transforms. It only returns columns with types supported for checkpoint
  filtering: temporal (timestamp/tz) and numeric (int/float) types.

  Text, boolean, and other unsupported column types are filtered out.

  The query is compiled to native SQL using [[qp.compile/compile-with-inline-parameters]],
  which handles parameterized queries with template tags. Then extracts column names
  and types using PreparedStatement metadata.

  Returns a map with a :columns key containing a vector of column names (strings).
  If extraction fails, returns nil for :columns."
  [_route-params
   _query-params
   {:keys [query]} :- [:map
                       [:query ::qp.schema/any-query]]]
  (api/check-superuser)
  (let [database-id (:database query)
        database    (api/check-404 (t2/select-one :model/Database :id database-id))
        driver-name (driver/the-initialized-driver (:engine database))
        columns     (transforms.core/extract-incremental-filter-columns-from-query driver-name database-id query)]
    {:columns columns}))

;;; -------------------------------------------------- Inspector API --------------------------------------------------

(api.macros/defendpoint :get "/:id/inspect"
  :- ::inspector.schema/discovery-response
  "Phase 1: Discover available lenses for a transform.
   Returns structural metadata and available lens types."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (let [transform (api/read-check :model/Transform id)]
    (transforms.core/check-feature-enabled! transform)
    (inspector/discover-lenses transform)))

(api.macros/defendpoint :get "/:id/inspect/:lens-id"
  :- ::inspector.schema/lens
  "Phase 2: Get full lens contents for a transform.
   Returns sections, cards with dataset_query, and trigger definitions.
   Accepts optional params for drill lenses as query params."
  [{:keys [id lens-id]} :- [:map
                            [:id ms/PositiveInt]
                            [:lens-id ms/NonBlankString]]
   params :- [:map-of :keyword :any]]
  (let [transform (api/read-check :model/Transform id)]
    (transforms.core/check-feature-enabled! transform)
    (inspector/get-lens transform lens-id params)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/transform` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))

(def ^{:arglists '([request respond raise])} transform-tag-routes
  "`/api/transform-tag` routes."
  (api.macros/ns-handler 'metabase.transforms-rest.api.transform-tag +auth))

(def ^{:arglists '([request respond raise])} transform-job-routes
  "`/api/transform-job` routes."
  (api.macros/ns-handler 'metabase.transforms-rest.api.transform-job +auth))

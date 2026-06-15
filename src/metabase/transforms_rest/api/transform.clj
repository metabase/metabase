(ns metabase.transforms-rest.api.transform
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.request.core :as request]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms-rest.api.transform-job]
   [metabase.transforms-rest.api.transform-tag]
   [metabase.transforms.core :as transforms.core]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.transforms.util :as transforms.u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.json :as json]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [ring.util.response :as response]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime)))

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
   [:transform_entity_id {:optional true} [:maybe :string]]
   [:checkpoint_filter_field_id {:optional true} [:maybe pos-int?]]
   [:checkpoint_lo_value {:optional true} [:maybe :string]]
   [:checkpoint_hi_value {:optional true} [:maybe :string]]
   [:metered_as {:optional true} [:maybe :string]]])

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
   [:creator CreatorResponse]
   [:last_run {:optional true} [:maybe TransformLastRunResponse]]
   [:tag_ids {:optional true} [:sequential pos-int?]]
   [:table {:optional true} [:maybe :map]]
   [:target_table_id {:optional true} [:maybe pos-int?]]
   [:owner_user_id {:optional true} [:maybe pos-int?]]
   [:owner_email {:optional true} [:maybe :string]]
   [:owner {:optional true} [:maybe OwnerResponse]]
   [:last_checkpoint_value {:optional true} [:maybe :string]]])

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
   [:checkpoint_filter_field_id {:optional true} [:maybe pos-int?]]
   [:checkpoint_lo_value {:optional true} [:maybe :string]]
   [:checkpoint_hi_value {:optional true} [:maybe :string]]
   [:metered_as {:optional true} [:maybe :string]]
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

(api.macros/defendpoint :get "/" :- [:sequential TransformResponse]
  "Get a list of transforms."
  [_route-params
   query-params :-
   [:map
    [:last-run-start-time {:optional true} [:maybe ms/NonBlankString]]
    [:last-run-statuses {:optional true} [:maybe (ms/QueryVectorOf [:enum "started" "succeeded" "failed" "timeout"])]]
    [:tag-ids {:optional true} [:maybe (ms/QueryVectorOf ms/IntGreaterThanOrEqualToZero)]]
    [:database-id {:optional true} [:maybe ms/PositiveInt]]]]
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
  (api/check (not (transforms-base.u/target-table-exists? body))
             403
             (deferred-tru "A table with that name already exists."))
  (-> (transforms.core/create-transform! body)
      transforms.u/add-source-readable))

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
        {graph :dependencies} (transforms.core/transform-ordering #{id} (vals id->transform))
        dep-ids         (get graph id)
        dependencies    (map id->transform dep-ids)]
    (->> (t2/hydrate dependencies :creator :owner)
         transforms.u/add-source-readable)))

(api.macros/defendpoint :get "/run" :- [:map {:closed true}
                                        [:data [:sequential TransformRunResponse]]
                                        [:limit pos-int?]
                                        [:offset :int]
                                        [:total :int]]
  "Get transform runs based on a set of filter params."
  [_route-params
   query-params :-
   [:map
    [:sort-column    {:optional true} [:enum "transform-name" "start-time" "end-time" "status" "run-method" "transform-tags" "duration"]]
    [:sort-direction {:optional true} [:enum "asc" "desc"]]
    [:transform-ids {:optional true} [:maybe (ms/QueryVectorOf ms/IntGreaterThanOrEqualToZero)]]
    [:statuses {:optional true} [:maybe (ms/QueryVectorOf [:enum "started" "succeeded" "failed" "timeout"])]]
    [:transform-tag-ids {:optional true} [:maybe (ms/QueryVectorOf ms/IntGreaterThanOrEqualToZero)]]
    [:start-time {:optional true} [:maybe ms/NonBlankString]]
    [:end-time {:optional true} [:maybe ms/NonBlankString]]
    [:run-methods {:optional true} [:maybe (ms/QueryVectorOf [:enum "manual" "cron"])]]
    [:user-id {:optional true} [:maybe ms/PositiveInt]]]]
  (api/check-data-analyst)
  (-> (transforms.core/paged-runs (assoc query-params
                                         :offset (request/offset)
                                         :limit  (request/limit)))
      (update :data #(map transforms-base.u/localize-run-timestamps %))))

(api.macros/defendpoint :get "/run/:run-id" :- TransformRunResponse
  "Get a transform run by ID."
  [{:keys [run-id]} :- [:map
                        [:run-id ms/PositiveInt]]]
  (api/check-data-analyst)
  (let [run (api/check-404 (t2/select-one :model/TransformRun :id run-id))]
    (-> (t2/hydrate run [:transform :collection :transform_tag_ids])
        transforms-base.u/localize-run-timestamps)))

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
  (transforms-base.u/delete-target-table-by-id! id)
  nil)

(api.macros/defendpoint :post "/:id/cancel" :- :nil
  "Cancel the current run for a given transform."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (let [transform (api/write-check :model/Transform id)
        run       (api/check-404 (transforms.core/running-run-for-transform-id id))]
    (transforms.core/mark-cancel-started-run! (:id run))
    (when (transforms-base.u/python-transform? transform)
      ;; The cancelation row was just inserted with DB `current_timestamp`; `now` is within a
      ;; few ms of that and fine for the latency histogram, and avoids the perf/complexity cost of
      ;; getting the exact timestamp back out of the DB.
      (transforms.core/cancel-run! run (OffsetDateTime/now))))
  nil)

(api.macros/defendpoint :post "/:id/reset-checkpoint" :- :nil
  "Reset the stored checkpoint for an incremental transform."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/write-check :model/Transform id)
  (t2/update! :model/Transform id {:last_checkpoint_value nil})
  nil)

(defn run-transform!
  "Run a transform. Returns a 202 response with run_id.
   The transform must already be fetched and validated."
  [transform]
  (transforms.core/check-feature-enabled! transform)
  (api/check (not (transforms.core/transform-locked? transform))
             [402 {:message    (deferred-tru "Transforms are temporarily locked because the trial quota has been reached.")
                   :error-code "metabase_transforms_locked"}])
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
  (run-transform! (api/read-check :model/Transform id)))

;;; ---------------------------------------------------------------------------
;;; Test-run endpoint helpers
;;; ---------------------------------------------------------------------------

(def ^:private test-run-error-http-status
  "Maps `:error-type` keywords from the test-run pipeline to HTTP status codes.

  400 — caller error (bad input): the caller can fix by changing the request.
  422 — unprocessable: the transform or its environment prevents a test run;
        the caller may need to change the transform definition.
  500 — internal error: unexpected failure; the caller cannot fix this.

  Any unrecognised `:error-type` is re-thrown (→ 500 from the framework). A
  statement timeout throws an untyped exception (no `:error-type`), so it is not
  in this map and currently surfaces as a generic 500."
  {;; Fixture errors — 400: caller supplied wrong CSV content.
   :metabase.transforms.test-run.fixtures/header-mismatch        400
   :metabase.transforms.test-run.fixtures/unparseable-cell        400
   ;; Diff errors — 400: caller supplied bad options.
   :metabase.transforms.test-run.diff/unknown-ignore-columns      400
   :metabase.transforms.test-run.diff/unsupported-option          400
   ;; Input resolution errors — 400 or 422.
   :metabase.transforms.test-run.inputs/missing-fixtures          400
   :metabase.transforms.test-run.inputs/unknown-fixture-keys      400
   :metabase.transforms.test-run.inputs/unsupported-transform-type 422
   :metabase.transforms.test-run.inputs/cannot-determine-inputs   422
   :metabase.transforms.test-run.inputs/table-not-found           422
   :metabase.transforms.test-run.inputs/transform-dep-not-supported 422
   ;; Resolve errors — 422.
   :metabase.transforms.test-run.resolve/cannot-test-run          422
   :metabase.transforms.test-run.resolve/unsupported-transform-type 422
   ;; Execution errors — 500.
   :metabase.transforms.test-run.scratch/seed-failed              500
   :metabase.transforms.test-run.core/missing-database-id         422
   :metabase.transforms.test-run.core/pre-execution-guard-failed  500
   :metabase.transforms.test-run.core/execution-failed            500})

(defn- parse-input-table-ids
  "Parse multipart-params map and extract input fixture files.

  Scans all keys for the pattern `input-<N>` where N is a positive integer
  (the table id). Returns `{table-id File}` or throws 400 for malformed keys.

  Unknown keys (not `expected`, `options`, or matching `input-<int>`) are
  rejected with a 400 describing the unexpected part name."
  [multipart-params]
  (reduce-kv
   (fn [acc k v]
     (cond
       ;; Reserved keys handled separately — skip.
       (contains? #{"expected" "options"} k)
       acc

       ;; input-<positive-int> pattern.
       (re-matches #"input-(\d+)" k)
       (let [[_ id-str] (re-matches #"input-(\d+)" k)
             table-id   (parse-long id-str)]
         (if (and table-id (pos? table-id))
           (assoc acc table-id (:tempfile v))
           (throw (ex-info (tru "Malformed multipart part name: ''{0}''. Table id must be a positive integer." k)
                           {:status-code 400
                            :part-name   k}))))

       ;; Anything else is unknown.
       :else
       (throw (ex-info (tru "Unknown multipart part: ''{0}''. Expected: ''expected'', ''options'', or ''input-<table-id>''." k)
                       {:status-code 400
                        :part-name   k}))))
   {}
   multipart-params))

(defn- parse-test-run-options
  "Parse the optional `options` JSON multipart part.

  Returns a map with:
  - `:ignore-columns` — set of column name strings (default `#{}`).

  Throws 400 on malformed JSON or unknown keys."
  [options-part]
  (if (nil? options-part)
    {}
    (let [raw  (if (map? options-part) (:tempfile options-part) options-part)
          text (if (instance? java.io.File raw) (slurp raw) (str raw))
          opts (try
                 (json/decode text true)
                 (catch Exception _
                   (throw (ex-info (tru "Malformed ''options'' part: not valid JSON.")
                                   {:status-code 400
                                    :raw-text    text}))))]
      (when-let [unknown (seq (remove #{:ignore_columns} (keys opts)))]
        (throw (ex-info (tru "Unknown option keys: {0}. Supported: ignore_columns." (pr-str unknown))
                        {:status-code 400
                         :unknown-keys unknown})))
      (cond-> {}
        (:ignore_columns opts)
        (assoc :ignore-columns (set (:ignore_columns opts)))))))

(defn- run-record->response
  "Convert a successful run-record (from `run-test!`) to the HTTP response body.

  Status keywords are converted to strings (`\"passed\"` / `\"failed\"`) for
  JSON serialisation. `:test_run_id` is nil (reserved for a future async polling
  variant)."
  [record]
  {:status       (name (:status record))
   :diff         (:diff record)
   :test_run_id  nil})

(defn- error->response
  "Convert a typed ex-info from the test-run pipeline to a run-record shaped
  error response body."
  [e]
  (let [data (ex-data e)]
    {:status      "error"
     :error       {:type    (pr-str (:error-type data))
                   :message (ex-message e)}
     :test_run_id nil}))

(def ^:private TestRunResponse
  "Malli schema for the test-run HTTP response body.

  Covers three shapes:
  - passed/failed: {:status \"passed\"|\"failed\", :diff <report>, :test_run_id nil}
  - error:         {:status \"error\",             :error <map>,   :test_run_id nil}"
  [:map {:closed false}
   [:status      [:enum "passed" "failed" "error"]]
   [:test_run_id [:maybe pos-int?]]])

(defn- run-test-run!
  "Execute a test run for `transform` from parsed multipart params.

  Reads the `expected` file part, parses the `input-<id>` fixture files, parses
  the `options` JSON part, and delegates to `transforms.core/run-test!`.

  Returns the HTTP response map directly (status + body). Does NOT throw —
  typed errors are mapped to HTTP statuses from `test-run-error-http-status`;
  unknown errors become 500."
  [transform multipart-params]
  (let [expected-part (get multipart-params "expected")]
    (when-not expected-part
      (throw (ex-info (tru "Missing required multipart part: ''expected''.")
                      {:status-code 400})))
    (let [expected-file     (:tempfile expected-part)
          fixtures-by-id    (parse-input-table-ids multipart-params)
          opts              (parse-test-run-options (get multipart-params "options"))
          ;; The transform value for run-test! is built from the DB row's :source + :target.
          transform-value   {:source (:source transform)
                             :target (:target transform)}]
      (try
        (let [record (transforms.core/run-test! transform-value fixtures-by-id expected-file opts)]
          {:status 200
           :body   (run-record->response record)})
        (catch clojure.lang.ExceptionInfo e
          (let [error-type (:error-type (ex-data e))
                http-status (get test-run-error-http-status error-type)]
            (if http-status
              {:status http-status
               :body   (error->response e)}
              ;; Unknown error-type — re-throw so the framework returns 500.
              (throw e))))))))

(api.macros/defendpoint :post "/:id/test-run" :- [:map
                                                  [:status pos-int?]
                                                  [:body TestRunResponse]]
  "Run a synchronous test run for a transform.

  Accepts a multipart/form-data request with the following parts:

  - `input-<table-id>` (required, one per input table): a CSV file whose header
    must exactly match the real table's column names. `table-id` must be a
    positive integer matching the id of a table in the transform's dependency
    set.

  - `expected` (required): a CSV file containing the expected output rows.
    Columns are inferred from the actual output schema; the comparison is
    multiset (order-independent).

  - `options` (optional): a JSON string object with supported keys:
    - `ignore_columns`: array of column name strings to exclude from the diff.

  Error → HTTP status mapping:
  - 400: missing `expected` part; unknown `input-*` table id; malformed
         `options` JSON; unknown multipart part name.
  - 402: feature flag off (transforms premium feature not enabled).
  - 422: transform type not supported (e.g. Python); cannot determine input
         tables; referenced table not synced; `replace-names` rewrite fails;
         dangling column qualifier (table-qualified-column native SQL).
  - 500: internal invariant violation (pre-execution DDL guard); QP read-back
         failure.

  Response shape (all cases):
  - Passed/failed: `{:status \"passed\"|\"failed\", :diff <report>, :test_run_id nil}`
  - Error: `{:status \"error\", :error {:type <str>, :message <str>}, :test_run_id nil}`

  `:test_run_id` is `nil` in this synchronous implementation; it is reserved
  for a future async polling variant that can be added without breaking this
  response shape."
  {:multipart true}
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   _body
   {{:strs [expected options] :as multipart-params} :multipart-params}]
  (let [transform (api/read-check :model/Transform id)]
    (transforms.core/check-feature-enabled! transform)
    (api/check (not (transforms.core/transform-locked? transform))
               [402 {:message    (deferred-tru "Transforms are temporarily locked because the trial quota has been reached.")
                     :error-code "metabase_transforms_locked"}])
    (run-test-run! transform multipart-params)))

;;; ---------------------------------------------------------------------------
;;; GET /:id/test-run/inputs — required input tables for the test-run UI
;;; ---------------------------------------------------------------------------

(def ^:private InputTableResponse
  "Malli schema for a single entry in the inputs response.

  `:table_id` — app-DB Table id (integer); the key to use in `input-<table-id>` multipart parts.
  `:schema`   — DB schema string (e.g. \"public\").
  `:name`     — physical table name string (e.g. \"orders\").
  `:columns`  — ordered list of column name strings the fixture CSV header must contain."
  [:map {:closed true}
   [:table_id pos-int?]
   [:schema   :string]
   [:name     :string]
   [:columns  [:sequential :string]]])

(api.macros/defendpoint :get "/:id/test-run/inputs" :- [:map
                                                        [:status pos-int?]
                                                        [:body :any]]
  "Return the required input tables for a transform's test run.

  The response is a vector of table descriptors — one per input table the
  transform depends on. Each descriptor carries the information the frontend
  needs to render an upload dropzone labelled with the table name and the
  exact column headers the user's CSV must contain.

  Error → HTTP status mapping:
  - 402: feature flag off (transforms premium feature not enabled).
  - 403: caller lacks read access to the transform.
  - 422: transform type not supported (e.g. Python); cannot determine input
         tables; referenced table not synced."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (let [transform (api/read-check :model/Transform id)]
    (transforms.core/check-feature-enabled! transform)
    (try
      (let [transform-value {:source (:source transform)
                             :target (:target transform)}
            tables          (transforms.core/required-input-tables transform-value)]
        {:status 200
         :body   (mapv (fn [t]
                         {:table_id (:id t)
                          :schema   (:schema t)
                          :name     (:name t)
                          :columns  (mapv :name (:columns t))})
                       tables)})
      (catch clojure.lang.ExceptionInfo e
        (let [error-type  (:error-type (ex-data e))
              http-status (get test-run-error-http-status error-type)]
          (if http-status
            {:status http-status
             :body   (error->response e)}
            (throw e)))))))

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

(ns metabase.transforms-rest.api.transform-test-run
  "Generalized chained test-run endpoint: `/api/transform-test/:target-type/:id/…`.

  One address that carries the target *type* (`transform` | `card`); the handler
  branches on it. The multipart request contract, the response shape, and the
  error→HTTP-status mapping are identical across types — the branches differ only
  in the read-check and which orchestrator/inputs fn they call. The shared HTTP
  helpers (parsing, response shaping, schemas, error mapping) live in
  `metabase.transforms-rest.api.util`."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.transforms-rest.api.util :as api-util]
   [metabase.transforms.core :as transforms.core]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.json :as json]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def keep-me
  "Loaded for side effects (registers this ns's endpoints); referenced from the
  api-routes require list."
  nil)

(defn- parse-source-ids
  "Parse the `sources` multipart part — a JSON array of selected source transform
  ids — into a set of positive integers. Missing part → `#{}` (a target-only
  selection — the degenerate case equivalent to a single-transform test run).
  Throws 400 on malformed JSON or a non-positive-int element."
  [sources-part]
  (if (nil? sources-part)
    #{}
    (let [raw  (if (map? sources-part) (:tempfile sources-part) sources-part)
          text (if (instance? java.io.File raw) (slurp raw) (str raw))
          ids  (try
                 (json/decode text)
                 (catch Exception _
                   (throw (ex-info (tru "Malformed ''sources'' part: not valid JSON.")
                                   {:status-code 400
                                    :raw-text    text}))))]
      (when-not (and (sequential? ids) (every? #(and (int? %) (pos? %)) ids))
        (throw (ex-info (tru "''sources'' must be a JSON array of positive transform ids.")
                        {:status-code 400
                         :sources     ids})))
      (set ids))))

(defn- run-subgraph-test-run!
  "Execute a chained (sub-graph) test run for target transform `target-id` from
  parsed multipart params.

  Reads the `expected` file part (optional when `assertions` is non-empty), the
  `sources` JSON part (selected boundary source ids), the `input-<id>` leaf
  fixtures, the `options` JSON part, and the `assertions` JSON part, then
  delegates to `transforms.core/run-chain-test!`.

  Returns the HTTP response map directly. Never throws — typed errors are mapped
  via `api-util/test-run-error-http-status`; unknown errors become 500."
  [target-id multipart-params]
  (let [expected-part   (get multipart-params "expected")
        assertions-part (get multipart-params "assertions")
        parsed-assertions (api-util/parse-assertions assertions-part)]
    ;; At least one of expected or assertions must be present.
    (when (and (nil? expected-part) (empty? parsed-assertions))
      (throw (ex-info (tru "One of ''expected'' or ''assertions'' must be provided.")
                      {:status-code 400})))
    (let [expected-file  (when expected-part (:tempfile expected-part))
          source-ids     (parse-source-ids (get multipart-params "sources"))
          fixtures-by-id (api-util/parse-input-table-ids multipart-params #{"sources" "assertions"})
          opts           (assoc (api-util/parse-test-run-options (get multipart-params "options"))
                                :assertions parsed-assertions)]
      (try
        (let [record (transforms.core/run-chain-test! target-id source-ids fixtures-by-id expected-file opts)]
          {:status 200
           :body   (api-util/run-record->response record)})
        (catch clojure.lang.ExceptionInfo e
          (let [error-type  (:error-type (ex-data e))
                http-status (get api-util/test-run-error-http-status error-type)]
            (if http-status
              {:status http-status
               :body   (api-util/error->response e)}
              (throw e))))))))

(defn- run-card-subgraph-test-run!
  "Execute a chained (sub-graph) test run whose target is Card `card` from parsed
  multipart params — the card analogue of `run-subgraph-test-run!`.

  Returns the HTTP response map directly. Never throws — typed errors are mapped
  via `api-util/test-run-error-http-status`; unknown errors become 500."
  [card multipart-params]
  (let [expected-part   (get multipart-params "expected")
        assertions-part (get multipart-params "assertions")
        parsed-assertions (api-util/parse-assertions assertions-part)]
    ;; At least one of expected or assertions must be present.
    (when (and (nil? expected-part) (empty? parsed-assertions))
      (throw (ex-info (tru "One of ''expected'' or ''assertions'' must be provided.")
                      {:status-code 400})))
    (let [expected-file  (when expected-part (:tempfile expected-part))
          source-ids     (parse-source-ids (get multipart-params "sources"))
          fixtures-by-id (api-util/parse-input-table-ids multipart-params #{"sources" "assertions"})
          opts           (assoc (api-util/parse-test-run-options (get multipart-params "options"))
                                :assertions parsed-assertions)]
      (try
        (let [record (transforms.core/run-card-chain-test! card source-ids fixtures-by-id expected-file opts)]
          {:status 200
           :body   (api-util/run-record->response record)})
        (catch clojure.lang.ExceptionInfo e
          (let [error-type  (:error-type (ex-data e))
                http-status (get api-util/test-run-error-http-status error-type)]
            (if http-status
              {:status http-status
               :body   (api-util/error->response e)}
              (throw e))))))))

(defn- inputs-response
  "Shape `(tables-thunk)` (a thunk returning leaf table-infos) into the inputs
  response, mapping typed test-run errors to HTTP statuses."
  [tables-thunk]
  (try
    {:status 200
     :body   (mapv api-util/input-table->response (tables-thunk))}
    (catch clojure.lang.ExceptionInfo e
      (let [error-type  (:error-type (ex-data e))
            http-status (get api-util/test-run-error-http-status error-type)]
        (if http-status
          {:status http-status
           :body   (api-util/error->response e)}
          (throw e))))))

(api.macros/defendpoint :post "/:target-type/:id/subgraph" :- [:map
                                                               [:status pos-int?]
                                                               [:body api-util/TestRunResponse]]
  "Run a synchronous *chained* (sub-graph) test run whose target is identified by
  `target-type` (`transform` | `card`) and `id`.

  The multipart contract, response shape, and error→HTTP mapping match the
  transform-target run: parts `sources` (optional JSON id array), `input-<table-id>`
  (one CSV per boundary leaf), `expected` (CSV), `options` (optional JSON;
  `ignore_columns`). The required leaves are what `GET …/subgraph-inputs` returns
  for the same `(target-type, id, sources)` selection.

  `card` covers questions, models, and metric cards (`:type :metric`). Read access
  to the target is enforced (`read-check` Transform or Card)."
  {:multipart true}
  [{:keys [target-type id]} :- [:map
                                [:target-type [:enum "transform" "card"]]
                                [:id ms/PositiveInt]]
   _query-params
   _body
   {{:as multipart-params} :multipart-params}]
  (case target-type
    "transform"
    (let [transform (api/read-check :model/Transform id)]
      (transforms.core/check-feature-enabled! transform)
      (api/check (not (transforms.core/transform-locked? transform))
                 [402 {:message    (deferred-tru "Transforms are temporarily locked because the trial quota has been reached.")
                       :error-code "metabase_transforms_locked"}])
      (run-subgraph-test-run! id multipart-params))

    "card"
    (let [card (api/read-check :model/Card id)]
      (run-card-subgraph-test-run! card multipart-params))))

(api.macros/defendpoint :get "/:target-type/:id/subgraph-inputs" :- [:map
                                                                     [:status pos-int?]
                                                                     [:body [:or
                                                                             [:sequential api-util/InputTableResponse]
                                                                             [:map [:status [:= "error"]]]]]]
  "Return the boundary leaf input tables for a chained test run whose target is
  identified by `target-type` (`transform` | `card`) and `id`, with selected
  sources from the repeatable `sources` query param.

  A vector of `{table_id, schema, name, columns}` descriptors — one fixture CSV per
  entry is required for `POST …/subgraph`. Same shape for both target types."
  [{:keys [target-type id]} :- [:map
                                [:target-type [:enum "transform" "card"]]
                                [:id ms/PositiveInt]]
   {:keys [sources]} :- [:map
                         [:sources {:optional true} [:maybe (ms/QueryVectorOf ms/PositiveInt)]]]]
  (case target-type
    "transform"
    (let [transform (api/read-check :model/Transform id)]
      (transforms.core/check-feature-enabled! transform)
      (inputs-response #(transforms.core/subgraph-input-tables id (set sources) (t2/select :model/Transform))))

    "card"
    (let [card (api/read-check :model/Card id)]
      (inputs-response #(transforms.core/card-subgraph-input-tables card (set sources) (t2/select :model/Transform))))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/transform-test` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))

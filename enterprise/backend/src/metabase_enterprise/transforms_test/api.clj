(ns metabase-enterprise.transforms-test.api
  "Chained test-run endpoints: `/api/ee/transform-test/:target-type/:id/…`, where
  `target-type` is `transform` or `card`. The multipart contract, response shape,
  and error→HTTP-status mapping are the same for both target types."
  (:require
   [metabase-enterprise.transforms-test.api.util :as api-util]
   [metabase-enterprise.transforms-test.core :as test-run.core]
   [metabase-enterprise.transforms-test.subgraph :as subgraph]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.premium-features.core :as premium-features]
   [metabase.transforms.core :as transforms.core]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def keep-me
  "Loaded for side effects (registers this ns's endpoints)."
  nil)

(defn- check-test-run-allowed!
  "Throw a 402 unless the run is allowed: the instance must have the `:dependencies`
  capability, and every transform the run exercises must have its per-type feature
  enabled and not be locked. `slice-transforms-thunk` returns those transforms."
  [slice-transforms-thunk]
  (api/check (premium-features/has-feature? :dependencies)
             [402 {:message    (deferred-tru "Transform test runs require the Dependency Tracking feature.")
                   :error-code "metabase_transforms_test_run_unavailable"}])
  (doseq [transform (slice-transforms-thunk)]
    (transforms.core/check-feature-enabled! transform)
    (api/check (not (transforms.core/transform-locked? transform))
               [402 {:message    (deferred-tru "Transforms are temporarily locked because the trial quota has been reached.")
                     :error-code "metabase_transforms_locked"}])))

(defn- transform-slice-transforms
  "The transforms exercised by a transform-target run — the sub-graph slice."
  [target-id source-ids all-transforms]
  (let [{:keys [slice]} (subgraph/resolve-subgraph target-id source-ids all-transforms)]
    (keep (u/index-by :id all-transforms) slice)))

(defn- card-slice-transforms
  "The transforms exercised by a card-target run — the sub-graph slice."
  [card source-ids all-transforms]
  (let [{:keys [slice]} (subgraph/card->necessary-fixtures card source-ids all-transforms)]
    (keep (u/index-by :id all-transforms) slice)))

(defn- test-run-response
  "Call `thunk`; a typed test-run error (an ExceptionInfo whose `:error-type`
  maps to an HTTP status) becomes an error-response map; anything else
  propagates."
  [thunk]
  (try
    (thunk)
    (catch clojure.lang.ExceptionInfo e
      (let [http-status (get api-util/test-run-error-http-status (:error-type (ex-data e)))]
        (if http-status
          {:status http-status
           :body   (api-util/error->response e)}
          (throw e))))))

(defn- run-test-run!
  "Shared POST body for both target types. Parses the multipart contract, then
  calls the target-specific holes with one `:model/Transform` snapshot shared
  between the permission check and the run:

  - `(slice-transforms source-ids all-transforms)` — the transforms the run exercises.
  - `(run source-ids fixtures-by-id expected-file opts all-transforms)` — the run
    itself, returning a run record.

  Returns an HTTP response map; typed test-run errors become error responses,
  other exceptions propagate."
  [multipart-params {:keys [slice-transforms run]}]
  (let [expected-part     (get multipart-params "expected")
        parsed-assertions (api-util/parse-assertions (get multipart-params "assertions"))]
    (when (and (nil? expected-part) (empty? parsed-assertions))
      (throw (ex-info (tru "One of ''expected'' or ''assertions'' must be provided.")
                      {:status-code 400})))
    (let [expected-file  (when expected-part (:tempfile expected-part))
          source-ids     (api-util/parse-source-ids (get multipart-params "sources"))
          fixtures-by-id (api-util/parse-input-table-ids multipart-params #{"sources" "assertions"})
          opts           (assoc (api-util/parse-test-run-options (get multipart-params "options"))
                                :assertions parsed-assertions)]
      (test-run-response
       (fn []
         (let [all-transforms (t2/select :model/Transform)]
           (check-test-run-allowed! #(slice-transforms source-ids all-transforms))
           {:status 200
            :body   (api-util/run-record->response
                     (run source-ids fixtures-by-id expected-file opts all-transforms))}))))))

(defn- inputs-response
  "Shape `(tables-thunk)` (a thunk returning leaf table-infos) into the inputs
  response, mapping typed test-run errors to HTTP statuses."
  [tables-thunk]
  (test-run-response
   (fn []
     {:status 200
      :body   (mapv api-util/input-table->response (tables-thunk))})))

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
    (do (api/read-check :model/Transform id)
        (run-test-run!
         multipart-params
         {:slice-transforms (fn [source-ids all-transforms]
                              (transform-slice-transforms id source-ids all-transforms))
          :run              (fn [source-ids fixtures-by-id expected-file opts all-transforms]
                              (test-run.core/run-chain-test!
                               id source-ids fixtures-by-id expected-file opts all-transforms))}))

    "card"
    (let [card (api/read-check :model/Card id)]
      (run-test-run!
       multipart-params
       {:slice-transforms (fn [source-ids all-transforms]
                            (card-slice-transforms card source-ids all-transforms))
        :run              (fn [source-ids fixtures-by-id expected-file opts all-transforms]
                            (test-run.core/run-card-chain-test!
                             card source-ids fixtures-by-id expected-file opts all-transforms))}))))

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
    (do (api/read-check :model/Transform id)
        (inputs-response
         (fn []
           (let [all-transforms (t2/select :model/Transform)]
             (check-test-run-allowed! #(transform-slice-transforms id (set sources) all-transforms))
             (test-run.core/subgraph-input-tables id (set sources) all-transforms)))))

    "card"
    (let [card (api/read-check :model/Card id)]
      (inputs-response
       (fn []
         (let [all-transforms (t2/select :model/Transform)]
           (check-test-run-allowed! #(card-slice-transforms card (set sources) all-transforms))
           (test-run.core/card-subgraph-input-tables card (set sources) all-transforms)))))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/transform-test` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))

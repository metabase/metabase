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
   [metabase.transforms.core :as transforms.core]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn- check-test-run-allowed!
  "Throw a 402 unless every transform the run exercises has its per-type feature
  enabled and is not locked. `slice-transforms-thunk` returns those transforms.
  The instance-level `:dependencies` gate is the route's, not this fn's."
  [slice-transforms-thunk]
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
  (let [{:keys [slice]} (subgraph/resolve-card-subgraph card source-ids all-transforms)]
    (keep (u/index-by :id all-transforms) slice)))

(defn- test-run-response
  "Call `thunk`; a typed test-run error (an ExceptionInfo whose `:error-type`
  maps to an HTTP status) becomes an error-response map; anything else
  propagates."
  [thunk]
  (try
    (thunk)
    (catch clojure.lang.ExceptionInfo e
      (if-let [http-status (get api-util/test-run-error-http-status (:error-type (ex-data e)))]
        {:status http-status
         :body   (api-util/error->response e)}
        (throw e)))))

(defn- run-test-run!
  "Parse the multipart contract, check the run is allowed, and execute it via
  two caller-supplied fns. Both receive `all-transforms`, one snapshot of every
  `:model/Transform`:

  - `(slice-transforms source-ids all-transforms)` — the transforms the run
    exercises; these must pass the permission check.
  - `(run source-ids fixtures-by-id expected-file opts all-transforms)` — the
    run itself, returning a run record.

  Returns an HTTP response map; typed test-run errors become error responses,
  other exceptions propagate."
  [multipart-params {:keys [slice-transforms run]}]
  (let [validate-expectations!
        (fn [expected-part parsed-assertions]
          (when (and (nil? expected-part) (empty? parsed-assertions))
            (throw (ex-info (tru "One of ''expected'' or ''assertions'' must be provided.")
                            {:status-code 400}))))
        expected-part     (get multipart-params "expected")
        parsed-assertions (api-util/parse-assertions (get multipart-params "assertions"))
        _                 (validate-expectations! expected-part parsed-assertions)
        expected-file     (when expected-part (:tempfile expected-part))
        source-ids        (api-util/parse-source-ids (get multipart-params "sources"))
        fixtures-by-id    (api-util/parse-input-table-ids multipart-params #{"sources" "assertions"})
        opts              (assoc (api-util/parse-test-run-options (get multipart-params "options"))
                                 :assertions parsed-assertions)]
    (test-run-response
     (fn []
       (let [all-transforms (t2/select :model/Transform)]
         (check-test-run-allowed! #(slice-transforms source-ids all-transforms))
         {:status 200
          :body   (api-util/run-record->response
                   (run source-ids fixtures-by-id expected-file opts all-transforms))})))))

(defn- inputs-response!
  "Resolve the boundary leaf input tables via two caller-supplied fns. Both
  receive `all-transforms`, one snapshot of every `:model/Transform`:

  - `(slice-transforms all-transforms)` — the transforms the run would
    exercise; these must pass the permission check.
  - `(input-tables all-transforms)` — the boundary leaf table-infos,
    `{:keys [id schema name columns]}` maps.

  Returns an HTTP response map; typed test-run errors become error responses,
  other exceptions propagate."
  [{:keys [slice-transforms input-tables]}]
  (test-run-response
   (fn []
     (let [all-transforms (t2/select :model/Transform)]
       (check-test-run-allowed! #(slice-transforms all-transforms))
       {:status 200
        :body   (mapv api-util/input-table->response (input-tables all-transforms))}))))

(api.macros/defendpoint :post "/:target-type/:id/subgraph" :- [:map
                                                               [:status pos-int?]
                                                               [:body api-util/TestRunResponse]]
  "Run a synchronous *chained* (sub-graph) test run whose target is identified by
  `target-type` (`transform` | `card`) and `id`.

  Multipart parts: `sources` (optional JSON id array), `input-<table-id>`
  (one CSV per boundary leaf), `expected` (CSV), `assertions` (JSON array of
  `{name, sql, severity}`), `options` (optional JSON; `ignore_columns`). At
  least one of `expected` or `assertions` is required. The required leaves are
  what `GET …/subgraph-inputs` returns for the same `(target-type, id, sources)`
  selection.

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
         {:slice-transforms (partial transform-slice-transforms id)
          :run              (partial test-run.core/run-chain-test! id)}))

    "card"
    (let [card (api/read-check :model/Card id)]
      (run-test-run!
       multipart-params
       {:slice-transforms (partial card-slice-transforms card)
        :run              (partial test-run.core/run-card-chain-test! card)}))))

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
  (let [source-ids (set sources)]
    (case target-type
      "transform"
      (do (api/read-check :model/Transform id)
          (inputs-response!
           {:slice-transforms (partial transform-slice-transforms id source-ids)
            :input-tables     (partial test-run.core/subgraph-input-tables id source-ids)}))

      "card"
      (let [card (api/read-check :model/Card id)]
        (inputs-response!
         {:slice-transforms (partial card-slice-transforms card source-ids)
          :input-tables     (partial test-run.core/card-subgraph-input-tables card source-ids)})))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/transform-test` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))

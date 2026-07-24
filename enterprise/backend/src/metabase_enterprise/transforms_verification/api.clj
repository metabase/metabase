(ns metabase-enterprise.transforms-verification.api
  "Chained test-run endpoints: `/api/ee/transform-test/:target-type/:id/…`, where
  `target-type` is `transform` or `card`. The multipart contract, response shape,
  and error→HTTP-status mapping are the same for both target types."
  (:require
   [metabase-enterprise.transforms-verification.api.util :as api-util]
   [metabase-enterprise.transforms-verification.chain :as chain]
   [metabase-enterprise.transforms-verification.subgraph :as subgraph]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.lib.core :as lib]
   [metabase.permissions.core :as perms]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.core :as transforms.core]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- check-native-query-perms!
  "Throw 403 unless the current user holds native create-queries permission on
  `db-id`. A test run executes raw SQL — rewritten transforms, compiled cards,
  user assertions — against that database, so it requires the same permission
  as the SQL editor. nil `db-id` passes: the run itself fails typed
  (`::errors/missing-database-id`)."
  [db-id]
  (when db-id
    (api/check-403
     (= (perms/full-db-permission-for-user api/*current-user-id* :perms/create-queries db-id)
        :query-builder-and-native))))

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
        validate-expected-file!
        (fn [expected-part]
          ;; Left unvalidated, a present-but-non-file `expected` (e.g. a text form
          ;; field, whose value has no `:tempfile`) silently skips the diff and
          ;; reports a vacuous "passed". Reject it, mirroring the input parts'
          ;; file-upload check.
          (when (and (some? expected-part) (not (:tempfile expected-part)))
            (throw (ex-info (tru "Multipart part ''expected'' must be a file upload.")
                            {:status-code 400}))))
        expected-part     (get multipart-params "expected")
        parsed-assertions (api-util/parse-assertions (get multipart-params "assertions"))
        _                 (validate-expectations! expected-part parsed-assertions)
        _                 (validate-expected-file! expected-part)
        expected-file     (when expected-part (:tempfile expected-part))
        source-ids        (api-util/parse-source-ids (get multipart-params "sources"))
        fixtures-by-id    (api-util/parse-input-table-ids multipart-params #{"sources" "assertions"})
        ;; TODO(GHY-4188 follow-up): the `options` `isolation_id` — a
        ;; database-isolation handle the run executes inside — is optional for
        ;; now. Once the consumer-side premium gate lands (likely
        ;; :transform-verification), it slots in HERE: gate the endpoint on the
        ;; feature and require a valid isolation id (provisioning one when
        ;; absent) for drivers with an isolation impl, so no run can touch the
        ;; warehouse outside a confined-principal frame. Deferred product
        ;; decision — do not invent the feature flag ahead of it.
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

(api.macros/defendpoint :post "/:target-type/:id/run" :- [:map
                                                          [:status pos-int?]
                                                          [:body api-util/TestRunResponse]]
  "Run a synchronous *chained* (sub-graph) test run whose target is identified by
  `target-type` (`transform` | `card`) and `id`.

  Multipart parts: `sources` (optional JSON id array), `input-<table-id>`
  (one CSV per boundary leaf), `expected` (CSV), `assertions` (JSON array of
  `{name, sql, severity}`), `options` (optional JSON; `ignore_columns`). At
  least one of `expected` or `assertions` is required. The required leaves are
  what `GET …/inputs` returns for the same `(target-type, id, sources)`
  selection.

  `card` covers questions, models, and metric cards (`:type :metric`). Enforced
  before any warehouse work: read access to the target (`read-check` Transform or
  Card) and native create-queries permission on the target's database."
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
      (check-native-query-perms! (transforms-base.u/transform-source-database transform))
      (run-test-run!
       multipart-params
       {:slice-transforms (partial transform-slice-transforms id)
        :run              (partial chain/run-chain-test! id)}))

    "card"
    (let [card (api/read-check :model/Card id)]
      (check-native-query-perms! (lib/database-id (:dataset_query card)))
      (run-test-run!
       multipart-params
       {:slice-transforms (partial card-slice-transforms card)
        :run              (partial chain/run-card-chain-test! card)}))))

(api.macros/defendpoint :get "/:target-type/:id/inputs" :- [:map
                                                            [:status pos-int?]
                                                            [:body [:or
                                                                    [:sequential api-util/InputTableResponse]
                                                                    [:map [:status [:= "error"]]]]]]
  "Return the boundary leaf input tables for a chained test run whose target is
  identified by `target-type` (`transform` | `card`) and `id`, with selected
  sources from the repeatable `sources` query param.

  A vector of `{table_id, schema, name, columns}` descriptors — one fixture CSV per
  entry is required for `POST …/run`. Same shape for both target types.

  Enforced: read access to the target (`read-check` Transform or Card) and native
  create-queries permission on the target's database."
  [{:keys [target-type id]} :- [:map
                                [:target-type [:enum "transform" "card"]]
                                [:id ms/PositiveInt]]
   {:keys [sources]} :- [:map
                         [:sources {:optional true} [:maybe (ms/QueryVectorOf ms/PositiveInt)]]]]
  (let [source-ids (set sources)]
    (case target-type
      "transform"
      (let [transform (api/read-check :model/Transform id)]
        (check-native-query-perms! (transforms-base.u/transform-source-database transform))
        (inputs-response!
         {:slice-transforms (partial transform-slice-transforms id source-ids)
          :input-tables     (partial chain/subgraph-input-tables id source-ids)}))

      "card"
      (let [card (api/read-check :model/Card id)]
        (check-native-query-perms! (lib/database-id (:dataset_query card)))
        (inputs-response!
         {:slice-transforms (partial card-slice-transforms card source-ids)
          :input-tables     (partial chain/card-subgraph-input-tables card source-ids)})))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/transform-test` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))

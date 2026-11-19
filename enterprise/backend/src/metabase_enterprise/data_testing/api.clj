(ns metabase-enterprise.data-testing.api
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.errors :as data-testing.errors]
   [metabase-enterprise.data-testing.models :as data-testing.models]
   [metabase-enterprise.data-testing.runner :as data-testing.runner]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mu/defn- refusing :- [:maybe ::data-testing.schema/run-result]
  "Call `thunk`, rethrowing a typed refusal as [[data-testing.errors/refusing]] does, under the `transform-test` prefix."
  [thunk :- ifn?]
  (data-testing.errors/refusing "transform-test" thunk))

(api.macros/defendpoint :get "/" :- [:sequential ::data-testing.schema/transform-test.response]
  "List the transform tests with their newest runs, optionally only those of one transform."
  [_route-params
   {:keys [transform-id]} :- [:map {:closed true}
                              [:transform-id {:optional true} [:maybe ms/PositiveInt]]]]
  (api/check-data-studio-access)
  (-> (mi/readable (data-testing.db/transform-tests {:transform-id transform-id}))
      (t2/hydrate :last_run)))

(api.macros/defendpoint :get "/:id" :- ::data-testing.schema/transform-test.response
  "Get a transform test with its newest run."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (-> (api/read-check :model/TransformTest id)
      (t2/hydrate :last_run)))

(api.macros/defendpoint :post "/" :- ::data-testing.schema/transform-test
  "Create a transform test.

  An input that gives rows must declare every column that the transform's query reads from the input's table. A test
  whose input lacks such a column is refused, naming the table and the columns. The check covers only the columns that
  the SQL parser places on one table. It skips the tables that Metabase hides, and the columns marked sensitive or
  retired. A test that it accepts can still fail when it runs. On a database that keeps the case of column names, a
  declared name that differs from the table's only in case does not match it."
  [_route-params
   _query-params
   {:keys [transform_id] :as body} :- ::data-testing.schema/transform-test.create]
  (api/create-check :model/TransformTest body)
  (refusing #(data-testing.runner/validate-test :transform
                                                (data-testing.db/transform transform_id)
                                                (data-testing.runner/test-definition body)))
  (data-testing.models/create-transform-test! (assoc body :creator_id api/*current-user-id*)))

(api.macros/defendpoint :put "/:id" :- ::data-testing.schema/transform-test
  "Update a transform test."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]
   _query-params
   body :- ::data-testing.schema/transform-test.update]
  (let [transform-test (api/read-check :model/TransformTest id)]
    (api/update-check transform-test body)
    (when (some #(contains? body %) (cons :transform_id data-testing.runner/definition-keys))
      (let [{:keys [transform_id] :as merged} (merge transform-test body)]
        (refusing #(data-testing.runner/validate-test :transform
                                                      (data-testing.db/transform transform_id)
                                                      (data-testing.runner/test-definition merged)))))
    (when (seq body)
      (data-testing.models/update-transform-test! id body)))
  (data-testing.db/transform-test id))

(api.macros/defendpoint :delete "/:id" :- :nil
  "Delete a transform test."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (api/write-check :model/TransformTest id)
  (data-testing.models/delete-transform-test! id)
  nil)

(api.macros/defendpoint :post "/:id/run" :- ::data-testing.schema/run-result
  "Run a transform test. Needs read access to the test and its transform, and native query access to the transform's
  source database: a test's inputs and expectations are SQL run on that database.

  A 200 means the run happened: `:status` is then `passed` or `failed`, and every expectation
  reports what it found — including one that could not be evaluated, which comes back as that
  expectation's own `:error` rather than discarding the answers of the others.

  Any other status means the run was refused and nothing meaningful ran; the body then carries the `:error-code`
  naming which refusal it was, as [[refusing]] describes."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (let [transform-test (api/read-check :model/TransformTest id)
        transform      (api/read-check :model/Transform (:transform_id transform-test))]
    (api/check-403 (data-testing.models/can-run-test? (:id transform)))
    (refusing #(data-testing.runner/run-test! :transform transform transform-test))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/transform-test` routes."
  (api.macros/ns-handler *ns* +auth))

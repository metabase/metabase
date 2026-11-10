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
  (-> (filter mi/can-read? (data-testing.db/transform-tests {:transform-id transform-id}))
      (t2/hydrate :last_run)))

(api.macros/defendpoint :get "/:id" :- ::data-testing.schema/transform-test.response
  "Get a transform test with its newest run."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (-> (api/read-check :model/TransformTest id)
      (t2/hydrate :last_run)))

(api.macros/defendpoint :post "/" :- ::data-testing.schema/transform-test
  "Create a transform test."
  [_route-params
   _query-params
   {:keys [transform_id inputs expectations] :as body} :- ::data-testing.schema/transform-test.create]
  (api/create-check :model/TransformTest body)
  (refusing #(data-testing.runner/validate-test :transform
                                                (data-testing.db/transform transform_id)
                                                inputs
                                                expectations))
  (data-testing.db/insert-transform-test! (assoc body :creator_id api/*current-user-id*)))

(api.macros/defendpoint :put "/:id" :- ::data-testing.schema/transform-test
  "Update a transform test."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]
   _query-params
   body :- ::data-testing.schema/transform-test.update]
  (let [transform-test (api/read-check :model/TransformTest id)]
    (api/update-check transform-test body)
    (when (some #(contains? body %) [:transform_id :inputs :expectations])
      (let [{:keys [transform_id inputs expectations]} (merge transform-test body)]
        (refusing #(data-testing.runner/validate-test :transform
                                                      (data-testing.db/transform transform_id)
                                                      inputs
                                                      expectations))))
    (when (seq body)
      (data-testing.db/update-transform-test! id body)))
  (data-testing.db/transform-test id))

(api.macros/defendpoint :delete "/:id" :- :nil
  "Delete a transform test."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (api/write-check :model/TransformTest id)
  (data-testing.db/delete-transform-test! id)
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

(ns metabase-enterprise.transform-testing.api
  (:require
   [metabase-enterprise.transform-testing.db :as transform-testing.db]
   [metabase-enterprise.transform-testing.errors :as transform-testing.errors]
   [metabase-enterprise.transform-testing.runner :as transform-testing.runner]
   [metabase-enterprise.transform-testing.schema :as transform-testing.schema]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.models.interface :as mi]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(defn- refusing
  "Call `thunk`, rethrowing a typed transform-test refusal as the status and `:error-code` it publishes.

  400 — the test is wrong, and its author can fix it.
  422 — the test is fine; the transform or its database prevents a run here.
  501 — the test asks for something not built yet."
  [thunk]
  (try
    (thunk)
    (catch clojure.lang.ExceptionInfo e
      (if-let [error-type (:error-type (ex-data e))]
        (throw (ex-info (ex-message e)
                        (assoc (dissoc (ex-data e) :error-type)
                               :status-code (transform-testing.errors/status-code error-type)
                               :error-code  (transform-testing.errors/code error-type))))
        (throw e)))))

(api.macros/defendpoint :get "/" :- [:sequential ::transform-testing.schema/transform-test]
  "List the transform tests, optionally only those of one transform."
  [_route-params
   {:keys [transform-id]} :- [:map {:closed true}
                              [:transform-id {:optional true} [:maybe ms/PositiveInt]]]]
  (api/check-data-analyst)
  (filter mi/can-read? (transform-testing.db/transform-tests {:transform-id transform-id})))

(api.macros/defendpoint :get "/:id" :- ::transform-testing.schema/transform-test
  "Get a transform test."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (api/read-check (transform-testing.db/transform-test id)))

(api.macros/defendpoint :post "/" :- ::transform-testing.schema/transform-test
  "Create a transform test."
  [_route-params
   _query-params
   {:keys [transform_id inputs expectations] :as body} :- ::transform-testing.schema/transform-test.create]
  (api/write-check :model/Transform transform_id)
  (refusing #(transform-testing.runner/validate-transform-test transform_id inputs expectations))
  (transform-testing.db/insert-transform-test! (assoc body :creator_id api/*current-user-id*)))

(api.macros/defendpoint :put "/:id" :- ::transform-testing.schema/transform-test
  "Update a transform test."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]
   _query-params
   {:keys [transform_id] :as body} :- ::transform-testing.schema/transform-test.update]
  (let [transform-test (api/write-check (transform-testing.db/transform-test id))]
    (when transform_id
      (api/write-check :model/Transform transform_id))
    (when (seq body)
      (when (some #(contains? body %) [:transform_id :inputs :expectations])
        (let [{:keys [transform_id inputs expectations]} (merge transform-test body)]
          (refusing #(transform-testing.runner/validate-transform-test transform_id inputs expectations))))
      (transform-testing.db/update-transform-test! id body)))
  (transform-testing.db/transform-test id))

(api.macros/defendpoint :delete "/:id" :- :nil
  "Delete a transform test."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (api/write-check (transform-testing.db/transform-test id))
  (transform-testing.db/delete-transform-test! id)
  nil)

(api.macros/defendpoint :post "/:id/run" :- ::transform-testing.schema/run-result
  "Run a transform test.

  A 200 means the run happened: `:status` is then `passed` or `failed`, and every expectation
  reports what it found — including one that could not be evaluated, which comes back as that
  expectation's own `:error` rather than discarding the answers of the others.

  Any other status means the run was refused and nothing meaningful ran; the body then carries the `:error-code`
  naming which refusal it was, as [[refusing]] describes."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (refusing #(-> (transform-testing.db/transform-test id)
                 api/write-check
                 transform-testing.runner/run-transform-test!)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/transform-test` routes."
  (api.macros/ns-handler *ns* +auth))

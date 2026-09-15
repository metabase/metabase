(ns metabase.transform-testing.api
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.models.interface :as mi]
   [metabase.transform-testing.db :as transform-testing.db]
   [metabase.transform-testing.errors :as transform-testing.errors]
   [metabase.transform-testing.runner :as transform-testing.runner]
   [metabase.transform-testing.schema :as transform-testing.schema]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

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
   body :- ::transform-testing.schema/transform-test.create]
  (api/write-check :model/Transform (:transform_id body))
  (transform-testing.db/insert-transform-test! (assoc body :creator_id api/*current-user-id*)))

(api.macros/defendpoint :put "/:id" :- ::transform-testing.schema/transform-test
  "Update a transform test."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]
   _query-params
   body :- ::transform-testing.schema/transform-test.update]
  (api/write-check (transform-testing.db/transform-test id))
  (when-let [transform-id (:transform_id body)]
    (api/write-check :model/Transform transform-id))
  (when (seq body)
    (transform-testing.db/update-transform-test! id body))
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

  Any other status means the run was refused and nothing meaningful ran. The body then carries an
  `:error-code` naming which refusal it was, drawn from
  `metabase.transform-testing.errors/all`."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  ;; The app-db read is inside the `try` on purpose: reading a transform test constructs its
  ;; expectations, so a stored test that no longer satisfies its own constructor throws HERE, and
  ;; outside the `try` that escaped untyped and surfaced as a 500.
  (try
    (-> (transform-testing.db/transform-test id)
        api/write-check
        transform-testing.runner/run-transform-test!)
    (catch clojure.lang.ExceptionInfo e
      (if-let [error-type (:error-type (ex-data e))]
        ;; `:error-code`, not a spelling of our own: `api-exception-response` returns a structured
        ;; body only for a non-500 status carrying that exact key. Anything else falls through to
        ;; the branch that attaches a stacktrace — or, where an administrator has turned
        ;; stacktraces off, to a bare "Something went wrong" with the type silently dropped.
        (throw (ex-info (ex-message e)
                        (assoc (dissoc (ex-data e) :error-type)
                               :status-code (transform-testing.errors/status-code error-type)
                               :error-code  error-type)))
        (throw e)))))

(def ^{:arglists '([request respond raise])} transform-test-routes
  "`/api/transform-test` routes."
  (api.macros/ns-handler *ns* +auth))

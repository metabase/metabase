(ns metabase-enterprise.data-testing.suite-api
  "`/api/ee/test-suite`: named lists of saved data tests. Every endpoint needs Data Studio access, and on an instance
  where remote sync keeps synced content read-only, no suite can be created, changed or deleted."
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase-enterprise.data-testing.suite :as data-testing.suite]
   [metabase-enterprise.data-testing.suite-run :as data-testing.suite-run]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.request.core :as request]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- check-writable
  "Check that the current user may enter Data Studio, and that remote sync, which syncs every suite, does not keep
  suites read-only; or throw a 403."
  []
  (api/check-data-studio-access)
  (api/check-403 (not (remote-sync/read-only?))))

(mu/defn- suite-response :- ::data-testing.schema/test-suite.response
  "The TestSuite with `id` as the current user sees it, or a 404."
  [id :- ms/PositiveInt]
  (first (data-testing.suite/with-members [(api/check-404 (data-testing.db/test-suite id))])))

(api.macros/defendpoint :get "/" :- [:sequential ::data-testing.schema/test-suite.response]
  "List the test suites, in name order, with their members.

  A member the caller cannot read is listed by its test type and entity id only, with `status` `unreadable`; a member
  naming a test this instance lacks has `status` `missing`."
  []
  (api/check-data-studio-access)
  (data-testing.suite/with-members (data-testing.db/test-suites)))

(api.macros/defendpoint :get "/:id" :- ::data-testing.schema/test-suite.response
  "Get a test suite with its members. A member the caller cannot read has `status` `unreadable` and no `test_id` or
  `name`; a member naming a test this instance lacks has `status` `missing`."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (api/check-data-studio-access)
  (suite-response id))

(api.macros/defendpoint :post "/" :- ::data-testing.schema/test-suite.response
  "Create a test suite. Its members run in the order given. Each member names a test the caller can read, by
  `test_type` and either `test_id` or `test_entity_id`; a test can be in a suite at most once."
  [_route-params
   _query-params
   {:keys [members] :as body} :- ::data-testing.schema/test-suite.create]
  (check-writable)
  (suite-response (data-testing.db/insert-test-suite! (-> body
                                                          (dissoc :members)
                                                          (assoc :creator_id api/*current-user-id*))
                                                      (data-testing.suite/member-rows members #{}))))

(api.macros/defendpoint :put "/:id" :- ::data-testing.schema/test-suite.response
  "Update a test suite. `members`, when given, replaces every member, in the order given. Each member names a test the
  caller can read, by `test_type` and either `test_id` or `test_entity_id`. To keep a member the caller cannot read, or
  one whose test is missing, name it by `test_type` and `test_entity_id`."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]
   _query-params
   body :- ::data-testing.schema/test-suite.update]
  (check-writable)
  (api/check-404 (data-testing.db/test-suite id))
  (data-testing.db/update-test-suite!
   id
   (dissoc body :members)
   (when (contains? body :members)
     (data-testing.suite/member-rows (:members body)
                                     (into #{} (map data-testing.suite/member-ref) (data-testing.db/suite-members [id])))))
  (suite-response id))

(api.macros/defendpoint :delete "/:id" :- :nil
  "Delete a test suite. The tests in it are not deleted."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (check-writable)
  (api/check-404 (data-testing.db/test-suite id))
  (data-testing.db/delete-test-suite! id)
  nil)

(api.macros/defendpoint :post "/:id/run" :- ::data-testing.schema/test-suite-run.result
  "Run the members of a test suite, in order, within the request, and record the run.

  Each member runs as its own run endpoint would run it, under the same permission rule, and reports its `status`:
  `passed` or `failed` with its `result`; `refused` with the `error` its run endpoint would have returned; `error`
  when its run failed for another reason; `forbidden` when the caller may not run it (with no name when the caller
  cannot read it); `missing` when this instance has no such test. The suite's `status` is `passed` iff every member
  passed, and `timeout` if the server stopped tracking the run while it ran."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (api/check-data-studio-access)
  (data-testing.suite-run/run-suite! (api/check-404 (data-testing.db/test-suite id))))

(api.macros/defendpoint :get "/:id/runs" :- ::data-testing.schema/test-suite-runs.response
  "List the runs of a test suite, newest first. A member's outcome never has a name or result. It has an `error` only
  when the member's test exists and the caller may run it. Every member's `status` is shown, also to a caller who
  cannot read the member's test."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (api/check-data-studio-access)
  (api/check-404 (data-testing.db/test-suite id))
  (let [limit  (or (request/limit) 20)
        offset (or (request/offset) 0)]
    {:data   (-> (data-testing.db/suite-runs id limit offset)
                 data-testing.suite/runs-for-reader
                 (t2/hydrate :initiated_by_user))
     :limit  limit
     :offset offset
     :total  (data-testing.db/suite-run-count id)}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/test-suite` routes."
  (api.macros/ns-handler *ns* +auth))

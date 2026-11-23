(ns metabase-enterprise.data-testing.suite-api
  "`/api/ee/test-suite`: named lists of saved data tests. Every endpoint needs Data Studio access, and on an instance
  where remote sync keeps synced content read-only, no suite can be created, changed, or deleted."
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.models.test-suite :as test-suite]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase-enterprise.data-testing.suite :as data-testing.suite]
   [metabase-enterprise.data-testing.suite-run :as data-testing.suite-run]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.eid-translation.core :as eid-translation]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.models.interface :as mi]
   [metabase.request.core :as request]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private CreateTestSuiteRequest
  "What a client sends to create a test suite. The members are in the order the suite runs them."
  [:map {:closed true}
   [:name        ::lib.schema.common/non-blank-string]
   [:description {:optional true} [:maybe :string]]
   [:members     [:sequential ::data-testing.schema/test-suite.member.request]]])

(def ^:private UpdateTestSuiteRequest
  "What a client sends to update a test suite. Omitted fields are left unchanged; `:members` replaces every member."
  [:map {:closed true}
   [:name        {:optional true} ::lib.schema.common/non-blank-string]
   [:description {:optional true} [:maybe :string]]
   [:members     {:optional true} [:sequential ::data-testing.schema/test-suite.member.request]]])

(mu/defn- suite-response :- ::data-testing.schema/test-suite.response
  "The TestSuite with `id` as the current user sees it. Throws a 404 when it does not exist, and a 403 when the user may
  not read it."
  [id :- ms/PositiveInt]
  (first (data-testing.suite/with-members [(api/read-check (data-testing.db/test-suite id))])))

(api.macros/defendpoint :get "/" :- [:sequential ::data-testing.schema/test-suite.response]
  "List the test suites, in name order, with their members.

  A member's `status` is `readable`, `unreadable` when the caller cannot read its test, or `missing` when this instance
  lacks the test; only a `readable` member has `test_id` and `name`."
  []
  (api/check-data-studio-access)
  (data-testing.suite/with-members (mi/readable (data-testing.db/test-suites))))

(api.macros/defendpoint :get "/:id" :- ::data-testing.schema/test-suite.response
  "Get a test suite with its members. A member's `status` is `readable`, `unreadable` when the caller cannot read its
  test, or `missing` when this instance lacks the test; only a `readable` member has `test_id` and `name`. `id` is a
  numeric id or an entity id."
  [{:keys [id]} :- [:map {:closed true}
                    [:id [:or ms/PositiveInt ms/NanoIdString]]]]
  (suite-response (eid-translation/->id-or-404 :model/TestSuite id)))

(api.macros/defendpoint :post "/" :- ::data-testing.schema/test-suite.response
  "Create a test suite. Its members run in the order given. Each member names a test the caller can read, by
  `test_type` and either `test_id` or `test_entity_id`; a test can be in a suite at most once."
  [_route-params
   _query-params
   {:keys [members] :as body} :- CreateTestSuiteRequest]
  (api/create-check :model/TestSuite body)
  (suite-response (:id (first (test-suite/create-test-suites! [(assoc body
                                                                      :creator_id api/*current-user-id*
                                                                      :members    (data-testing.suite/member-rows members #{}))])))))

(api.macros/defendpoint :put "/:id" :- ::data-testing.schema/test-suite.response
  "Update a test suite. `members`, when given, replaces every member, in the order given. Each member names a test by
  `test_type` and either `test_id` or `test_entity_id`, and the caller must be able to read the test, with one
  exception: a current member that the caller cannot read, or whose test is missing, is kept when named by `test_type`
  and `test_entity_id`. A test can be in a suite at most once. `id` is a numeric id or an entity id."
  [{id-or-entity-id :id} :- [:map {:closed true}
                             [:id [:or ms/PositiveInt ms/NanoIdString]]]
   _query-params
   body :- UpdateTestSuiteRequest]
  (let [id (eid-translation/->id-or-404 :model/TestSuite id-or-entity-id)]
    (api/update-check (api/read-check (data-testing.db/test-suite id)) body)
    (test-suite/update-test-suite!
     id
     (cond-> body
       (contains? body :members)
       (assoc :members (data-testing.suite/member-rows
                        (:members body)
                        (into #{} (map data-testing.suite/member-ref) (data-testing.db/suite-members [id]))))))
    (suite-response id)))

(api.macros/defendpoint :delete "/:id" :- :nil
  "Delete a test suite. The tests in it are not deleted. `id` is a numeric id or an entity id."
  [{id-or-entity-id :id} :- [:map {:closed true}
                             [:id [:or ms/PositiveInt ms/NanoIdString]]]]
  (let [id (eid-translation/->id-or-404 :model/TestSuite id-or-entity-id)]
    (api/write-check (data-testing.db/test-suite id))
    (test-suite/delete-test-suites! [id])
    nil))

(api.macros/defendpoint :post "/:id/run" :- ::data-testing.schema/test-suite-run.result
  "Run the members of a test suite, in order, within the request, and record the run.

  Each member runs as its own run endpoint would run it, under the same permission rule, and reports its `status`:
  `passed` or `failed` with its `result`; `refused` with the `error` its run endpoint would have returned; `error`
  when loading the test's subject or checking the caller's permission threw, or the run threw an exception that is not
  a refusal; `forbidden` when the caller may not run it (with no name when the caller cannot read it); `missing` when
  this instance has no such test, or the thing the test tests is gone.

  The suite's `status` is `timeout` when the server timed the run out while it ran, because its heartbeat stopped;
  otherwise `passed` when every member passed, and `failed` when not."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (data-testing.suite-run/run-suite! (api/read-check (data-testing.db/test-suite id))))

(api.macros/defendpoint :get "/:id/runs" :- ::data-testing.schema/test-suite-runs.response
  "List the runs of a test suite, newest first. A member's outcome has no `test_id`, `name`, or `result`. It has an
  `error` only when the member's test exists and the caller may run it. Every member's `status` is shown, even to a
  caller who cannot read the member's test."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (api/read-check (data-testing.db/test-suite id))
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

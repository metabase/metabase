(ns metabase-enterprise.data-testing.suite-api
  "`/api/ee/test-suite`: named lists of saved data tests. Every endpoint needs Data Studio access."
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase-enterprise.data-testing.suite :as data-testing.suite]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

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
  "Get a test suite with its members, shown as the list shows them."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (api/check-data-studio-access)
  (suite-response id))

(api.macros/defendpoint :post "/" :- ::data-testing.schema/test-suite.response
  "Create a test suite. Its members run in the order given. Each member names a test the caller can read, by
  `test_type` and either `test_id` or `test_entity_id`; a test can be in a suite once."
  [_route-params
   _query-params
   {:keys [members] :as body} :- ::data-testing.schema/test-suite.create]
  (api/check-data-studio-access)
  (suite-response (data-testing.db/insert-test-suite! (-> body
                                                          (dissoc :members)
                                                          (assoc :creator_id api/*current-user-id*))
                                                      (data-testing.suite/member-rows members #{}))))

(api.macros/defendpoint :put "/:id" :- ::data-testing.schema/test-suite.response
  "Update a test suite. `members`, when given, replaces every member, in the order given. Each member names a test the
  caller can read, by `test_type` and either `test_id` or `test_entity_id`, or a member the suite has now by
  `test_type` and `test_entity_id`, which keeps a member the caller cannot read or that is missing."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]
   _query-params
   body :- ::data-testing.schema/test-suite.update]
  (api/check-data-studio-access)
  (api/check-404 (data-testing.db/test-suite id))
  (data-testing.db/update-test-suite!
   id
   (dissoc body :members)
   (when (contains? body :members)
     (data-testing.suite/member-rows (:members body)
                                     (into #{}
                                           (map (juxt :test_type :test_entity_id))
                                           (data-testing.db/suite-members [id])))))
  (suite-response id))

(api.macros/defendpoint :delete "/:id" :- :nil
  "Delete a test suite. The tests in it are not deleted."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (api/check-data-studio-access)
  (api/check-404 (data-testing.db/test-suite id))
  (data-testing.db/delete-test-suite! id)
  nil)

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/test-suite` routes."
  (api.macros/ns-handler *ns* +auth))

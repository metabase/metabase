(ns metabase-enterprise.data-testing.action-api
  "`/api/ee/action-test`: saved tests of actions."
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.errors :as data-testing.errors]
   [metabase-enterprise.data-testing.models.action-test :as data-testing.models.action-test]
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
  "Call `thunk`, rethrowing a typed refusal as [[data-testing.errors/refusing]] does, under the `action-test` prefix."
  [thunk :- ifn?]
  (data-testing.errors/refusing "action-test" thunk))

(def ^:private definition-keys
  "The keys of a saved action test that a run reads."
  [:inputs :expectations :parameters])

(mu/defn- validate-test! :- :nil
  "Refuse a test of the Action `action-id` with the inputs, expectations and parameter values of `definition` unless it
  could run."
  [action-id  :- ms/PositiveInt
   definition :- ::data-testing.runner/definition]
  (refusing #(data-testing.runner/validate-test :action (api/check-404 (data-testing.db/action action-id)) definition)))

(api.macros/defendpoint :get "/" :- [:sequential ::data-testing.schema/action-test.response]
  "List the action tests the caller can read, with their newest runs, optionally only those of one action. Needs Data
  Studio access.

  An action test, with its parameter values, inputs and expectations, is readable by every user who can read its
  action."
  [_route-params
   {:keys [action-id]} :- [:map {:closed true}
                           [:action-id {:optional true} [:maybe ms/PositiveInt]]]]
  (api/check-data-studio-access)
  (-> (filter mi/can-read? (t2/hydrate (data-testing.db/action-tests {:action-id action-id}) :can_read))
      (t2/hydrate :last_run)))

(api.macros/defendpoint :get "/:id" :- ::data-testing.schema/action-test.response
  "Get an action test with its newest run.

  An action test, with its parameter values, inputs and expectations, is readable by every user who can read its
  action."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (-> (api/read-check :model/ActionTest id)
      (t2/hydrate :last_run)))

(api.macros/defendpoint :post "/" :- ::data-testing.schema/action-test
  "Create an action test. A run gives the action's parameters the test's `parameters`, by parameter id or slug, as
  `POST /api/action/:id/execute` does: a parameter left out takes its default, and a value for a hidden parameter or
  for no parameter of the action is refused. A test that leaves a required parameter with no value and no default is
  refused. The action's SQL then runs against the test's inputs, and the expectations read the tables after it, by
  their real names.

  Only query actions can be tested, on a database with actions enabled. The action's SQL must be one INSERT, UPDATE or
  DELETE statement, and an `equals` expectation is refused: an action has no output to compare."
  [_route-params
   _query-params
   {:keys [action_id] :as body} :- ::data-testing.schema/action-test.create]
  (api/create-check :model/ActionTest body)
  (validate-test! action_id (select-keys body definition-keys))
  (data-testing.db/insert-action-test! (assoc body :creator_id api/*current-user-id*)))

(api.macros/defendpoint :put "/:id" :- ::data-testing.schema/action-test
  "Update an action test. An update that changes the action, the parameter values, the inputs or the expectations is
  checked as a new test is; an update of only the name or description is not."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]
   _query-params
   body :- ::data-testing.schema/action-test.update]
  (let [action-test (api/read-check :model/ActionTest id)]
    (api/update-check action-test body)
    (when (some #(contains? body %) (conj definition-keys :action_id))
      (let [{:keys [action_id] :as merged} (merge action-test body)]
        (validate-test! action_id (select-keys merged definition-keys))))
    (when (seq body)
      (data-testing.db/update-action-test! id body)))
  (data-testing.db/action-test id))

(api.macros/defendpoint :delete "/:id" :- :nil
  "Delete an action test."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (api/write-check :model/ActionTest id)
  (data-testing.db/delete-action-test! id)
  nil)

(api.macros/defendpoint :post "/:id/run" :- ::data-testing.schema/run-result
  "Run an action test. Needs read access to the test, permission to run the action's query with the test's parameter
  values, and native query access to the database of that query.
  The action's SQL runs on the test's temp tables, in a transaction that is rolled back, so the tables the SQL names do
  not change. The rollback does not undo a function that the SQL calls and that commits on a connection of its own;
  the run refuses such functions only by name. The run is recorded in the test's run history and in the audit log as
  an action-test run, not as an execution of the action.

  A 200 means the run happened: `:status` is then `passed` or `failed`, and every expectation reports what it found,
  including one that could not be evaluated, which comes back as that expectation's own `:error`.

  Any other status means the run was refused and nothing meaningful ran. A refusal of the test itself carries the
  `:error-code` naming which refusal it was; a missing test (404), missing permission (403) or missing feature (402)
  carries none."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (let [action-test (api/read-check :model/ActionTest id)]
    (api/check-403 (data-testing.models.action-test/can-run? action-test))
    (refusing #(data-testing.runner/run-test! :action (data-testing.db/action (:action_id action-test)) action-test))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/action-test` routes."
  (api.macros/ns-handler *ns* +auth))

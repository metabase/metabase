(ns metabase-enterprise.data-testing.segment-api
  "`/api/ee/segment-test`: saved tests of segments."
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.errors :as data-testing.errors]
   [metabase-enterprise.data-testing.models.segment-test :as data-testing.models.segment-test]
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
  "Call `thunk`, rethrowing a typed refusal as [[data-testing.errors/refusing]] does, under the `segment-test` prefix."
  [thunk :- ifn?]
  (data-testing.errors/refusing "segment-test" thunk))

(mu/defn- validate-test! :- :nil
  "Refuse a test of the Segment `segment-id` with `inputs` and `expectations` unless it could run."
  [segment-id   :- ms/PositiveInt
   inputs       :- ::data-testing.schema/inputs
   expectations :- ::data-testing.schema/expectations]
  (refusing #(data-testing.runner/validate-test :segment (data-testing.db/segment segment-id) inputs expectations)))

(api.macros/defendpoint :get "/" :- [:sequential ::data-testing.schema/segment-test.response]
  "List the segment tests the caller can read, with their newest runs, optionally only those of one segment. Needs Data
  Studio access.

  A segment test, with its inputs and expectations, is readable by every user who can read its segment."
  [_route-params
   {:keys [segment-id]} :- [:map {:closed true}
                            [:segment-id {:optional true} [:maybe ms/PositiveInt]]]]
  (api/check-data-studio-access)
  (-> (mi/readable (data-testing.db/segment-tests {:segment-id segment-id}))
      (t2/hydrate :last_run :can_run)))

(api.macros/defendpoint :get "/:id" :- ::data-testing.schema/segment-test.response
  "Get a segment test with its newest run.

  A segment test, with its inputs and expectations, is readable by every user who can read its segment."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (-> (api/read-check :model/SegmentTest id)
      (t2/hydrate :last_run :can_run)))

(api.macros/defendpoint :post "/" :- ::data-testing.schema/segment-test
  "Create a segment test. Its expectations read the output: the rows of the segment's table that match the segment's
  filter. Expectation SQL names the output `{{output}}`, spaces inside the braces allowed; any other `{{...}}` is
  refused. The test needs an input for the segment's table, and one for each table that the filter reads through a
  foreign key.

  The output has the columns of the segment's table that its input declares. When that input is SQL, the output has
  every column of the table.

  An input that gives rows must declare every column that the segment's query reads from the input's table: for the
  segment's table, the output's columns and the filter's; for a table read through a foreign key, every column. A test
  whose input lacks such a column is refused, naming the table and the columns. The check covers only the columns that
  the SQL parser places on one table. It skips the tables that Metabase hides, and the columns marked sensitive or
  retired. A test that it accepts can still fail when it runs. On a database that keeps the case of column names, a
  declared name that differs from the table's only in case does not match it."
  [_route-params
   _query-params
   {:keys [segment_id inputs expectations] :as body} :- ::data-testing.schema/segment-test.create]
  (api/create-check :model/SegmentTest body)
  (validate-test! segment_id inputs expectations)
  (data-testing.models.segment-test/create-segment-test! (assoc body :creator_id api/*current-user-id*)))

(api.macros/defendpoint :put "/:id" :- ::data-testing.schema/segment-test
  "Update a segment test."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]
   _query-params
   body :- ::data-testing.schema/segment-test.update]
  (let [segment-test (api/read-check :model/SegmentTest id)]
    (api/update-check segment-test body)
    (when (some #(contains? body %) [:segment_id :inputs :expectations])
      (let [{:keys [segment_id inputs expectations]} (merge segment-test body)]
        (validate-test! segment_id inputs expectations)))
    (when (seq body)
      (data-testing.models.segment-test/update-segment-test! id body)))
  (data-testing.db/segment-test id))

(api.macros/defendpoint :delete "/:id" :- :nil
  "Delete a segment test."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (api/write-check :model/SegmentTest id)
  (data-testing.models.segment-test/delete-segment-test! id)
  nil)

(api.macros/defendpoint :post "/:id/run" :- ::data-testing.schema/run-result
  "Run a segment test. Needs read access to the test, permission to run its segment's definition, and native query
  access to the segment's database.

  A 200 means the run happened: `:status` is then `passed` or `failed`, and every expectation reports what it found,
  including one that could not be evaluated, which comes back as that expectation's own `:error`.

  Any other status means the run was refused and nothing meaningful ran. A refusal of the test itself carries the
  `:error-code` naming which refusal it was; a missing test (404), missing permission (403) or missing feature (402)
  carries none."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (let [segment-test (api/read-check :model/SegmentTest id)]
    (api/check-403 (data-testing.models.segment-test/can-run? segment-test))
    (refusing #(data-testing.runner/run-test! :segment
                                              (data-testing.db/segment (:segment_id segment-test))
                                              segment-test))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/segment-test` routes."
  (api.macros/ns-handler *ns* +auth))

(ns metabase-enterprise.data-testing.run-api
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.models :as data-testing.models]
   [metabase-enterprise.data-testing.models.card-test :as data-testing.models.card-test]
   [metabase-enterprise.data-testing.models.segment-test :as data-testing.models.segment-test]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.models.interface :as mi]
   [metabase.query-processor.parameters.dates :as params.dates]
   [metabase.request.core :as request]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mu/defn- readable-test-ids :- [:set ms/PositiveInt]
  "The ids of the `test-type` tests the current user can read."
  [test-type :- ::data-testing.schema/test-type]
  (into #{}
        (map :id)
        (mi/readable (data-testing.db/saved-tests test-type))))

(mu/defn- timestamp-range :- [:maybe [:tuple [:maybe ms/TemporalInstant] [:maybe ms/TemporalInstant]]]
  "The `[start end]` instants of the date filter `date-string`, or nil when it is nil."
  [date-string :- [:maybe :string]]
  (when date-string
    (let [{:keys [start end]} (try
                                (params.dates/date-string->range date-string {:inclusive-end? false})
                                (catch Exception e
                                  (throw (ex-info (tru "Failed to parse datetime value: {0}" date-string)
                                                  {:status-code 400}
                                                  e))))]
      [(some-> start u.date/parse) (some-> end u.date/parse)])))

(api.macros/defendpoint :get "/" :- ::data-testing.schema/data-test-runs.response
  "List the runs of the tests of `test-type` that the caller can read, newest first. With `test-id`, only the runs of
  that test. Without it, the caller needs Data Studio access. The runs of a test that was deleted are not listed."
  [_route-params
   {:keys [test-type test-id statuses start-time end-time]}
   :- [:map {:closed true}
       [:test-type  ::data-testing.schema/test-type]
       [:test-id    {:optional true} [:maybe ms/PositiveInt]]
       [:statuses   {:optional true} [:maybe (ms/QueryVectorOf ::data-testing.schema/run-status)]]
       [:start-time {:optional true} [:maybe ms/NonBlankString]]
       [:end-time   {:optional true} [:maybe ms/NonBlankString]]]]
  (let [test-ids                          (if test-id
                                            (do (api/read-check (data-testing.db/test-type->model test-type) test-id)
                                                #{test-id})
                                            (do (api/check-data-studio-access)
                                                (readable-test-ids test-type)))
        [started-at-start started-at-end] (timestamp-range start-time)
        [ended-at-start ended-at-end]     (timestamp-range end-time)
        filters                           {:test-type        test-type
                                           :test-ids         test-ids
                                           :statuses         statuses
                                           :started-at-start started-at-start
                                           :started-at-end   started-at-end
                                           :ended-at-start   ended-at-start
                                           :ended-at-end     ended-at-end}
        limit                             (or (request/limit) 20)
        offset                            (or (request/offset) 0)]
    {:data   (t2/hydrate (data-testing.db/test-runs filters limit offset) :initiated_by_user)
     :limit  limit
     :offset offset
     :total  (data-testing.db/test-run-count filters)}))

(mu/defn- can-run-test? :- :boolean
  "Whether the current user may run `saved-test`, a test of `test-type`, as its run endpoint checks."
  [test-type  :- ::data-testing.schema/test-type
   saved-test :- ::data-testing.schema/saved-test]
  (case test-type
    :transform (data-testing.models/can-run-test? (:transform_id saved-test))
    :card      (data-testing.models.card-test/can-run? saved-test)
    :segment   (data-testing.models.segment-test/can-run? saved-test)))

(mu/defn- can-read-result? :- :boolean
  "Whether the current user may read the stored result of `run`, a run of `saved-test`.

  The result holds rows the run read with the database access of the user who started it, from the database the test
  had then. So it goes to that user, while they may still run the test, and to an admin."
  [run        :- ::data-testing.schema/stored-data-test-run
   saved-test :- ::data-testing.schema/saved-test]
  (boolean
   (or api/*is-superuser?*
       (and (some? (:initiated_by run))
            (= (:initiated_by run) api/*current-user-id*)
            (can-run-test? (:test_type run) saved-test)))))

(api.macros/defendpoint :get "/:id" :- ::data-testing.schema/data-test-run.detail
  "Get a run with the user who started it and the result it stored: what each expectation found, or the refusal that
  ended the run. The caller needs read access to the run's test. The run of a test that was deleted is not found.

  The stored result holds rows that the run read, so only the user who started the run, while they may still run the
  test, and an admin get it. For any other caller `:result` is nil and `:can_read_result` is false."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (let [{:keys [test_type test_id] :as run} (api/check-404 (data-testing.db/test-run id))
        model                               (data-testing.db/test-type->model test_type)]
    (api/check-404 (and model test_id))
    (let [saved-test       (api/read-check model test_id)
          can-read-result? (can-read-result? run saved-test)]
      (-> (api/check-404 (data-testing.db/test-run-with-result test_type test_id id))
          (t2/hydrate :initiated_by_user)
          (cond-> (not can-read-result?) (assoc :result nil))
          (assoc :can_read_result can-read-result?)))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/data-test-run` routes."
  (api.macros/ns-handler *ns* +auth))

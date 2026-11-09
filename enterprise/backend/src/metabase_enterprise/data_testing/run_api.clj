(ns metabase-enterprise.data-testing.run-api
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
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

(def ^:private test-type->model
  {:transform :model/TransformTest})

(mu/defn- readable-test-ids :- [:set ms/PositiveInt]
  "The ids of the `test-type` tests the current user can read."
  [test-type :- ::data-testing.schema/test-type]
  (into #{}
        (comp (filter mi/can-read?)
              (map :id))
        (case test-type
          :transform (data-testing.db/transform-tests {}))))

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
  "List the runs of the saved tests of `test-type` that the caller can read, newest first. With `test-id`, only the runs
  of that test. Without it, the caller needs Data Studio access. The runs of a test that is not saved, or was deleted,
  are not listed."
  [_route-params
   {:keys [test-type test-id statuses start-time end-time]}
   :- [:map {:closed true}
       [:test-type  ::data-testing.schema/test-type]
       [:test-id    {:optional true} [:maybe ms/PositiveInt]]
       [:statuses   {:optional true} [:maybe (ms/QueryVectorOf ::data-testing.schema/run-status)]]
       [:start-time {:optional true} [:maybe ms/NonBlankString]]
       [:end-time   {:optional true} [:maybe ms/NonBlankString]]]]
  (let [test-ids                          (if test-id
                                            (do (api/read-check (test-type->model test-type) test-id)
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

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/data-test-run` routes."
  (api.macros/ns-handler *ns* +auth))

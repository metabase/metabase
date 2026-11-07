(ns metabase-enterprise.data-testing.run-api
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
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

;; The filters carry the names of the `test_type` and `test_id` fields of a run, which clients read in the response.
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case]}
(api.macros/defendpoint :get "/" :- ::data-testing.schema/data-test-runs.response
  "List the runs of the tests of `test_type`, newest first. With `test_id`, only the runs of that test, which the caller
  must be able to read. Without it, the runs of every test of the type, runs of tests that are not saved included, for
  a caller with Data Studio access."
  [_route-params
   {:keys [test_type test_id statuses start-time end-time]}
   :- [:map {:closed true}
       [:test_type  ::data-testing.schema/test-type]
       [:test_id    {:optional true} [:maybe ms/PositiveInt]]
       [:statuses   {:optional true} [:maybe (ms/QueryVectorOf ::data-testing.schema/run-status)]]
       [:start-time {:optional true} [:maybe ms/NonBlankString]]
       [:end-time   {:optional true} [:maybe ms/NonBlankString]]]]
  (if test_id
    (api/read-check (test-type->model test_type) test_id)
    (api/check-data-studio-access))
  (let [[started-at-start started-at-end] (timestamp-range start-time)
        [ended-at-start ended-at-end]     (timestamp-range end-time)
        filters                           {:test-type        test_type
                                           :test-id          test_id
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

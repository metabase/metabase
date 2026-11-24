(ns metabase-enterprise.data-testing.suite-run
  "[[run-suite!]]: run the members of a test suite, in order, each under its own test type's permission rule."
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.errors :as data-testing.errors]
   [metabase-enterprise.data-testing.models.test-suite-run :as data-testing.models.test-suite-run]
   [metabase-enterprise.data-testing.run-tracking :as data-testing.run-tracking]
   [metabase-enterprise.data-testing.runner :as data-testing.runner]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase-enterprise.data-testing.suite :as data-testing.suite]
   [metabase-enterprise.data-testing.test-type :as data-testing.test-type]
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn- run-member :- ::data-testing.schema/test-suite-run.member
  "Run `member` of a suite, given `saved-test`, the test it names, or nil, and return its outcome. An exception from
  loading the test's subject, checking the user's permission, or the run itself is the member's `:error`."
  [{:keys [test_type test_entity_id position]} :- ::data-testing.schema/test-suite.member
   saved-test                                  :- [:maybe ::data-testing.schema/saved-test]]
  (let [outcome {:test_type test_type :test_entity_id test_entity_id :position position}]
    (cond
      (nil? saved-test)               (assoc outcome :status :missing)
      (not (mi/can-read? saved-test)) (assoc outcome :status :forbidden)
      :else
      (let [{:keys [subject can-run?]} (data-testing.test-type/spec test_type)
            outcome                    (assoc outcome :test_id (:id saved-test) :name (:name saved-test))
            run-id                     (volatile! nil)
            with-run                   #(cond-> % @run-id (assoc :data_test_run_id @run-id))]
        (try
          (let [subject (subject saved-test)]
            (cond
              (nil? subject)              (assoc outcome :status :missing)
              (not (can-run? saved-test)) (assoc outcome :status :forbidden)
              :else
              (let [result (data-testing.runner/run-test! test_type subject saved-test {:on-start #(vreset! run-id %)})]
                (with-run (assoc outcome :status (:status result) :result result)))))
          (catch Exception e
            (if-let [error-type (:error-type (ex-data e))]
              (with-run (assoc outcome
                               :status :refused
                               :error  {:error_code (data-testing.errors/code (str (name test_type) "-test") error-type)
                                        :message    (ex-message e)}))
              (do
                (log/warnf e "Run of %s test %s threw an unexpected error in a suite run" (name test_type) (:id saved-test))
                (with-run (assoc outcome :status :error :error {:message (ex-message e)}))))))))))

(mu/defn- stored-member :- ::data-testing.schema/test-suite-run.stored-member
  "`outcome` as the run history keeps it."
  [outcome :- ::data-testing.schema/test-suite-run.member]
  (dissoc outcome :test_id :name :result))

(mu/defn run-suite! :- ::data-testing.schema/test-suite-run.result
  "Run the members of `suite` in order, as the current user, and record the run. A member whose test the user may not
  read or run is `forbidden`, and one whose test this instance lacks is `missing`; neither runs. Unless the cluster
  reaper timed the run out while it ran, the suite passes iff every member passes; a timed-out run stays `timeout`,
  keeps the member outcomes, and the result reports `timeout`."
  [suite :- ::data-testing.schema/test-suite]
  (let [members      (data-testing.db/suite-members [(:id suite)])
        tests        (data-testing.suite/saved-tests-by :entity_id (mapv data-testing.suite/member-ref members))
        {run-id :id} (data-testing.run-tracking/start-suite-run! (:id suite) api/*current-user-id*)
        finished?    (volatile! false)]
    (try
      (let [outcomes (mapv #(run-member % (get tests (data-testing.suite/member-ref %))) members)
            stored   (mapv stored-member outcomes)
            status   (if (every? #(= :passed (:status %)) outcomes) :passed :failed)
            status   (if (pos? (data-testing.run-tracking/finish-suite-run! run-id status stored))
                       status
                       (do (data-testing.models.test-suite-run/add-members-to-ended-test-suite-run! run-id stored)
                           :timeout))]
        (vreset! finished? true)
        {:id       run-id
         :suite_id (:id suite)
         :status   status
         :members  outcomes})
      (finally
        (when-not @finished?
          (data-testing.run-tracking/finish-suite-run! run-id :error nil))))))

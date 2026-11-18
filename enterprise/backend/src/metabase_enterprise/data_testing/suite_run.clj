(ns metabase-enterprise.data-testing.suite-run
  "[[run-suite!]]: run every member of a test suite, in order, each under its own test type's permission rule."
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.errors :as data-testing.errors]
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
  "Run `member` of a suite, given `saved-test`, the test it names, or nil, and return its outcome."
  [{:keys [test_type test_entity_id position]} :- ::data-testing.schema/test-suite.member
   saved-test                                  :- [:maybe ::data-testing.schema/saved-test]]
  (let [outcome                    {:test_type test_type :test_entity_id test_entity_id :position position}
        {:keys [subject can-run?]} (data-testing.test-type/spec test_type)]
    (cond
      (nil? saved-test)              (assoc outcome :status :missing)
      (not (mi/can-read? saved-test)) (assoc outcome :status :forbidden)
      :else
      (let [outcome    (assoc outcome :test_id (:id saved-test) :name (:name saved-test))
            subject    (subject saved-test)
            run-id     (volatile! nil)
            with-run   #(cond-> % @run-id (assoc :data_test_run_id @run-id))]
        (cond
          (nil? subject)                 (assoc outcome :status :missing)
          (not (can-run? saved-test))    (assoc outcome :status :forbidden)
          :else
          (try
            (let [result (data-testing.runner/run-test! test_type subject saved-test {:on-start #(vreset! run-id %)})]
              (with-run (assoc outcome :status (:status result) :result result)))
            (catch Exception e
              (if-let [error-type (:error-type (ex-data e))]
                (with-run (assoc outcome
                                 :status :refused
                                 :error  {:error_code (data-testing.errors/code (str (name test_type) "-test") error-type)
                                          :message    (ex-message e)}))
                (do
                  (log/warnf e "Test %s of type %s failed in a suite run" (:id saved-test) test_type)
                  (with-run (assoc outcome :status :error :error {:message (ex-message e)})))))))))))

(mu/defn- stored-member :- ::data-testing.schema/test-suite-run.stored-member
  "`outcome` as the run history keeps it."
  [outcome :- ::data-testing.schema/test-suite-run.member]
  (dissoc outcome :test_id :name :result))

(mu/defn run-suite! :- ::data-testing.schema/test-suite-run.result
  "Run every member of `suite`, in order, as the current user, and record the run. A member the user may not read or
  run, and a member naming a test this instance lacks, does not run and is not passed. The suite passes iff every
  member passes."
  [suite :- ::data-testing.schema/test-suite]
  (let [members      (data-testing.db/suite-members [(:id suite)])
        tests        (data-testing.suite/saved-tests-by :entity_id (mapv (juxt :test_type :test_entity_id) members))
        {run-id :id} (data-testing.run-tracking/start-suite-run! (:id suite) api/*current-user-id*)
        finished     (volatile! nil)]
    (try
      (let [outcomes (mapv #(run-member % (get tests [(:test_type %) (:test_entity_id %)])) members)
            status   (if (every? #(= :passed (:status %)) outcomes) :passed :failed)]
        (vreset! finished [status (mapv stored-member outcomes)])
        {:id       run-id
         :suite_id (:id suite)
         :status   status
         :members  outcomes})
      (finally
        (let [[status stored] (or @finished [:error nil])]
          (data-testing.run-tracking/finish-suite-run! run-id status stored))))))

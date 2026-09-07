(ns metabase-enterprise.osi-generation.task.generate-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.osi-generation.core :as core]
   [metabase-enterprise.osi-generation.settings :as settings]
   [metabase-enterprise.osi-generation.task.generate :as task.generate]
   [metabase.task.core :as task]
   [metabase.test :as mt])
  (:import
   (org.quartz CronTrigger TriggerKey)))

(set! *warn-on-reflection* true)

(deftest job-body-runs-only-when-every-gate-passes-test
  (let [runs (atom [])
        run! @#'task.generate/run!*]
    (doseq [[enabled available configured expected]
            [[false true true 0]
             [true false true 0]
             [true true false 0]
             [true true true 1]]]
      (reset! runs [])
      (mt/with-dynamic-fn-redefs [settings/osi-generation-enabled (constantly enabled)
                                  core/available? (constantly available)
                                  settings/configured? (constantly configured)
                                  settings/osi-generation-model (constantly "test/model")
                                  settings/credentials-source (constantly :connection)
                                  core/run-generation! (fn [] (swap! runs conj :run) {})]
        (run!)
        (is (= expected (count @runs)) (str [enabled available configured]))))))

(deftest scheduled-run-uses-configured-budget-test
  (testing "the job body does not shadow run-generation!'s configured budget with a legacy hard-coded limit"
    (let [calls (atom 0)]
      (mt/with-dynamic-fn-redefs [settings/osi-generation-enabled (constantly true)
                                  core/available? (constantly true)
                                  settings/configured? (constantly true)
                                  core/run-generation! (fn [] (swap! calls inc) {})]
        ((deref #'task.generate/run!*))
        (is (= 1 @calls))))))

(deftest job-body-isolates-a-run-failure-test
  (mt/with-dynamic-fn-redefs [settings/osi-generation-enabled (constantly true)
                              core/available? (constantly true)
                              settings/configured? (constantly true)
                              core/run-generation! (fn [] (throw (ex-info "boom" {})))]
    (is (= {:outcome         :failed
            :message         "boom"
            :exception_class "class clojure.lang.ExceptionInfo"}
           ((deref #'task.generate/run!*))))))

(deftest scheduled-run-records-lifecycle-test
  (testing "skipped and completed attempts remain successful task executions with their outcome attached"
    (is (= {:status       :success
            :task_details {:outcome :skipped, :reason :disabled}}
           (#'task.generate/history-update {:status :success}
                                           {:outcome :skipped, :reason :disabled}))))
  (testing "an isolated generation error is visible as a failed lifecycle entry"
    (is (= {:status       :failed
            :task_details {:outcome :failed, :message "boom"}}
           (#'task.generate/history-update {:status :success}
                                           {:outcome :failed, :message "boom"})))))

(deftest task-details-have-deterministic-semantic-key-order-test
  (let [details (:task_details
                 (#'task.generate/history-update
                  {:status :success}
                  {:summary {:reconcile {:execution {:ran_ms 2, :waited_ms 1}
                                         :index     {:unchanged 3, :deleted 2, :inserted 1}}
                             :usage {:output-tokens 5, :input-tokens 10}
                             :llm-calls [{:output-tokens   5
                                          :duration-ms     1234
                                          :entity-local-id 7
                                          :outcome         :generated
                                          :input-tokens    10
                                          :entity-type     "table"}]
                             :errors 0, :already-approved 4, :generated 2, :candidates 6}
                   :outcome :completed}))]
    (is (= [:outcome :summary] (vec (keys details))))
    (is (= [:candidates :generated :already-approved :errors :usage :llm-calls :reconcile]
           (vec (keys (:summary details)))))
    (is (= [:input-tokens :output-tokens] (vec (keys (get-in details [:summary :usage])))))
    (is (= [:index :execution] (vec (keys (get-in details [:summary :reconcile])))))
    (is (= [:inserted :deleted :unchanged]
           (vec (keys (get-in details [:summary :reconcile :index])))))
    (is (= [:waited_ms :ran_ms]
           (vec (keys (get-in details [:summary :reconcile :execution])))))
    (is (= [:outcome :entity-type :entity-local-id :duration-ms :input-tokens :output-tokens]
           (vec (keys (first (get-in details [:summary :llm-calls]))))))))

(deftest job-body-propagates-interruption-and-fatal-errors-test
  (let [run! (deref #'task.generate/run!*)
        gates {#'settings/osi-generation-enabled (constantly true)
               #'core/available? (constantly true)
               #'settings/configured? (constantly true)}]
    (testing "wrapped interruption restores the flag and reaches Quartz"
      (let [thrown (with-redefs-fn
                     (assoc gates #'core/run-generation!
                            (fn [] (throw (ex-info "wrapper" {}
                                                   (InterruptedException. "cancelled")))))
                     (fn [] (try (run!) nil (catch Throwable e e))))
            interrupted? (.isInterrupted (Thread/currentThread))]
        (Thread/interrupted)
        (is (instance? InterruptedException thrown))
        (is interrupted?)))
    (testing "a wrapped fatal JVM error reaches Quartz"
      (is (thrown-with-msg? LinkageError #"fatal"
                            (with-redefs-fn
                              (assoc gates #'core/run-generation!
                                     (fn [] (throw (ex-info "wrapper" {}
                                                            (LinkageError. "fatal")))))
                              run!))))))

(deftest weekly-trigger-is-explicitly-utc-test
  (let [scheduled (atom nil)]
    (mt/with-dynamic-fn-redefs [task/job-exists? (constantly false)
                                task/existing-triggers (fn [& _]
                                                         (throw (AssertionError. "fresh registration queried triggers")))
                                task/schedule-task! (fn [job trigger]
                                                      (reset! scheduled [job trigger]))]
      (task/init! ::task.generate/OsiAiContextGeneration)
      (let [^CronTrigger trigger (second @scheduled)]
        (is (= "UTC" (.getID (.getTimeZone trigger))))))))

(deftest startup-preserves-persisted-trigger-for-misfire-recovery-test
  (testing "a restart refreshes the job without replacing the trigger whose missed firing Quartz must recover"
    (let [existing [{:key "metabase-enterprise.osi-generation.generate.trigger"
                     :next-fire-time (java.util.Date. 0)}]
          added    (atom nil)]
      (mt/with-dynamic-fn-redefs [task/job-exists? (fn [job-key]
                                                     (is (= core/generation-job-key job-key))
                                                     true)
                                  task/existing-triggers (fn [job-key trigger-key]
                                                           (is (= core/generation-job-key job-key))
                                                           (is (= "metabase-enterprise.osi-generation.generate.trigger"
                                                                  (.getName ^TriggerKey trigger-key)))
                                                           existing)
                                  task/add-job! (fn [job] (reset! added job))
                                  task/schedule-task! (fn [& _]
                                                        (throw (AssertionError. "persisted trigger replaced")))]
        (task/init! ::task.generate/OsiAiContextGeneration)
        (is (some? @added))))))

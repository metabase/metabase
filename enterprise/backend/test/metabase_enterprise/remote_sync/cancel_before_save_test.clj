(ns metabase-enterprise.remote-sync.cancel-before-save-test
  "A cancel before the last cancel check of a pull (the forced 0.75 report) stops the pull: the task says
  \"cancelled\" only when the pull saved no ledger row and no version."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as rst]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each rs.test/clean-remote-sync-state rs.test/commit-with-temp)

(def ^:private coll-eid "cancelbeforesavecoll1")
(def ^:private dash-eid "cancelbeforesavedash1")
(def ^:private card-eid "cancelbeforesavecard1")
(def ^:private dashcard-eid "cancelbeforesavedc001")

(def ^:private dashboard-question-files
  "A collection, a dashboard, and a dashboard question on it. The question and the dashboard depend on each other,
  so the load reads one of the two files twice."
  {"collections/cbs_coll/cbs_coll.yaml"
   (rs.test/generate-collection-yaml coll-eid "Cancel before save" :is-remote-synced true)

   "collections/cbs_coll/dashboards/cbs_dash.yaml"
   (rs.test/generate-dashboard-yaml dash-eid "Cbs dashboard" coll-eid
                                    :dashcards [{:entity_id dashcard-eid :card_id card-eid}])

   "collections/cbs_coll/cards/cbs_card.yaml"
   (str/replace (rs.test/generate-card-yaml card-eid "Cbs question" coll-eid)
                "dashboard_id: null"
                (str "dashboard_id: " dash-eid))})

(deftest cancel-at-the-load-done-report-saves-nothing-test
  (testing "a pull of a dashboard question, cancelled just before the forced report at the end of the load, saves no
           ledger row and no version, and the task says cancelled"
    ;; the question references the test-data database, which must exist before the load
    (mt/db)
    (search.tu/with-index-disabled
      (let [task-id  (:id (rst/create-sync-task! "import" (mt/user->id :rasta)))
            source   (rs.test/create-mock-source :initial-files {"main" dashboard-question-files})
            reporter (mt/original-fn #'rst/make-progress-reporter)
            result   (atom ::not-returned)]
        (mt/with-dynamic-fn-redefs [rst/make-progress-reporter
                                    (fn [tid opts]
                                      ;; no throttle: each file read writes its fraction
                                      (let [report (reporter tid (assoc opts :throttle-ms 0))]
                                        (fn
                                          ([fraction] (report fraction))
                                          ([fraction {:keys [force?] :as report-opts}]
                                           (when (and force? (= 0.7 fraction))
                                             (rst/cancel-sync-task! tid))
                                           (report fraction report-opts)))))]
          (impl/run-task-body! task-id nil
                               (fn [tid]
                                 (u/prog1 (impl/import! (source.p/snapshot source) tid :force? true)
                                   (reset! result <>)))))
        (let [task (t2/hydrate (t2/select-one :model/RemoteSyncTask :id task-id) :status)]
          (is (= {:status :cancelled} @result) "import! stopped on the cancel")
          (is (= :cancelled (:status task)))
          (is (nil? (:version task)) "no version saved")
          (is (zero? (t2/count :model/RemoteSyncObject)) "no ledger row saved"))))))

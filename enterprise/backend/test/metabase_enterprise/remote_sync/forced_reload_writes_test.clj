(ns metabase-enterprise.remote-sync.forced-reload-writes-test
  "A forced pull of content identical to what is already local should write nothing.

  Not ^:parallel: it measures with the JVM-wide JDBC counter via [[cost/measure!]]."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.cost-test-util :as cost]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.models.db :as models.db]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each rs.test/clean-remote-sync-state rs.test/commit-with-temp)

(defn- changed-columns
  "Wraps [[models.db/update-entity!]] so each call records, per model, the columns toucan would actually write
  (the diff between the stored row and the stored row merged with the incoming changes)."
  [calls real]
  (fn [id {:keys [model row] :as entity}]
    (let [local   (t2/select-one model id)
          changed (some-> local (merge row) t2/changes keys set)]
      (when (seq changed)
        (swap! calls update model (fnil conj []) changed)))
    (real id entity)))

(defn- forced-reload-of-unchanged!
  [shape]
  (cost/forced-reload-of-unchanged!
   shape
   (fn [import!]
     (let [before (cost/max-updated-at [:model/Card :model/Dashboard :model/DashboardCard])
           calls  (atom {})
           ;; no sleep here: measure! sleeps after this read of `before`
           m      (mt/with-dynamic-fn-redefs [models.db/update-entity!
                                              (changed-columns calls (mt/original-fn #'models.db/update-entity!))]
                    (cost/measure! import!))]
       (assoc m
              :rewritten (cost/rewritten-since before)
              :changed-columns (update-vals @calls frequencies))))))

(deftest forced-reload-of-unchanged-content-rewrites-nothing-test
  (testing "A forced pull of content identical to local rewrites no Card, Dashboard or DashboardCard rows"
    (let [m (forced-reload-of-unchanged! {:cards 10 :dashboards 2 :dashcards 5})]
      (is (= :success (get-in m [:result :status])))
      (is (= {} (:changed-columns m))
          "no update issued by the load would change any column")
      (is (= {:model/Card 0 :model/Dashboard 0 :model/DashboardCard 0}
             (:rewritten m))))))

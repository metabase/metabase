(ns metabase-enterprise.remote-sync.forced-reload-writes-test
  "Card 2: a forced pull of content identical to what is already local should write nothing.

  Not ^:parallel: it measures with the JVM-wide JDBC counter via [[pull-cost-test/measure]]."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.pull-cost-test :as pull-cost-test]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.models.db :as models.db]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each rs.test/clean-remote-sync-state rs.test/commit-with-temp)

(def ^:private timestamped-models [:model/Card :model/Dashboard :model/DashboardCard])

(defn- max-updated-at []
  (into {} (for [m timestamped-models]
             [m (t2/select-one-fn :m m {:select [[:%max.updated_at :m]]})])))

(defn- rewritten-since
  "{model count} of rows of `timestamped-models` whose updated_at moved past `before`."
  [before]
  (into {} (for [m timestamped-models]
             [m (if-let [t (before m)] (t2/count m :updated_at [:> t]) 0)])))

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
  (search.tu/with-index-disabled
    (#'pull-cost-test/do-with-content!
     shape
     (fn [tree]
       (let [src (rs.test/versioned-source :trees {"v0" tree} :current "v0")]
         (is (= :success (:status (#'pull-cost-test/import-at! src "v0" :force? true))) "baseline load")
         (let [before (max-updated-at)
               calls  (atom {})]
           (Thread/sleep 5)
           (let [m (mt/with-dynamic-fn-redefs [models.db/update-entity!
                                               (changed-columns calls (mt/original-fn #'models.db/update-entity!))]
                     (pull-cost-test/measure #(#'pull-cost-test/import-at! src "v0" :force? true)))]
             (assoc m
                    :rewritten (rewritten-since before)
                    :changed-columns (update-vals @calls frequencies)))))))))

(deftest forced-reload-of-unchanged-content-rewrites-nothing-test
  (testing "A forced pull of content identical to local rewrites no Card, Dashboard or DashboardCard rows"
    (let [m (forced-reload-of-unchanged! {:cards 10 :dashboards 2 :dashcards 5})]
      (is (= :success (get-in m [:result :status])))
      (is (= {} (:changed-columns m))
          "no update issued by the load would change any column")
      (is (= {:model/Card 0 :model/Dashboard 0 :model/DashboardCard 0}
             (:rewritten m))))))

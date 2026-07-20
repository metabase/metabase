(ns metabase.internal-stats.data-apps-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.internal-stats.data-apps :as sut]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- data-app!
  "Inserts straight into the table, the way [[sut/data-app-stats]] reads it — `:model/DataApp` is EE-only and
   this namespace is OSS."
  [& {:as extra}]
  (let [app-name (mt/random-name)]
    (t2/insert! :data_app (merge {:name         app-name
                                  :display_name "App"
                                  :bundle_path  "data_apps/app/index.js"
                                  :created_at   :%now
                                  :updated_at   :%now}
                                 extra))
    app-name))

(deftest data-app-stats-counts-enabled-apps-test
  (mt/initialize-if-needed! :db)
  (let [app-names (atom [])
        create!   (fn [& {:as extra}] (swap! app-names conj (data-app! extra)))]
    (try
      (let [before (:data-app-count (sut/data-app-stats))]
        (create!)
        (create!)
        (testing "a synced app is enabled by default, and counts"
          (is (= 2 (- (:data-app-count (sut/data-app-stats)) before))))
        (testing "an app the admin disabled is out of service, so it doesn't count"
          (create! :enabled false)
          (is (= 2 (- (:data-app-count (sut/data-app-stats)) before))))
        (testing "an app that failed to sync is not served, so it doesn't count even when enabled"
          (create! :sync_error "boom")
          (is (= 2 (- (:data-app-count (sut/data-app-stats)) before)))))
      (finally
        (t2/delete! :data_app :name [:in @app-names])))))

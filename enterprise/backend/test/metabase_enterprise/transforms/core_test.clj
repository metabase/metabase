(ns metabase-enterprise.transforms.core-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.transforms.transform-run :as transform-run]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest transform-metered-as-test
  (mt/with-premium-features #{:transforms-basic :writable-connection}
    (is (= "transform-advanced"
           (premium-features/transform-metered-as :native)
           (premium-features/transform-metered-as :mbql))))

  (mt/with-premium-features #{:hosting :transforms-basic}
    (is (= "transform-basic"
           (premium-features/transform-metered-as :native)
           (premium-features/transform-metered-as :mbql))))

  (mt/with-premium-features #{:transforms-python}
    (is (= "transform-advanced"
           (premium-features/transform-metered-as :python))))

  (mt/with-premium-features #{}
    (is (= nil
           (premium-features/transform-metered-as :native)
           (premium-features/transform-metered-as :mbql))))

  (mt/with-premium-features #{:hosting :transforms-basic :transforms-python :writable-connection}
    (is (= nil
           (premium-features/transform-metered-as nil)
           (premium-features/transform-metered-as :something-else)))))

(deftest transform-stats-aggregation-test
  (testing "transform-stats buckets runs by the :metered_as captured at start-run! time"
    (let [frozen-today     (t/offset-date-time 2037 6 15 12 0 0 0 (t/zone-offset "+00"))
          frozen-yesterday (t/minus frozen-today (t/days 1))
          mp               (mt/metadata-provider)]
      (with-redefs [t/offset-date-time (constantly frozen-today)]
        (mt/with-model-cleanup [:model/TransformRun]
          (mt/with-temp [:model/Transform {mbql-id :id}
                         {:source {:type  "query"
                                   :query (lib/query mp (lib.metadata/table mp (mt/id :orders)))}
                          :target {:type     "table"
                                   :name     (str "test_mbql_" (random-uuid))
                                   :database (mt/id)}}
                         :model/Transform {python-id :id}
                         {:source {:type            "python"
                                   :source-database (mt/id)}
                          :target {:type     "table"
                                   :name     (str "test_python_" (random-uuid))
                                   :database (mt/id)}}]
            (let [run! (fn [transform-id end-time]
                         (let [{id :id} (transform-run/start-run! transform-id {:run_method "manual"})]
                           (transform-run/succeed-started-run! id)
                           (t2/update! :model/TransformRun :id id {:end_time end-time})))]

              (testing "with no premium features, mbql runs are not metered"
                (mt/with-premium-features #{}
                  (run! mbql-id frozen-yesterday)
                  (run! mbql-id frozen-today))
                (is (= {:transform-basic-runs            0
                        :transform-advanced-runs         0
                        :transform-usage-date            "2037-06-14"
                        :transform-rolling-basic-runs    0
                        :transform-rolling-advanced-runs 0
                        :transform-rolling-usage-date    "2037-06-15"}
                       (premium-features/transform-stats))))

              (testing "with :hosting :transforms-basic, mbql runs meter as basic"
                (mt/with-premium-features #{:hosting :transforms-basic}
                  (run! mbql-id frozen-yesterday)
                  (run! mbql-id frozen-today))
                (is (= {:transform-basic-runs            1
                        :transform-advanced-runs         0
                        :transform-usage-date            "2037-06-14"
                        :transform-rolling-basic-runs    1
                        :transform-rolling-advanced-runs 0
                        :transform-rolling-usage-date    "2037-06-15"}
                       (premium-features/transform-stats))))

              (testing "with :hosting :transforms-basic :writable-connection :transforms-python,
                      both mbql and python runs meter as advanced"
                (mt/with-premium-features #{:hosting :transforms-basic :writable-connection :transforms-python}
                  (run! mbql-id   frozen-yesterday)
                  (run! python-id frozen-yesterday)
                  (run! mbql-id   frozen-today)
                  (run! python-id frozen-today))
                (is (= {:transform-basic-runs            1
                        :transform-advanced-runs         2
                        :transform-usage-date            "2037-06-14"
                        :transform-rolling-basic-runs    1
                        :transform-rolling-advanced-runs 2
                        :transform-rolling-usage-date    "2037-06-15"}
                       (premium-features/transform-stats)))))))))))

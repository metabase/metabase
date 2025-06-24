(ns metabase.internal-stats.embedding-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.internal-stats.embedding :as sut]
   [metabase.test :as mt]))

(deftest dashboard-count-test
  (testing "counts embedding enabled non-archived dashboards"
    (mt/with-temp [:model/Dashboard _ {:enable_embedding true :archived false}
                   :model/Dashboard _ {:enable_embedding true :archived false}
                   :model/Dashboard _ {:enable_embedding false :archived false}
                   :model/Dashboard _ {:enable_embedding true :archived true}
                   :model/Dashboard _ {:enable_embedding false :archived true}]
      (is (= 2 (sut/embedding-dashboard-count))))))

(deftest question-count-test
  (testing "counts embedding enabled non-archived question cards"
    (mt/with-temp [:model/Card _ {:enable_embedding true :archived false :type :metric}
                   :model/Card _ {:enable_embedding true :archived false :type :model}
                   :model/Card _ {:enable_embedding true :archived false :type :question}
                   :model/Card _ {:enable_embedding true :archived false :type :question}
                   :model/Card _ {:enable_embedding false :archived false :type :question}
                   :model/Card _ {:enable_embedding true :archived true :type :question}
                   :model/Card _ {:enable_embedding false :archived true :type :question}]
      (is (= 2 (sut/embedding-question-count))))))

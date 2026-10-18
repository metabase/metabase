(ns metabase-enterprise.dependencies.models.analysis-finding-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.dependencies.models.analysis-finding :as models.analysis-finding]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- finding [card-id]
  (t2/select-one :model/AnalysisFinding :analyzed_entity_type :card :analyzed_entity_id card-id))

(deftest upsert-analysis-records-version-test
  (testing "upsert-analysis! records the version it is given, and keeps the recorded one when given none"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Card {card-id :id} {}]
        (let [version {:analyzed_updated_at (t/offset-date-time 2020 1 1 0 0 0 0 0) :analyzed_count 2}]
          (models.analysis-finding/upsert-analysis! :card card-id true [] version)
          (is (=? {:result true :analyzed_count 2 :analyzed_updated_at some?} (finding card-id)))
          (models.analysis-finding/upsert-analysis! :card card-id false [] nil)
          (is (=? {:result false :analyzed_count 2 :analyzed_updated_at some?} (finding card-id))))))))

(deftest ^:synchronized instances-for-analysis-test
  (testing "instances-for-analysis returns the entities without a finding, analyzed from another version, or by an
           older analysis, changed ones first, and not those analyzed from their current version"
    (mt/test-helpers-set-global-values!
      (mt/with-premium-features #{:dependencies}
        (mt/with-model-cleanup [:model/AnalysisFinding]
          (mt/with-temp [:model/Card {unanalyzed :id} {}
                         :model/Card {current :id}    {}
                         :model/Card {outdated :id}   {}]
            (let [ids        #{unanalyzed current outdated}
                  selected   #(into [] (comp (map (comp :id first)) (filter ids))
                                    (models.analysis-finding/instances-for-analysis :card 100000))
                  version-of #(second (some (fn [pair] (when (= % (:id (first pair))) pair))
                                            (models.analysis-finding/instances-for-analysis :card 100000)))]
              (models.analysis-finding/upsert-analysis! :card current true [] (version-of current))
              (binding [models.analysis-finding/*current-analysis-finding-version*
                        (dec models.analysis-finding/*current-analysis-finding-version*)]
                (models.analysis-finding/upsert-analysis! :card outdated true [] (version-of outdated)))
              (is (= [unanalyzed outdated] (selected))))))))))

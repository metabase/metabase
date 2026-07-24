(ns metabase.sync.analyze.interestingness-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [java-time.api :as t]
   [metabase.interestingness.core :as interestingness]
   [metabase.interestingness.dimension :as dim]
   [metabase.sync.analyze.interestingness :as sync.interestingness]
   [metabase.sync.interface :as i]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.usage-metadata.core :as usage-metadata]
   [metabase.usage-metadata.models.source-dimension-daily]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

;;; Smoke tests for the canonical weight profiles. The sync step itself is verified
;;; end-to-end via `automagic_dashboards` integration tests (which fingerprint + score
;;; real tables). Here we just pin down the profile shape and directional behavior.

(deftest ^:parallel canonical-dimension-weights-shape-test
  (is (map? dim/canonical-dimension-weights))
  (is (every? fn? (keys dim/canonical-dimension-weights)))
  (is (every? pos? (vals dim/canonical-dimension-weights))))

(deftest ^:parallel dimension-interestingness-kills-pks-test
  (let [result (interestingness/dimension-interestingness
                {:semantic_type :type/PK
                 :base_type :type/Integer
                 :fingerprint {:global {:distinct-count 1000 :nil% 0.0}}})]
    (is (<= result 0.1))))

(deftest ^:parallel dimension-interestingness-rewards-temporal-test
  (let [result (interestingness/dimension-interestingness
                {:semantic_type :type/CreationTimestamp
                 :base_type :type/DateTime
                 :fingerprint {:global {:distinct-count 5000 :nil% 0.0}
                               :type {:type/DateTime {:earliest "2022-01-01"
                                                      :latest "2024-12-31"}}}})]
    (is (>= result 0.7))))

(def ^:private fingerprint
  {:global {:distinct-count 15 :nil% 0.0}
   :type   {:type/Text {:average-length 8 :percent-blank 0.0}}})

(deftest score-fields!-incorporates-usage-test
  ;; Re-fingerprinting a field re-runs scoring; that must refresh the fingerprint-driven scorers
  ;; *without* discarding the accumulated breakout-usage signal.
  (mt/with-temp [:model/Database            db    {}
                 :model/Table               table {:db_id (:id db)}
                 :model/Field               field {:table_id            (:id table)
                                                   :semantic_type       :type/Category
                                                   :base_type           :type/Text
                                                   :fingerprint         fingerprint
                                                   :fingerprint_version i/*latest-fingerprint-version*
                                                   :last_analyzed       nil}
                 :model/SourceDimensionDaily _    {:source_type    :table
                                                   :source_id      (:id table)
                                                   :ownership_mode :direct
                                                   :field_id       (:id field)
                                                   :temporal_unit  nil
                                                   :binning        nil
                                                   :bucket_date    (t/local-date 2026 4 15)
                                                   :count          100000}]
    (let [usage-less-score (interestingness/dimension-interestingness field)]
      (testing "a re-fingerprinted, heavily-broken-out field scores above its usage-less baseline"
        (let [{:keys [counts baseline]} (usage-metadata/breakout-usage)]
          (is (= {:fields-scored 1 :fields-failed 0}
                 (sync.interestingness/score-fields! table counts baseline))))
        (is (> (t2/select-one-fn :dimension_interestingness :model/Field :id (:id field))
               usage-less-score))))))

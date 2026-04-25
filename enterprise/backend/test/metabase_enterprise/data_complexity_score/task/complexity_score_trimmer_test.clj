(ns metabase-enterprise.data-complexity-score.task.complexity-score-trimmer-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.data-complexity-score.task.complexity-score-trimmer :as complexity-score-trimmer]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(def ^:private fingerprint-prefix "complexity-score-trimmer-test/")

(defn- cleanup-tables
  [f]
  (t2/delete! :model/DataComplexityScore
              {:where [:like :fingerprint (str fingerprint-prefix "%")]})
  (f)
  (t2/delete! :model/DataComplexityScore
              {:where [:like :fingerprint (str fingerprint-prefix "%")]}))

(use-fixtures :each cleanup-tables)

(defn- insert-score!
  [label created-at]
  (t2/insert! :model/DataComplexityScore
              {:fingerprint (str fingerprint-prefix label)
               :score_data  {:label label}
               :created_at  created-at}))

(deftest trim-old-complexity-score-data-deletes-expired-snapshots-test
  (mt/with-clock #t "2026-04-23T12:00:00Z[UTC]"
    (let [now                  (t/local-date-time)
          recent-score-label   "score-recent"
          boundary-score-label "score-boundary"
          old-score-label      "score-old"]
      (insert-score! recent-score-label (t/minus now (t/months 2)))
      (insert-score! boundary-score-label (t/minus now (t/months 3)))
      (insert-score! old-score-label (t/minus now (t/months 4)))

      (is (= 3 (t2/count :model/DataComplexityScore
                         {:where [:like :fingerprint (str fingerprint-prefix "%")]})))

      (#'complexity-score-trimmer/trim-old-complexity-score-data!)

      (is (some? (t2/select-one :model/DataComplexityScore
                                :fingerprint (str fingerprint-prefix recent-score-label))))
      (is (some? (t2/select-one :model/DataComplexityScore
                                :fingerprint (str fingerprint-prefix boundary-score-label))))
      (is (nil? (t2/select-one :model/DataComplexityScore
                               :fingerprint (str fingerprint-prefix old-score-label))))

      (is (= 2 (t2/count :model/DataComplexityScore
                         {:where [:like :fingerprint (str fingerprint-prefix "%")]}))))))

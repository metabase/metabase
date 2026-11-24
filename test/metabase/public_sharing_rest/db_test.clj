(ns metabase.public-sharing-rest.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.query :as mdb.query]
   [metabase.public-sharing-rest.db :as public-sharing-rest.db]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest partitioned-reads-match-whole-reads-test
  (mt/with-temp [:model/Timeline      {t1 :id} {}
                 :model/Timeline      {t2 :id} {}
                 :model/Timeline      {t3 :id} {}
                 :model/Timeline      {t4 :id} {}
                 :model/Timeline      {t5 :id} {}
                 :model/TimelineEvent _        {:timeline_id t5 :timestamp #t "2026-01-02T00:00:00Z"}
                 :model/TimelineEvent _        {:timeline_id t1 :timestamp #t "2026-01-05T00:00:00Z"}
                 :model/TimelineEvent _        {:timeline_id t3 :timestamp #t "2026-01-01T00:00:00Z"}
                 :model/TimelineEvent _        {:timeline_id t2 :timestamp #t "2026-01-04T00:00:00Z"}
                 :model/TimelineEvent _        {:timeline_id t4 :timestamp #t "2026-01-03T00:00:00Z"}]
    (let [timeline-ids #{t1 t2 t3 t4 t5}
          reads        {:ordered-events #(mapv :id (public-sharing-rest.db/active-timeline-events timeline-ids))
                        :active-ids     #(public-sharing-rest.db/active-timeline-ids timeline-ids)}]
      (doseq [[read-name read-fn] reads]
        (testing read-name
          (let [whole (read-fn)]
            (is (seq whole))
            (is (= whole (with-redefs [mdb.query/select-partition-size 2]
                           (read-fn))))))))))

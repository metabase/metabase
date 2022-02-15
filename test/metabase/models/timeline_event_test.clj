(ns metabase.models.timeline-event-test
  "Tests for TimelineEvent model namespace."
  (:require [clojure.test :refer :all]
            [metabase.models.collection :refer [Collection]]
            [metabase.models.timeline :refer [Timeline]]
            [metabase.models.timeline-event :as te :refer [TimelineEvent]]
            [metabase.test :as mt]
            [metabase.util :as u]))

(deftest hydrate-events-test
  (testing "hydrate-events function hydrates all timelines with both archived and un-archived events"
    (let [defaults {:creator_id   (u/the-id (mt/fetch-user :rasta))
                    :timestamp    (java.time.OffsetDateTime/now)
                    :timezone     "PST"
                    :time_matters false}]
      (mt/with-temp* [Collection [collection {:name "Rasta's Collection"}]
                      Timeline [tl-a (merge (select-keys defaults [:creator_id]) {:name "tl-a"})]
                      Timeline [tl-b (merge (select-keys defaults [:creator_id]) {:name "tl-b"})]
                      TimelineEvent [e-a (merge defaults {:timeline_id (u/the-id tl-a) :name "e-a"})]
                      TimelineEvent [e-a (merge defaults {:timeline_id (u/the-id tl-a) :name "e-b" :archived true})]
                      TimelineEvent [e-a (merge defaults {:timeline_id (u/the-id tl-b) :name "e-c"})]
                      TimelineEvent [e-a (merge defaults {:timeline_id (u/the-id tl-b) :name "e-d" :archived true})]]
        (is (= (->> (te/hydrate-events [tl-a tl-b])
                    mt/derecordize
                    (mapcat :events)
                    (map :name)
                    set)
               #{"e-a" "e-b" "e-c" "e-d"}))))))

(ns metabase.models.timeline-test
  "Tests for the Timeline model."
  (:require [clojure.test :refer :all]
            [metabase.models.collection :refer [Collection]]
            [metabase.models.timeline :as tl :refer [Timeline]]
            [metabase.models.timeline-event :refer [TimelineEvent]]
            [metabase.test :as mt]
            [metabase.util :as u]))

(deftest timelines-for-collection-test
  (mt/with-temp Collection [collection {:name "Rasta's Collection"}]
    (let [coll-id (u/the-id collection)
          defaults {:creator_id   (u/the-id (mt/fetch-user :rasta))
                    :timestamp    (java.time.OffsetDateTime/now)
                    :timezone     "PST"
                    :time_matters false}]
      (mt/with-temp* [Timeline [tl-a (merge (select-keys defaults [:creator_id]) {:name "tl-a" :collection_id coll-id})]
                      Timeline [tl-b (merge (select-keys defaults [:creator_id]) {:name "tl-b" :collection_id coll-id})]
                      TimelineEvent [e-a (merge defaults {:timeline_id (u/the-id tl-a) :name "e-a"})]
                      TimelineEvent [e-a (merge defaults {:timeline_id (u/the-id tl-a) :name "e-b" :archived true})]
                      TimelineEvent [e-a (merge defaults {:timeline_id (u/the-id tl-b) :name "e-c"})]
                      TimelineEvent [e-a (merge defaults {:timeline_id (u/the-id tl-b) :name "e-d" :archived true})]]
        (testing "timelines are fetched and not hydrated when there is no `include=events`."
          (is (->> (tl/timelines-for-collection (u/the-id collection) {})
                   (mapcat :events)
                   (every? nil?))))
        (testing "timelines are fetched and hydrated when there is `include=events`."
          (is (= (->> (tl/timelines-for-collection (u/the-id collection) {:include "events" :archived false})
                      (mapcat :events)
                      (map :name)
                      set)
                 #{"e-a" "e-c"})))
        (testing "timelines are fetched and hydrated with archived events when there is `include=events` and `archived=true`."
          (is (= (->> (tl/timelines-for-collection (u/the-id collection) {:include "events" :archived true})
                      (mapcat :events)
                      (map :name)
                      set)
                 #{"e-b" "e-d"})))))))

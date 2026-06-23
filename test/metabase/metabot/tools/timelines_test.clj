(ns metabase.metabot.tools.timelines-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.tools.timelines :as tools.timelines]
   [metabase.test :as mt]))

(deftest list-timelines-tool-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Timeline Coll"}
                   :model/Timeline   {tl-id :id}   {:name        "Product Launches"
                                                    :description "Key product launch dates"
                                                    :collection_id coll-id}]
      (testing "returns timelines with id, name, description"
        (let [result   (tools.timelines/list-timelines-tool {})
              items    (:structured_output result)
              matching (filter #(= tl-id (:id %)) items)]
          (is (seq matching) "expected the test timeline to appear")
          (is (= {:id tl-id :name "Product Launches" :description "Key product launch dates"}
                 (first matching)))))
      (testing "output contains XML-formatted text"
        (let [{:keys [output]} (tools.timelines/list-timelines-tool {})]
          (is (re-find #"<timelines>" output))
          (is (re-find #"Product Launches" output))))
      (testing "archived timelines are excluded by default"
        (mt/with-temp [:model/Timeline _ {:name          "Archived TL"
                                          :collection_id coll-id
                                          :archived      true}]
          (let [items (:structured_output (tools.timelines/list-timelines-tool {}))
                names (set (map :name items))]
            (is (not (contains? names "Archived TL")))))))))

(deftest get-timeline-details-tool-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Collection    {coll-id :id} {:name "Events Coll"}
                   :model/Timeline      {tl-id :id}   {:name          "Releases"
                                                       :description   "Release dates"
                                                       :collection_id coll-id}
                   :model/TimelineEvent _              {:name        "v1.0"
                                                        :description "Initial release"
                                                        :timeline_id tl-id
                                                        :timestamp   #t "2025-06-01T00:00:00Z"
                                                        :icon        "star"}]
      (testing "returns timeline details with events"
        (let [result     (tools.timelines/get-timeline-details-tool {:timeline_id tl-id})
              structured (:structured_output result)]
          (is (= "Releases" (:name structured)))
          (is (= "Release dates" (:description structured)))
          (is (= 1 (count (:events structured))))
          (is (= "v1.0" (-> structured :events first :name)))))
      (testing "output contains XML-formatted text with events"
        (let [{:keys [output]} (tools.timelines/get-timeline-details-tool {:timeline_id tl-id})]
          (is (re-find #"<timeline" output))
          (is (re-find #"<events>" output))
          (is (re-find #"v1.0" output))))
      (testing "returns nil structured_output for nonexistent timeline"
        (is (thrown? Exception
                     (tools.timelines/get-timeline-details-tool {:timeline_id Integer/MAX_VALUE})))))))

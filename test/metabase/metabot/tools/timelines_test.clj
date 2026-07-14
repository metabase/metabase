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
      (testing "events render as well-formed XML (closed attribute quote and opening tag)"
        (let [{:keys [output]} (tools.timelines/get-timeline-details-tool {:timeline_id tl-id})]
          (is (re-find #"<event id=\"\d+\" name=\"v1\.0\" timestamp=\"[^\"]+\">Initial release</event>"
                       output))))
      (testing "throws for a nonexistent timeline (read-check 404)"
        (is (thrown? Exception
                     (tools.timelines/get-timeline-details-tool {:timeline_id Integer/MAX_VALUE})))))))

(deftest timeline-output-xml-escaping-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Collection    {coll-id :id} {:name "Escape Coll"}
                   :model/Timeline      {tl-id :id}   {:name          "Q&A <\"Launches\">"
                                                       :description   "Tags: <b> & \"quotes\""
                                                       :collection_id coll-id}
                   :model/TimelineEvent _              {:name        "R&D <event> \"one\""
                                                        :description "a < b & c > d"
                                                        :timeline_id tl-id
                                                        :timestamp   #t "2025-06-01T00:00:00Z"
                                                        :icon        "star"}]
      (testing "list output escapes XML-special characters in names and descriptions"
        (let [{:keys [output]} (tools.timelines/list-timelines-tool {})]
          (is (re-find #"name=\"Q&amp;A &lt;&quot;Launches&quot;&gt;\"" output))
          (is (re-find #"Tags: &lt;b&gt; &amp; &quot;quotes&quot;" output))))
      (testing "details output escapes XML-special characters in timeline and event fields"
        (let [{:keys [output]} (tools.timelines/get-timeline-details-tool {:timeline_id tl-id})]
          (is (re-find #"name=\"Q&amp;A &lt;&quot;Launches&quot;&gt;\"" output))
          (is (re-find #"name=\"R&amp;D &lt;event&gt; &quot;one&quot;\"" output))
          (is (re-find #"a &lt; b &amp; c &gt; d" output))
          (is (not (re-find #"<event>" output))
              "user-supplied angle brackets must not survive as raw markup"))))))

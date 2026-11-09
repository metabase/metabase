(ns metabase.serialization.dependencies-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.serialization.core :as serialization]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest export-dependencies-test
  (testing "card depends on its collection and on cards its query uses"
    (let [mp (mt/metadata-provider)]
      (mt/with-temp [:model/Collection {coll-id :id}   {}
                     :model/Card       {source-id :id} {:dataset_query (lib/query mp (lib.metadata/table mp (mt/id :venues)))}
                     :model/Card       card            {:collection_id coll-id
                                                        :dataset_query (lib/query mp (lib.metadata/card mp source-id))}]
        (is (= [#{[:model/Collection coll-id] [:model/Card source-id]}]
               (mapv #(set (filter (comp #{:model/Collection :model/Card} first) %))
                     (serialization/export-dependencies :model/Card [card]))))))))

(deftest import-dependencies-test
  (testing "exported card depends on its collection and on cards its query uses"
    (is (= #{[:model/Collection "c"] [:model/Card "AAAAAAAAAAAAAAAAAAAAA"]}
           (first (serialization/import-dependencies :model/Card [{:serdes/meta   [{:model "Card"}]
                                                                   :collection_id "c"
                                                                   :dataset_query {:lib/type :mbql/query
                                                                                   :stages   [{:lib/type    :mbql.stage/mbql
                                                                                               :source-card "AAAAAAAAAAAAAAAAAAAAA"}]}}]))))))

(deftest ^:parallel visualization-settings-dependencies-test
  (let [eid (fn [c] (apply str (repeat 21 c)))]
    (testing "excluded events of older exports' [timeline-eid eid] pairs depend on the events by their entity ids"
      (is (= #{[:model/TimelineEvent (eid \b)] [:model/TimelineEvent (eid \d)]}
             (serialization/import-visualization-settings-dependencies
              {:timeline.excluded_timeline_event_ids [[(eid \a) (eid \b)] [(eid \c) (eid \d)]]}))))
    (testing "values that are not numeric ids are no dependencies"
      (is (= #{[:model/Timeline 1] [:model/TimelineEvent 2]}
             (serialization/export-visualization-settings-dependencies
              {:timeline.selected_timeline_ids       [1 "abc" nil]
               :timeline.excluded_timeline_event_ids [2 -1 "xyz"]}))))
    (testing "setting holding scalar instead of list counts as no ids"
      (is (= #{}
             (serialization/export-visualization-settings-dependencies
              {:timeline.selected_timeline_ids 7 :timeline.excluded_timeline_event_ids true}))))))

(deftest ^:parallel template-tag-table-id-dependencies-test
  (testing "template tag :table-id is no dependency, since import synthesizes missing Database and Table"
    (is (= #{} (serialization/import-mbql-dependencies {:table-id ["DB" "SCHEMA" "TABLE"]})))))

(deftest ^:parallel mbql-dependencies-format-parity-test
  (testing (str "MBQL dependencies find each reference on both exported and raw form of query, except Database, Table "
                "and Field, which import synthesizes")
    (let [models (fn [deps] (into #{} (map first) deps))
          eid    (fn [c] (apply str (repeat 21 c)))]
      (testing "MBQL ref clauses"
        (doseq [[label serialized raw ser-models raw-models]
                [["field (MBQL 5)" [:field {} ["DB" "S" "T" "F"]] [:field {} 53]   #{}               #{:model/Field}]
                 ["field (legacy)" [:field ["DB" "S" "T" "F"] {}] [:field 53 {}]   #{}               #{:model/Field}]
                 ["metric"         [:metric {} (eid \a)]          [:metric {} 99]  #{:model/Card}    #{:model/Card}]
                 ["segment"        [:segment {} (eid \b)]         [:segment {} 5]  #{:model/Segment} #{:model/Segment}]
                 ["measure"        [:measure {} (eid \c)]         [:measure {} 3]  #{:model/Measure} #{:model/Measure}]]]
          (testing label
            (is (= ser-models (models (serialization/import-mbql-dependencies serialized))) "exported form")
            (is (= raw-models (models (serialization/export-mbql-dependencies raw))) "raw form"))))
      (testing "MBQL map keys"
        (doseq [[label serialized raw ser-models raw-models]
                [["source-table" {:source-table ["DB" "S" "T"]} {:source-table 9} #{}                          #{:model/Table}]
                 ["source-card"  {:source-card (eid \d)}        {:source-card 7}  #{:model/Card}               #{:model/Card}]
                 ["snippet-id"   {:snippet-id (eid \e)}         {:snippet-id 2}   #{:model/NativeQuerySnippet} #{:model/NativeQuerySnippet}]]]
          (testing label
            (is (= ser-models (models (serialization/import-mbql-dependencies serialized))) "exported form")
            (is (= raw-models (models (serialization/export-mbql-dependencies raw))) "raw form")))))))

(deftest export-escapes-test
  (testing "escapes are dependencies outside given rows, with rows depending on them"
    (let [mp (mt/metadata-provider)]
      (mt/with-temp [:model/Collection {inside-id :id}  {}
                     :model/Collection {outside-id :id} {}
                     :model/Card       {source-id :id}  {:collection_id outside-id
                                                         :dataset_query (lib/query mp (lib.metadata/table mp (mt/id :venues)))}
                     :model/Card       {card-id :id}    {:collection_id inside-id
                                                         :dataset_query (lib/query mp (lib.metadata/card mp source-id))}]
        (let [escapes (serialization/export-escapes
                       {:model/Collection (t2/select :model/Collection :id inside-id)
                        :model/Card       (t2/select :model/Card :id [:in [source-id card-id]])})]
          (is (= #{[:model/Card source-id]} (get escapes [:model/Collection outside-id])))
          (is (contains? (get escapes [:model/Table (mt/id :venues)]) [:model/Card source-id]))
          (is (not (contains? escapes [:model/Collection inside-id])))
          (is (not (contains? escapes [:model/Card source-id]))))))))

(deftest import-escapes-test
  (testing "escapes are dependencies outside given entities and those they own, with keys depending on them"
    (let [eid       (fn [c] (apply str (repeat 21 c)))
          card      {:serdes/meta   [{:model "Card"}]
                     :entity_id     (eid \a)
                     :collection_id (eid \b)}
          dashboard {:serdes/meta   [{:model "Dashboard"}]
                     :entity_id     (eid \c)
                     :collection_id (eid \d)
                     :dashcards     [{:entity_id (eid \e) :card_id (eid \a)}
                                     {:entity_id (eid \f) :card_id (eid \g)}]}
          escapes   (serialization/import-escapes {:model/Card [card] :model/Dashboard [dashboard]})]
      (is (= {[:model/Collection (eid \b)] #{[:model/Card (eid \a)]}
              [:model/Collection (eid \d)] #{[:model/Dashboard (eid \c)]}
              [:model/Card (eid \g)]       #{[:model/Dashboard (eid \c)]}}
             escapes)))))

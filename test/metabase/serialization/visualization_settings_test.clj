(ns metabase.serialization.visualization-settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.serialization.protocol.stub :as protocol.stub]
   [metabase.serialization.visualization-settings :as viz]))

(defn- export-one [stubs x]
  (first (viz/export-visualization-settings (protocol.stub/stub-store stubs) [x])))

(defn- import-one [stubs x]
  (first (viz/import-visualization-settings (protocol.stub/stub-store stubs) [x] {})))

(deftest ^:parallel export-visualization-settings-test
  (let [export (partial export-one {:field (constantly ["A" "B" "C" "D"])
                                    :fk    (fn [id model] (format "%s___%d" (name model) id))})]
    (is (= {:column_settings
            {"[\"ref\",[\"field\",[\"A\",\"B\",\"C\",\"D\"],null]]"
             {:column_title "Locus"
              :click_behavior
              {:type     "link"
               :linkType "question"
               :targetId "Card___1"
               :parameterMapping
               {"[\"dimension\",[\"field\",[\"A\",\"B\",\"C\",\"D\"],{\"source-field\":[\"A\",\"B\",\"C\",\"D\"]}]]"
                {:id     "[\"dimension\",[\"field\",[\"A\",\"B\",\"C\",\"D\"],{\"source-field\":[\"A\",\"B\",\"C\",\"D\"]}]]"
                 :source {:type "column", :id "Category_ID", :name "Category ID"}
                 :target {:type      "dimension"
                          :id        "[\"dimension\",[\"field\",[\"A\",\"B\",\"C\",\"D\"],{\"source-field\":[\"A\",\"B\",\"C\",\"D\"]}]]"
                          :dimension [:dimension [:field ["A" "B" "C" "D"] {:source-field ["A" "B" "C" "D"]}]]}}}}}}}
           (export
            {:column_settings
             {"[\"ref\",[\"field\",54,null]]"
              {:column_title "Locus"
               :click_behavior
               {:type     "link"
                :linkType "question"
                :targetId 1
                :parameterMapping
                {(keyword "[\"dimension\",[\"field\",54,{\"source-field\":53}]]")
                 {:id     "[\"dimension\",[\"field\",54,{\"source-field\":53}]]"
                  :source {:type "column", :id "Category_ID", :name "Category ID"}
                  :target {:type      "dimension"
                           :id        "[\"dimension\",[\"field\",54,{\"source-field\":53}]]"
                           :dimension ["dimension" [:field 54 {:source-field 53}]]}}}}}}})))))

(deftest ^:parallel import-old-timeline-events-settings-test
  (testing "source-instance numeric IDs cannot select unrelated destination timelines or hide their events"
    (let [settings {:graph.show_values                    true
                    :timeline.selected_timeline_ids       [7]
                    :timeline.excluded_timeline_event_ids [42]}]
      (is (= {:graph.show_values                    true
              :timeline.selected_timeline_ids       []
              :timeline.excluded_timeline_event_ids []}
             (select-keys (import-one {} settings) (keys settings)))))))

(defn- export-timelines [settings]
  (export-one {:fk (fn [id model] (format "%s___%d" (name model) id))} settings))

(deftest ^:parallel export-malformed-timeline-events-settings-test
  (testing "values that are not numeric IDs are dropped on export instead of failing it"
    (let [settings {:timeline.selected_timeline_ids       [1 "abc" nil]
                    :timeline.excluded_timeline_event_ids [2 -1 "xyz"]}]
      (is (= {:timeline.selected_timeline_ids       ["Timeline___1"]
              :timeline.excluded_timeline_event_ids ["TimelineEvent___2"]}
             (select-keys (export-timelines settings) (keys settings)))))))

(deftest ^:parallel scalar-timeline-events-settings-test
  (testing "a setting holding a scalar instead of a list counts as no ids rather than failing export or import"
    (let [settings {:timeline.selected_timeline_ids       7
                    :timeline.excluded_timeline_event_ids true}
          cleared  {:timeline.selected_timeline_ids       []
                    :timeline.excluded_timeline_event_ids []}]
      (is (= cleared (select-keys (export-timelines settings) (keys settings))))
      (is (= cleared (select-keys (import-one {} settings) (keys settings)))))))

(deftest ^:parallel import-viz-settings-test
  (let [import-settings (partial import-one {:field (constantly 3)})]
    (is (= {:column_settings
            {"[\"ref\",[\"field\",3,null]]"
             {:click_behavior
              {:parameterMapping
               {"[\"dimension\",[\"field\",3,{\"source-field\":3}]]"
                {:id     "[\"dimension\",[\"field\",3,{\"source-field\":3}]]"
                 :target {:type      "dimension"
                          :dimension [:dimension [:field 3 {:source-field 3}]]
                          :id        "[\"dimension\",[\"field\",3,{\"source-field\":3}]]"}}}}}}}
           (import-settings
            {:column_settings
             {"[\"ref\",[\"field\",[\"my-db\",null,\"orders\",\"invoice\"],null]]"
              {:click_behavior
               {:parameterMapping
                {"[\"dimension\",[\"field\",[\"my-db\",null,\"orders\",\"invoice\"],{\"source-field\":[\"my-db\",null,\"orders\",\"subtotal\"]}]]"
                 {:id     "[\"dimension\",[\"field\",[\"my-db\",null,\"orders\",\"invoice\"],{\"source-field\":[\"my-db\",null,\"orders\",\"subtotal\"]}]]"
                  :target {:type      "dimension"
                           :dimension [:dimension
                                       [:field
                                        ["my-db" nil "orders" "invoice"]
                                        {:source-field ["my-db" nil "orders" "subtotal"]}]]
                           :id        "[\"dimension\",[\"field\",[\"my-db\",null,\"orders\",\"invoice\"],{\"source-field\":[\"my-db\",null,\"orders\",\"subtotal\"]}]]"}}}}}}})))))

(deftest ^:parallel visualizer-settings-lenient-import-test
  (testing "lenient import leaves a dangling visualizer card reference as it is"
    (let [eid      "AAAAAAAAAAAAAAAAAAAAA"
          settings {:visualization {:columnValuesMapping {:COLUMN_1 [{:sourceId (str "card:" eid)}]}}}
          import   (fn [opts]
                     (first (viz/import-visualizer-settings (protocol.stub/stub-store {:fk (constantly nil)})
                                                            [settings] opts)))]
      (is (= settings (import {:lenient? true})))
      (is (thrown? clojure.lang.ExceptionInfo (import {}))))))

(deftest ^:parallel export-visualization-settings-in-bulk-test
  (testing "exporting many visualization settings resolves each kind of reference with one store call per model"
    (let [calls    (atom [])
          store    (protocol.stub/stub-store
                    {:calls calls
                     :fk    (fn [id model] (str (name model) "_" id))
                     :field (fn [id] ["DB" "S" "T" (str "F" id)])})
          settings (for [i (range 1 4)]
                     {:column_settings {(str "[\"ref\",[\"field\"," i ",null]]")
                                        {:click_behavior {:type "link" :linkType "question" :targetId i}}}})]
      (is (= {:column_settings {"[\"ref\",[\"field\",[\"DB\",\"S\",\"T\",\"F3\"],null]]"
                                {:click_behavior {:type "link" :linkType "question" :targetId "Card_3"}}}}
             (last (viz/export-visualization-settings store settings))))
      (is (= {[:select-by-pks :model/Field]    1
              [:select-by-pks :model/Table]    1
              [:select-by-pks :model/Database] 1
              [:select-by-pks :model/Card]     1}
             (frequencies @calls))))))

(deftest ^:parallel import-owner-entity-id-pairs-test
  (testing "older exports' [owner-eid eid] pairs of timeline events and dashboard tabs import by their own entity id"
    (let [timeline-eid "TTTTTTTTTTTTTTTTTTTTT"
          event-eid    "EEEEEEEEEEEEEEEEEEEEE"
          tab-eid      "DDDDDDDDDDDDDDDDDDDDD"
          ids          {event-eid 2 tab-eid 3}]
      (is (=? {:timeline.excluded_timeline_event_ids [2]
               :click_behavior                       {:tabId 3}}
              (import-one {:fk (fn [eid _model] (get ids eid))}
                          {:timeline.excluded_timeline_event_ids [[timeline-eid event-eid]]
                           :click_behavior                       {:type     "link"
                                                                  :linkType "dashboard"
                                                                  :tabId    ["XXXXXXXXXXXXXXXXXXXXX" tab-eid]}}))))))

(deftest ^:parallel document-link-card-test
  (let [viz {:virtual_card {:display "link"}
             :link         {:entity {:id 2 :model "document" :name "My document"}}}]
    (testing "export converts linked document's id to its entity id"
      (is (= "Document___2"
             (get-in (export-one {:fk (fn [id model] (format "%s___%d" (name model) id))} viz)
                     [:link :entity :id]))))
    (testing "import resolves entity id"
      (is (= 7
             (get-in (import-one {:fk (fn [eid _model] (when (= eid "abc") 7))}
                                 (assoc-in viz [:link :entity :id] "abc"))
                     [:link :entity :id]))))))

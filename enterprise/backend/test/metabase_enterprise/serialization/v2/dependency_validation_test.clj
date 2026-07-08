(ns metabase-enterprise.serialization.v2.dependency-validation-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.test-util :as ts]
   [metabase-enterprise.serialization.v2.extract :as extract]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.models.serialization :as serdes]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :each (fn [f] (search.tu/with-index-disabled (f))))

(defn- by-model [model-name extraction]
  (->> extraction
       (into [])
       (filter #(= model-name ((comp :model last :serdes/meta) %)))))

(defn- ids-by-model [model-name extraction]
  (->> (by-model model-name extraction)
       (map (comp :id last :serdes/meta))
       set))

(defn- extract-aborts!
  "Realize `(extract/extract opts)`, asserting it aborts because a reference can't be satisfied (#75176, GHY-4010).
   Warnings are logged before the abort, so callers can still assert on the logged messages."
  [opts]
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"incomplete export"
                        (into [] (extract/extract opts)))))

(deftest escape-report-test
  (mt/with-empty-h2-app-db!
    (ts/with-temp-dpc [:model/Collection    {coll1-id :id}              {:name "Some Collection"}
                       :model/Collection    {coll2-id :id}              {:name "Other Collection"}
                       :model/Collection    {coll3-id :id}              {:name "Third Collection"}
                       :model/Collection    {clean-coll-id :id
                                             clean-coll-eid :entity_id} {:name "Clean Collection"}
                       :model/Dashboard     {dash-id :id}               {:name "A Dashboard" :collection_id coll1-id}
                       ;; non-H2 engine so the database survives serdes extract filtering
                       :model/Database      {db-id :id}                 {:engine :postgres}
                       :model/Card          {card1-id :id}              {:name "Some Card", :database_id db-id}
                       :model/Card          {clean-card-eid :entity_id} {:name          "Clean Card"
                                                                         :collection_id clean-coll-id
                                                                         :database_id   db-id}
                       :model/DashboardCard _              {:card_id card1-id :dashboard_id dash-id}
                       :model/Card          _              {:name          "Dependent Card"
                                                            :collection_id coll2-id
                                                            :dataset_query {:type     :query
                                                                            :database db-id
                                                                            :query    {:source-table (str "card__" card1-id)}}}
                       :model/User          user           {:email "dirk@kirk.ir"}
                       :model/Collection    pcoll          {:name              "Personal Collection"
                                                            :personal_owner_id (:id user)}
                       :model/Card          pcard          {:name          "Personal Card"
                                                            :collection_id (:id pcoll)}
                       :model/Card          _              {:name          "External Card"
                                                            :dataset_query {:database db-id
                                                                            :type     :query
                                                                            :query    {:source-table (str "card__" (:id pcard))}}}
                       :model/Card          _              {:name          "Card with parameters"
                                                            :collection_id coll3-id
                                                            :parameters    [{:id                   "abc"
                                                                             :type                 "category"
                                                                             :values_source_type   "card"
                                                                             :values_source_config {:card_id card1-id}}]}]
      (testing "Complain about card not available for exporting"
        (mt/with-log-messages-for-level [messages [metabase-enterprise :warn]]
          (extract-aborts! {:targets       [["Collection" coll1-id]]
                            :no-settings   true
                            :no-data-model true})
          (is (some #(re-find #"not included in the export" %)
                    (into #{}
                          (map :message)
                          (messages))))))
      (testing "Complain about card depending on an outside card: "
        (testing "when its :source-table"
          (mt/with-log-messages-for-level [messages [metabase-enterprise :warn]]
            (extract-aborts! {:targets       [["Collection" coll2-id]]
                              :no-settings   true
                              :no-data-model true})
            (is (some #(re-find #"not included in the export" %)
                      (into #{}
                            (map :message)
                            (messages))))))
        (testing "when it's :parameters"
          (mt/with-log-messages-for-level [messages [metabase-enterprise :warn]]
            ;; the parameter-referencing "Card with parameters" lives in coll3, so target coll3 to exercise it
            (extract-aborts! {:targets       [["Collection" coll3-id]]
                              :no-settings   true
                              :no-data-model true})
            (is (some #(re-find #"not included in the export" %)
                      (into #{}
                            (map :message)
                            (messages)))))))
      (testing "When exporting all collections"
        (testing "Complain about dependents in personal collections"
          (mt/with-log-messages-for-level [messages [metabase-enterprise :warn]]
            (extract-aborts! {:no-settings   true
                              :no-data-model true})
            (is (some #(re-find #"not included in the export" %)
                      (into #{}
                            (map :message)
                            (messages)))))))
      (testing "exporting a clean collection works even when other collections have escape issues"
        (let [extracted (into [] (extract/extract {:targets       [["Collection" clean-coll-id]]
                                                   :no-settings   true
                                                   :no-data-model true
                                                   :no-transforms true}))]
          (is (= #{clean-coll-eid} (ids-by-model "Collection" extracted)))
          (is (= #{clean-card-eid} (ids-by-model "Card" extracted)))))
      (testing "data-model-only export is not blocked by dependency validation"
        (let [extracted (into [] (extract/extract {:no-collections true
                                                   :no-settings    true
                                                   :no-transforms  true}))]
          (is (seq (filter #(= "Database" (-> % :serdes/meta last :model)) extracted))
              "Databases should be exported even when cards reference personal collections"))))))

(deftest escape-continue-on-error-test
  (testing "continue-on-error lets the export proceed past dependency validation instead of aborting (#74622)"
    (mt/with-empty-h2-app-db!
      (ts/with-temp-dpc [;; non-H2 engine so the database survives serdes extract filtering
                         :model/Database      {db-id :id}            {:engine :postgres}
                         :model/Collection    {coll-id  :id
                                               coll-eid :entity_id}  {:name "Target Collection"}
                         :model/Card          {clean-eid :entity_id} {:name          "Clean Card"
                                                                      :collection_id coll-id
                                                                      :database_id   db-id}
                         :model/Dashboard     {dash-id  :id
                                               dash-eid :entity_id}  {:name "A Dashboard" :collection_id coll-id}
                         ;; this card lives outside the target collection, so it "escapes"
                         :model/Card          {escaped-eid :entity_id
                                               escaped-id  :id}      {:name "Escaped Card" :database_id db-id}
                         :model/DashboardCard _                      {:card_id escaped-id :dashboard_id dash-id}]
        (let [opts {:targets [["Collection" coll-id]] :no-settings true :no-data-model true}]
          (testing "without the flag, dependency validation aborts the whole export with an error (#75176)"
            (extract-aborts! opts))
          (testing "with continue-on-error, everything in the target collection is exported and the escaped card is left out"
            (mt/with-log-messages-for-level [messages [metabase-enterprise :warn]]
              (let [extracted (into [] (extract/extract (assoc opts :continue-on-error true)))]
                (is (= #{coll-eid} (ids-by-model "Collection" extracted)))
                (is (= #{dash-eid} (ids-by-model "Dashboard" extracted)))
                (is (contains? (ids-by-model "Card" extracted) clean-eid)
                    "the clean card inside the target collection is exported")
                (is (not (contains? (ids-by-model "Card" extracted) escaped-eid))
                    "the escaped card outside the target collection is not exported")
                (is (some #(re-find #"not included in the export" %)
                          (map :message (messages)))
                    "the unsatisfied reference is still logged as a warning")))))))))

(deftest dependency-validation-missing-data-ref-test
  (testing "Export aborts when a card references a data-model row that no longer exists in the appdb (GHY-4010)"
    ;; The card still serializes a portable reference by looking the row up; with the row gone that reference would be
    ;; malformed, so the export must fail fast. Covered across the reference kinds the old lib-walker-only derivation
    ;; missed: a Field or Segment in the query, and a Field reachable only through visualization_settings (a
    ;; JSON-encoded ref the query walkers don't see). (continue-on-error's abort suppression is covered by
    ;; escape-continue-on-error-test.)
    (mt/with-empty-h2-app-db!
      (ts/with-temp-dpc [;; non-H2 engine so the database survives serdes extract filtering
                         :model/Database   {db-id :id}    {:engine :postgres}
                         :model/Table      {table-id :id} {:db_id db-id :name "T"}
                         :model/Collection {coll-id :id}  {:name "Target Collection"}]
        (let [opts {:targets [["Collection" coll-id]] :no-settings true :no-data-model true :no-transforms true}]
          (doseq [{:keys [label query-filter viz-settings delete! msg-re]}
                  [{:label        "a Field referenced in the query"
                    :query-filter (fn [field-id _seg-id] [:> [:field field-id nil] 1])
                    :delete!      (fn [field-id _seg-id] (t2/delete! :model/Field field-id))
                    :msg-re       #"Field .* is missing from the source database"}
                   {:label        "a Segment referenced in the query"
                    :query-filter (fn [_field-id seg-id] [:segment seg-id])
                    :delete!      (fn [_field-id seg-id] (t2/delete! :model/Segment seg-id))
                    :msg-re       #"Segment .* is missing from the source database"}
                   {:label        "a Field referenced only in visualization_settings"
                    :viz-settings (fn [field-id] {:column_settings {(str "[\"ref\",[\"field\"," field-id ",null]]")
                                                                    {:column_title "X"}}})
                    :delete!      (fn [field-id _seg-id] (t2/delete! :model/Field field-id))
                    :msg-re       #"Field .* is missing from the source database"}]]
            (testing label
              (ts/with-temp-dpc [:model/Field   {field-id :id}   {:table_id table-id :name "F" :base_type :type/Integer}
                                 :model/Segment {segment-id :id} {:table_id table-id :name "Seg" :definition {}}
                                 :model/Card    _ {:name          "Card"
                                                   :collection_id coll-id
                                                   :database_id   db-id
                                                   :table_id      table-id
                                                   :query_type    :query
                                                   :dataset_query (cond-> {:database db-id
                                                                           :type     :query
                                                                           :query    {:source-table table-id}}
                                                                    query-filter
                                                                    (assoc-in [:query :filter]
                                                                              (query-filter field-id segment-id)))
                                                   :visualization_settings (if viz-settings
                                                                             (viz-settings field-id)
                                                                             {})}]
                (testing "with the reference present, the export succeeds"
                  (is (seq (into [] (extract/extract opts)))))
                (delete! field-id segment-id)
                (testing "after the reference is deleted, the export aborts and names it"
                  (mt/with-log-messages-for-level [messages [metabase-enterprise :warn]]
                    (extract-aborts! opts)
                    (is (some #(re-find msg-re %) (map :message (messages)))
                        "the warning reports the unsatisfied data-model reference")))))))))))

(deftest serialization-dependencies-content-models-test
  (testing "serialization-dependencies derives export deps from the raw entity for the newly-covered content models (GHY-4010)"
    (mt/with-empty-h2-app-db!
      (ts/with-temp-dpc [;; non-H2 engine so the database survives serdes extract filtering
                         :model/Database   {db-id :id}         {:engine :postgres}
                         :model/Table      {table-id :id}      {:db_id db-id :name "T"}
                         :model/Field      {field-id :id}      {:table_id table-id :name "F" :base_type :type/Integer}
                         :model/Collection {parent-id :id}     {:name "Parent"}
                         :model/Collection {child-id :id}      {:name "Child" :location (str "/" parent-id "/")}
                         :model/Collection {snip-coll-id :id}   {:name "Snips" :namespace "snippets"}
                         :model/Card       {model-card-id :id} {:name "Model" :type :model :database_id db-id}
                         :model/Card       {embed-card-id :id} {:name "Embedded" :database_id db-id}]
        (let [deps (fn [model id]
                     (serdes/serialization-dependencies model (t2/select-one (keyword "model" model) :id id)))]
          (testing "Collection derives its parent from the raw :location path"
            (is (= #{[{:model "Collection" :id parent-id}]} (deps "Collection" child-id)))
            (is (empty? (deps "Collection" parent-id)) "a root collection has no parent dependency"))
          (testing "Timeline references its containing collection"
            (let [tl-id (t2/insert-returning-pk! :model/Timeline {:name "TL" :icon "star" :collection_id child-id :creator_id (mt/user->id :rasta)})]
              (is (= #{[{:model "Collection" :id child-id}]} (deps "Timeline" tl-id)))))
          (testing "NativeQuerySnippet references its containing collection"
            (let [snip-id (t2/insert-returning-pk! :model/NativeQuerySnippet
                                                   {:name "snip" :content "1=1" :collection_id snip-coll-id
                                                    :creator_id (mt/user->id :rasta)})]
              (is (= #{[{:model "Collection" :id snip-coll-id}]} (deps "NativeQuerySnippet" snip-id)))))
          (testing "Action (query) references its model Card, Database, and the tables/fields in its query"
            (let [action-id (t2/insert-returning-pk! :model/Action {:name "A" :type :query :model_id model-card-id})]
              (t2/insert! :model/QueryAction {:action_id     action-id
                                              :database_id   db-id
                                              :dataset_query {:database db-id
                                                              :type     :query
                                                              :query    {:source-table table-id
                                                                         :filter       [:> [:field field-id nil] 1]}}})
              (is (= #{[{:model "Card" :id model-card-id}]
                       [{:model "Database" :id db-id}]
                       [{:model "Table" :id table-id}]
                       [{:model "Field" :id field-id}]}
                     (deps "Action" action-id)))))
          (testing "Document references its embedded cards and its containing collection"
            (let [doc-id (t2/insert-returning-pk! :model/Document
                                                  {:name          "D"
                                                   :collection_id child-id
                                                   :creator_id    (mt/user->id :rasta)
                                                   :content_type  prose-mirror/prose-mirror-content-type
                                                   :document      {:type    "doc"
                                                                   :content [{:type  "cardEmbed"
                                                                              :attrs {:id embed-card-id}}]}})]
              (is (= #{[{:model "Collection" :id child-id}]
                       [{:model "Card" :id embed-card-id}]}
                     (deps "Document" doc-id))))))))))

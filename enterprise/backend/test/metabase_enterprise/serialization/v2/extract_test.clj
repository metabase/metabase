(ns metabase-enterprise.serialization.v2.extract-test
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.test-util :as ts]
   [metabase-enterprise.serialization.v2.extract :as extract]
   [metabase-enterprise.serialization.v2.select :as select]
   [metabase.audit-app.core :as audit]
   [metabase.collections.test-utils :refer [personal-collection]]
   [metabase.core.core :as mbc]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.search.test-util :as search.tu]
   [metabase.serialization.core :as serialization]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :each (fn [f] (search.tu/with-index-disabled (f))))

(defn- by-model [model-name extraction]
  (->> extraction
       (into [])
       (filter #(= model-name ((comp :model last :serdes/meta) %)))))

(defn- ids-by-model [model-name extraction]
  (->> (by-model model-name extraction)
       (map (comp second serialization/key-of))
       set))

(defn- extract-aborts!
  "Realizes `(extract/extract opts)`, asserting it aborts with the dependency validation error (#75176)."
  [opts]
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"incomplete export"
                        (dorun (extract/extract opts)))))

(defn- do-with-selective-fixture!
  "Calls `f` with the ids of three nested Collections with a Dashboard and Cards each, and of Dashboards whose
  parameters and click behaviors refer outside their Collections."
  [f]
  (mt/with-empty-h2-app-db!
    (ts/with-temp-dpc [:model/User       {mark-id :id}              {:first_name "Mark"
                                                                     :last_name  "Knopfler"
                                                                     :email      "mark@direstrai.ts"}
                       :model/Collection {coll1-id   :id
                                          coll1-eid  :entity_id}    {:name "Some Collection"}
                       :model/Collection {coll2-id   :id
                                          coll2-eid  :entity_id}    {:name     "Nested Collection"
                                                                     :location (str "/" coll1-id "/")}
                       :model/Collection {coll3-id   :id
                                          coll3-eid  :entity_id}    {:name     "Grandchild Collection"
                                                                     :location (str "/" coll1-id "/" coll2-id "/")}
                       :model/Database   {db-id      :id}           {:name "My Database"}
                       :model/Table      {no-schema-id :id}         {:name "Schemaless Table" :db_id db-id}
                       :model/Field      _                          {:name "Some Field" :table_id no-schema-id}
                       :model/Table      {schema-id    :id}         {:name        "Schema'd Table"
                                                                     :db_id       db-id
                                                                     :schema      "PUBLIC"}
                       :model/Field      {field-id :id}             {:name "Other Field" :table_id schema-id}
                       :model/Field      {field-id2 :id}            {:name "Field To Click 1" :table_id schema-id}
                       :model/Field      {field-id3 :id}            {:name "Field To Click 2" :table_id schema-id}
                       ;; One dashboard and three cards in each of the three collections:
                       ;; Two cards contained in the dashboard and one freestanding.
                       :model/Dashboard  {dash1-id     :id
                                          dash1-eid    :entity_id}  {:name          "Dashboard 1"
                                                                     :collection_id coll1-id
                                                                     :creator_id    mark-id}
                       :model/Card       {c1-1-id  :id
                                          c1-1-eid :entity_id}      {:name          "Question 1-1"
                                                                     :database_id   db-id
                                                                     :table_id      no-schema-id
                                                                     :collection_id coll1-id
                                                                     :creator_id    mark-id}
                       :model/Card       {c1-2-id  :id
                                          c1-2-eid :entity_id}      {:name          "Question 1-2"
                                                                     :database_id   db-id
                                                                     :table_id      schema-id
                                                                     :collection_id coll1-id
                                                                     :creator_id    mark-id}
                       :model/Card       {c1-3-eid :entity_id}      {:name          "Question 1-3"
                                                                     :database_id   db-id
                                                                     :table_id      schema-id
                                                                     :collection_id coll1-id
                                                                     :creator_id    mark-id}
                       :model/DashboardCard _                       {:card_id      c1-1-id
                                                                     :dashboard_id dash1-id}
                       :model/DashboardCard _                       {:card_id      c1-2-id
                                                                     :dashboard_id dash1-id}
                       ;; Second dashboard, in the middle collection.
                       :model/Dashboard  {dash2-id     :id
                                          dash2-eid    :entity_id}  {:name          "Dashboard 2"
                                                                     :collection_id coll2-id
                                                                     :creator_id    mark-id}
                       :model/Card       {c2-1-id  :id
                                          c2-1-eid :entity_id}      {:name          "Question 2-1"
                                                                     :database_id   db-id
                                                                     :table_id      no-schema-id
                                                                     :collection_id coll2-id
                                                                     :creator_id    mark-id}
                       :model/Card       {c2-2-id  :id
                                          c2-2-eid :entity_id}      {:name          "Question 2-2"
                                                                     :database_id   db-id
                                                                     :table_id      schema-id
                                                                     :collection_id coll2-id
                                                                     :creator_id    mark-id}
                       :model/Card       {c2-3-eid :entity_id}      {:name          "Question 2-3"
                                                                     :database_id   db-id
                                                                     :table_id      schema-id
                                                                     :collection_id coll2-id
                                                                     :creator_id    mark-id}
                       :model/DashboardCard _                       {:card_id      c2-1-id
                                                                     :dashboard_id dash2-id}
                       :model/DashboardCard _                       {:card_id      c2-2-id
                                                                     :dashboard_id dash2-id}
                       ;; Third dashboard, in the grandchild collection.
                       :model/Dashboard  {dash3-id     :id
                                          dash3-eid    :entity_id}  {:name          "Dashboard 3"
                                                                     :collection_id coll3-id
                                                                     :creator_id    mark-id}
                       :model/Card       {c3-1-id  :id
                                          c3-1-eid :entity_id}      {:name          "Question 3-1"
                                                                     :database_id   db-id
                                                                     :table_id      no-schema-id
                                                                     :collection_id coll3-id
                                                                     :creator_id    mark-id}
                       :model/Card       {c3-2-id  :id
                                          c3-2-eid :entity_id}      {:name          "Question 3-2"
                                                                     :database_id   db-id
                                                                     :table_id      schema-id
                                                                     :collection_id coll3-id
                                                                     :creator_id    mark-id}
                       :model/Card       {c3-3-eid :entity_id}      {:name          "Question 3-3"
                                                                     :database_id   db-id
                                                                     :table_id      schema-id
                                                                     :collection_id coll3-id
                                                                     :creator_id    mark-id}
                       :model/DashboardCard _                       {:card_id      c3-1-id
                                                                     :dashboard_id dash3-id}
                       :model/DashboardCard _                       {:card_id      c3-2-id
                                                                     :dashboard_id dash3-id}
                       ;; Fourth dashboard where its parameter's source is another card
                       :model/Collection   {coll4-id   :id
                                            _coll4-eid :entity_id}    {:name     "Forth collection"}
                       :model/Card         {c4-id  :id
                                            c4-eid :entity_id}        {:name          "Question 4-1"
                                                                       :database_id   db-id
                                                                       :table_id      no-schema-id
                                                                       :collection_id coll4-id
                                                                       :creator_id    mark-id
                                                                       :parameters    [{:id                   "abc"
                                                                                        :type                 "category"
                                                                                        :name                 "CATEGORY"
                                                                                        :values_source_type   "card"
                                                                                        ;; card_id is in a different collection with dashboard's collection
                                                                                        :values_source_config {:card_id     c1-1-id
                                                                                                               :value_field [:field field-id nil]}}]}
                       :model/Dashboard    {dash4-id     :id
                                            dash4-eid    :entity_id}  {:name          "Dashboard 4"
                                                                       :collection_id coll4-id
                                                                       :creator_id    mark-id
                                                                       :parameters    [{:id                   "def"
                                                                                        :type                 "category"
                                                                                        :name                 "CATEGORY"
                                                                                        :values_source_type   "card"
                                                                                        ;; card_id is in a different collection with dashboard's collection
                                                                                        :values_source_config {:card_id     c1-2-id
                                                                                                               :value_field [:field field-id nil]}}]}
                       :model/DashboardCard _                       {:card_id      c4-id
                                                                     :dashboard_id dash4-id}
                       ;; Fifth dashboard which has :click_behavior defined.
                       :model/Collection    {coll5-id      :id}        {:name          "Fifth collection"}
                       :model/Dashboard     {clickdash-id  :id
                                             clickdash-eid :entity_id} {:name          "Dashboard with click behavior"
                                                                        :collection_id coll5-id
                                                                        :creator_id    mark-id}
                       :model/DashboardCard _                          {:card_id      c3-1-id
                                                                        :dashboard_id clickdash-id
                                                                        :visualization_settings
                                                                        ;; Top-level click behavior for the card.
                                                                        (let [dimension  [:dimension [:field "something" {:base-type "type/Text"}]]
                                                                              mapping-id (json/encode dimension)]
                                                                          {:click_behavior {:type     "link"
                                                                                            :linkType "question"
                                                                                            :targetId c3-2-id
                                                                                            :parameterMapping
                                                                                            {mapping-id {:id     mapping-id
                                                                                                         :source {:type "column"
                                                                                                                  :id   "whatever"
                                                                                                                  :name "Just to serialize"}
                                                                                                         :target {:type      "dimension"
                                                                                                                  :id        mapping-id
                                                                                                                  :dimension dimension}}}}})}
                       ;;; stress-test that exporting various visualization_settings does not break
                       :model/DashboardCard _                          {:card_id c3-1-id
                                                                        :dashboard_id clickdash-id
                                                                        :visualization_settings
                                                                        {:column_settings
                                                                         {(str "[\"ref\",[\"field\"," field-id ",null]]")
                                                                          {:click_behavior
                                                                           {:type     "link"
                                                                            :linkType "dashboard"
                                                                            :targetId dash4-id}}
                                                                          (str "[\"ref\",[\"field\"," field-id2 ",null]]")
                                                                          {:click_behavior
                                                                           {:type "crossfilter"
                                                                            :parameterMapping
                                                                            {"abcdef" {:id "abcdef"
                                                                                       :source {:type "column"
                                                                                                :id field-id2
                                                                                                :name "Field To Click 1"}
                                                                                       :target {:type "parameter"
                                                                                                :id "abcdef"}}}}}
                                                                          (str "[\"ref\",[\"field\"," field-id3 ",null]]")
                                                                          (let [mapping-id (format "[\"dimension\",[\"fk->\",[\"field\",%d,null],[\"field\",%d,null]]]" field-id3 field-id)
                                                                                dimension [:dimension [:field field-id {:source-field field-id3}]]]
                                                                            {:click_behavior
                                                                             {:type "link"
                                                                              :linkType "question"
                                                                              :targetId c4-id
                                                                              :parameterMapping
                                                                              {mapping-id {:id mapping-id
                                                                                           :source {:type "column"
                                                                                                    :id   "Category_ID"
                                                                                                    :name "Category ID"}
                                                                                           :target {:type      "dimension"
                                                                                                    :id        mapping-id
                                                                                                    :dimension dimension}}}}})}}}]
      (f {:coll1-id coll1-id :coll2-id coll2-id :coll3-id coll3-id :coll4-id coll4-id
          :coll1-eid coll1-eid :coll2-eid coll2-eid :coll3-eid coll3-eid :dash1-id dash1-id
          :dash1-eid dash1-eid :dash2-eid dash2-eid :dash3-eid dash3-eid :clickdash-id clickdash-id
          :c1-1-id c1-1-id :c1-1-eid c1-1-eid :c1-2-id c1-2-id :c1-2-eid c1-2-eid
          :c1-3-eid c1-3-eid :c2-1-eid c2-1-eid :c2-2-eid c2-2-eid :c2-3-eid c2-3-eid
          :c3-1-id c3-1-id :c3-1-eid c3-1-eid :c3-2-eid c3-2-eid :c3-3-eid c3-3-eid
          :c4-eid c4-eid :dash4-eid dash4-eid :clickdash-eid clickdash-eid}))))

(deftest selective-serialization-targets-test
  (do-with-selective-fixture!
   (fn [{:keys [coll1-id dash1-id dash1-eid clickdash-id clickdash-eid dash4-eid c1-1-eid c1-2-eid c3-1-eid c3-2-eid
                c4-eid]}]
     (testing "selecting a collection includes settings metabot and data model by default"
       (is (= #{"Card" "Collection" "Dashboard" "Database" "Field" "PythonLibrary" "Setting" "Table" "TransformTag"
                "TransformJob"}
              (->> (extract/extract {:targets [[:model/Collection coll1-id]] :include-h2? true})
                   (map (comp name first serialization/key-of))
                   set))))
     (testing "targeting dashboard gets the cards it shows"
       (is (set/subset? #{[:model/Dashboard dash1-eid] [:model/Card c1-1-eid] [:model/Card c1-2-eid]}
                        (->> (extract/extract {:targets       [[:model/Dashboard dash1-id]]
                                               :no-settings   true
                                               :no-data-model true
                                               :no-transforms true})
                             (map serialization/key-of)
                             set))))
     (testing "targeting dashboard gets the dashboards and cards it links to when clicked"
       (is (set/subset? #{[:model/Dashboard clickdash-eid] [:model/Card c3-1-eid] [:model/Card c3-2-eid]
                          [:model/Dashboard dash4-eid] [:model/Card c4-eid] [:model/Card c1-1-eid]}
                        (->> (extract/extract {:targets       [[:model/Dashboard clickdash-id]]
                                               :no-settings   true
                                               :no-data-model true
                                               :no-transforms true})
                             (map serialization/key-of)
                             set)))))))

(deftest selective-serialization-collections-test
  (do-with-selective-fixture!
   (fn [{:keys [coll1-id coll2-id coll3-id coll4-id coll1-eid coll2-eid coll3-eid dash1-eid dash2-eid dash3-eid c1-1-eid c1-2-eid c1-3-eid c2-1-eid c2-2-eid c2-3-eid c3-1-eid c3-2-eid c3-3-eid]}]
     (testing "selecting a collection gets all its contents"
       (let [grandchild-paths  #{[:model/Collection coll3-eid]
                                 [:model/Dashboard dash3-eid]
                                 [:model/Card c3-1-eid]
                                 [:model/Card c3-2-eid]
                                 [:model/Card c3-3-eid]}
             middle-paths      #{[:model/Collection coll2-eid]
                                 [:model/Dashboard dash2-eid]
                                 [:model/Card c2-1-eid]
                                 [:model/Card c2-2-eid]
                                 [:model/Card c2-3-eid]}
             grandparent-paths #{[:model/Collection coll1-eid]
                                 [:model/Dashboard dash1-eid]
                                 [:model/Card c1-1-eid]
                                 [:model/Card c1-2-eid]
                                 [:model/Card c1-3-eid]}]
         (testing "grandchild collection has all its own contents and its ancestors without their contents"
           (is (= (conj grandchild-paths [:model/Collection coll1-eid] [:model/Collection coll2-eid])
                  (->> (extract/extract {:targets [[:model/Collection coll3-id]] :no-settings true :no-data-model true :no-transforms true})
                       (map serialization/key-of)
                       set))))
         (testing "middle collection has all its own plus grandchild and its contents, and its parent without its contents"
           (is (= (conj (set/union middle-paths grandchild-paths) [:model/Collection coll1-eid])
                  (->> (extract/extract {:targets [[:model/Collection coll2-id]] :no-settings true :no-data-model true :no-transforms true})
                       (map serialization/key-of)
                       set))))
         (testing "grandparent collection has all its own plus the grandchild and middle collections with contents"
           (is (= (set/union grandparent-paths middle-paths grandchild-paths)
                  (->> (extract/extract {:targets [[:model/Collection coll1-id]] :no-settings true :no-data-model true :no-transforms true})
                       (map serialization/key-of)
                       set))))
         (testing "collection whose content depends on cards in other collections aborts"
           (extract-aborts! {:targets [[:model/Collection coll4-id]] :no-settings true :no-data-model true :no-transforms true})))))))

(deftest personal-collection-dependency-aborts-export-test
  (testing "export of collection whose card uses card in personal collection aborts instead of taking it"
    (mt/with-temp [:model/Collection {coll-id :id}   {:name "Shared"}
                   :model/Card       {source-id :id} {:name          "Personal source"
                                                      :collection_id (t2/select-one-pk :model/Collection
                                                                                       :personal_owner_id (mt/user->id :rasta))}]
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Card _ {:name          "Shared card"
                                      :collection_id coll-id
                                      :dataset_query (lib/query mp (lib.metadata/card mp source-id))}]
          (extract-aborts! {:targets [[:model/Collection coll-id]] :no-settings true :no-data-model true :no-transforms true}))))))

(deftest collection-export-takes-snippet-folders-test
  (testing "export of collection whose card uses snippet takes snippet and its folder"
    (mt/with-temp [:model/Collection         {folder-id :id folder-eid :entity_id} {:name "Snippet folder" :namespace "snippets"}
                   :model/NativeQuerySnippet {snippet-id :id snippet-name :name snippet-eid :entity_id}
                   {:name "folder snippet" :content "1" :collection_id folder-id}
                   :model/Collection         {coll-id :id} {:name "Target"}]
      (let [mp  (mt/metadata-provider)
            tag (str "snippet: " snippet-name)]
        (mt/with-temp [:model/Card _ {:name          "Native"
                                      :collection_id coll-id
                                      :dataset_query (lib/with-template-tags
                                                       (lib/native-query mp (str "SELECT {{" tag "}}"))
                                                       {tag {:type         :snippet
                                                             :name         tag
                                                             :display-name "Snippet"
                                                             :snippet-name snippet-name
                                                             :snippet-id   snippet-id
                                                             :id           "5b7a0d0e-0000-4000-8000-000000000001"}})}]
          (let [ser (into [] (extract/extract {:targets [[:model/Collection coll-id]] :no-settings true
                                               :no-data-model true :no-transforms true}))]
            (is (contains? (ids-by-model "NativeQuerySnippet" ser) snippet-eid))
            (is (contains? (ids-by-model "Collection" ser) folder-eid))))))))

(deftest click-behavior-references-to-deleted-cards
  (mt/with-empty-h2-app-db!
    (ts/with-temp-dpc [:model/User       {mark-id :id}              {:first_name "Mark"
                                                                     :last_name  "Knopfler"
                                                                     :email      "mark@direstrai.ts"}
                       :model/Collection {coll-id   :id
                                          coll-eid  :entity_id}    {:name "Some Collection"}
                       :model/Database   {db-id      :id}           {:name "My Database"}
                       :model/Table      {no-schema-id :id}         {:name "Schemaless Table" :db_id db-id}
                       :model/Field      _                          {:name "Some Field" :table_id no-schema-id}
                       :model/Table      {schema-id    :id}         {:name        "Schema'd Table"
                                                                     :db_id       db-id
                                                                     :schema      "PUBLIC"}
                       :model/Field      {field-id :id}             {:name "Other Field" :table_id schema-id}
                       :model/Field      {field-id3 :id}            {:name "Field To Click 2" :table_id schema-id}
                       :model/Card       {card-id  :id
                                          card-eid :entity_id}      {:name          "A Normal Question"
                                                                     :database_id   db-id
                                                                     :table_id      no-schema-id
                                                                     :collection_id coll-id
                                                                     :creator_id    mark-id}
                       :model/Card       {deleted-card-id :id}      {:collection_id coll-id}
                       :model/Dashboard  {deleted-dash-id :id}      {:collection_id coll-id}
                       :model/Dashboard     {clickdash-id  :id
                                             clickdash-eid :entity_id} {:name          "Dashboard"
                                                                        :collection_id coll-id
                                                                        :creator_id    mark-id}
                       :model/DashboardCard _                          {:card_id      card-id
                                                                        :dashboard_id clickdash-id
                                                                        :visualization_settings
                                                                        ;; links to a (soon-to-be) deleted card
                                                                        {:click_behavior {:type     "link"
                                                                                          :linkType "question"
                                                                                          :targetId deleted-card-id}}}
                       ;;; stress-test that exporting various visualization_settings does not break
                       :model/DashboardCard _                          {:card_id card-id
                                                                        :dashboard_id clickdash-id
                                                                        :visualization_settings
                                                                        {:column_settings
                                                                         {(str "[\"ref\",[\"field\"," field-id ",null]]")
                                                                          {:click_behavior
                                                                           {:type     "link"
                                                                            :linkType "dashboard"
                                                                            :targetId deleted-dash-id}}

                                                                          (str "[\"ref\",[\"field\"," field-id3 ",null]]")
                                                                          {:click_behavior
                                                                           {:type "link"
                                                                            :linkType "question"
                                                                            :targetId deleted-card-id}}}}}]
      (t2/delete! :model/Card :id deleted-card-id)
      (t2/delete! :model/Dashboard :id deleted-dash-id)
      (testing "the references to deleted cards and dashboards are ignored"
        (is (= #{[:model/Dashboard clickdash-eid]
                 [:model/Collection coll-eid]
                 [:model/Card card-eid]}
               (->> {:targets [[:model/Collection coll-id]]
                     :no-settings true :no-data-model true :no-transforms true}
                    extract/extract
                    (map serialization/key-of)
                    (into #{})))))
      (testing "the click behavior looks sane"
        (is (= #{{}
                 {:column_settings {"[\"ref\",[\"field\",[\"My Database\",\"PUBLIC\",\"Schema'd Table\",\"Other Field\"],null]]" {}
                                    "[\"ref\",[\"field\",[\"My Database\",\"PUBLIC\",\"Schema'd Table\",\"Field To Click 2\"],null]]" {}}}}
               (->> {:targets [[:model/Collection coll-id]]
                     :no-settings true :no-data-model true :no-transforms true}
                    extract/extract
                    (filter #(= (:entity_id %) clickdash-eid))
                    first
                    :dashcards
                    (map :visualization_settings)
                    (into #{}))))))))

(deftest recursive-colls-test
  (mt/with-empty-h2-app-db!
    (mt/with-temp [:model/Collection {parent-id  :id
                                      parent-eid :entity_id} {:name "Top-Level Collection"}
                   :model/Collection {middle-id  :id
                                      middle-eid :entity_id} {:name     "Nested Collection"
                                                              :location (format "/%s/" parent-id)}
                   :model/Collection {nested-id  :id
                                      nested-eid :entity_id} {:name     "Nested Collection"
                                                              :location (format "/%s/%s/" parent-id middle-id)}
                   :model/Card       _                       {:name          "Card To Skip"
                                                              :collection_id parent-id}
                   :model/Card       {ncard-eid :entity_id}  {:name          "Card To Export"
                                                              :collection_id nested-id}]
      (let [ser (extract/extract {:targets       [[:model/Collection nested-id]]
                                  :no-settings   true
                                  :no-data-model true})]
        (is (= #{parent-eid middle-eid nested-eid}
               (ids-by-model "Collection" ser)))
        (is (= #{ncard-eid}
               (ids-by-model "Card" ser)))))))

(deftest skip-analytics-collections-test
  (testing "Collections in 'analytics' namespace should not be extracted, see #37453"
    (mt/with-empty-h2-app-db!
      (mbc/ensure-audit-db-installed!)
      (testing "sanity check that the audit collection exists"
        (is (some? (audit/default-audit-collection)))
        (is (some? (audit/default-custom-reports-collection))))
      (let [ser (extract/extract {:no-settings   true
                                  :no-data-model true})]
        (is (= #{} (ids-by-model "Collection" ser)))))))

(deftest skip-h2-databases-test
  (testing "H2 databases must not be extracted because import rejects them (see GHY-3633)"
    (mt/with-empty-h2-app-db!
      (mt/with-temp [:model/Database _h2-db   {:name "H2 DB"        :engine :h2}
                     :model/Database _non-h2  {:name "Postgres DB"  :engine :postgres}]
        (let [ser (extract/extract {:no-settings true})]
          (is (= #{"Postgres DB"} (ids-by-model "Database" ser))
              "Only non-H2 databases should appear in the extract"))))))

(deftest skip-stub-databases-test
  (testing "Stub databases are not extracted, so an import can never turn a real database into a stub"
    (mt/with-empty-h2-app-db!
      (mt/with-temp [:model/Database _stub {:name "Stub DB"     :engine :postgres :is_stub true}
                     :model/Database _real {:name "Postgres DB" :engine :postgres}]
        (is (= #{"Postgres DB"} (ids-by-model "Database" (extract/extract {:no-settings true}))))))))

(deftest xray-of-analytics-model-export-test
  (testing "X-rays of analytics models can be exported without errors"
    (mt/with-empty-h2-app-db!
      (mbc/ensure-audit-db-installed!)
      (testing "sanity check that the analytics content exists"
        (is (some? (audit/default-audit-collection)))
        ;; Find the Query log model (entity_id: QOtZaiTLf2FDD4AT6Oinb)
        (let [query-log-card (t2/select-one :model/Card :entity_id "QOtZaiTLf2FDD4AT6Oinb")]
          (is (some? query-log-card) "Query log model should exist in analytics")
          (when query-log-card
            ;; Create a card that depends on the analytics model (simulating an x-ray)
            (mt/with-temp [:model/Collection {coll-id :id coll-eid :entity_id} {:name "Test Collection"}
                           :model/Card {_xray-card-id :id xray-card-eid :entity_id}
                           {:name          "X-ray of Query log"
                            :collection_id coll-id
                            :database_id   (:database_id query-log-card)
                            :dataset_query {:type     :query
                                            :database (:database_id query-log-card)
                                            :query    {:source-table (str "card__" (:id query-log-card))}}}]
              (testing "Export should succeed without warnings about analytics dependencies"
                (mt/with-log-messages-for-level [messages [metabase-enterprise :warn]]
                  (let [ser (extract/extract {:targets       [[:model/Collection coll-id]]
                                              :no-settings   true
                                              :no-data-model true})]
                    (is (contains? (ids-by-model "Card" ser) xray-card-eid)
                        "X-ray card should be exported")
                    (is (contains? (ids-by-model "Collection" ser) coll-eid)
                        "Collection should be exported")
                    (is (not (contains? (ids-by-model "Card" ser) "QOtZaiTLf2FDD4AT6Oinb"))
                        "Analytics model should NOT be exported")
                    (let [warn-msgs (into #{} (map :message) (messages))]
                      (is (not (some #(str/starts-with? % "Failed to export") warn-msgs))
                          (str "Should not have export warnings, got: " warn-msgs)))))))))))))

(deftest entity-id-in-targets-test
  (mt/with-temp [:model/Collection c {:name "Top-Level Collection"}]
    (testing "Extracting by entity id works"
      (let [ser (extract/extract {:targets       [[:model/Collection (:entity_id c)]]
                                  :no-settings   true
                                  :no-data-model true})]
        (is (= #{(:entity_id c)}
               (ids-by-model "Collection" ser)))))))

(deftest extract-single-collection-test
  (mt/with-empty-h2-app-db!
    (ts/with-temp-dpc
      [:model/Collection    {coll-id :id}            {:name "Top-Level Collection"}
       :model/Dashboard     {dash-id :id}            {:name "Top Dash"
                                                      :collection_id coll-id}
       :model/Card          {card-id-1 :id
                             card-eid-1 :entity_id} {:name "Some Card"
                                                     :collection_id coll-id}
       :model/Card          {card-id-2 :id
                             card-eid-2 :entity_id} {:name "Some Inner Card"
                                                     :collection_id coll-id}
       :model/DashboardTab  {tab-id-1 :id
                             tab-eid-1 :entity_id}  {:dashboard_id dash-id
                                                     :name "Tab 1"
                                                     :position 0}
       :model/DashboardCard  _                      {:dashboard_id dash-id
                                                     :dashboard_tab_id tab-id-1
                                                     :card_id card-id-1}
       :model/DashboardTab  {tab-id-2 :id
                             tab-eid-2 :entity_id}  {:dashboard_id dash-id
                                                     :name "Tab 2"
                                                     :position 1}
       :model/DashboardCard _                       {:dashboard_id dash-id
                                                     :dashboard_tab_id tab-id-2
                                                     :card_id card-id-2}]
      (let [extraction (extract/extract {:targets [[:model/Collection coll-id]] :no-settings true :no-data-model true})]
        (is (=? [{:name "Top Dash"
                  :dashcards [{:dashboard_tab_id tab-eid-1
                               :card_id          card-eid-1}
                              {:dashboard_tab_id tab-eid-2
                               :card_id          card-eid-2}]
                  :tabs [{:name "Tab 1"}
                         {:name "Tab 2"}]}]
                (by-model "Dashboard" extraction)))))))

(deftest extract-skip-archived-test
  (testing "extract with skip-archived: true excludes archived items from final extraction"
    (mt/with-empty-h2-app-db!
      (ts/with-temp-dpc [:model/Collection {coll-id :id}       {:name "Test Collection"}
                         :model/Card       {active-card-id :id}   {:name          "Active Card"
                                                                   :archived      false
                                                                   :collection_id coll-id}
                         :model/Card       {archived-card-id :id} {:name          "Archived Card"
                                                                   :archived      true
                                                                   :collection_id coll-id}]
        (testing "archived cards are excluded from extraction with skip-archived: true"
          (let [extraction (extract/extract {:targets       [[:model/Collection coll-id]]
                                             :skip-archived true})
                card-ids   (into #{} (map :entity_id) (by-model "Card" extraction))]
            (is (contains? card-ids (:entity_id (t2/select-one :model/Card :id active-card-id))))
            (is (not (contains? card-ids (:entity_id (t2/select-one :model/Card :id archived-card-id)))))))
        (testing "archived cards are included in extraction with skip-archived: false"
          (let [extraction (extract/extract {:targets       [[:model/Collection coll-id]]
                                             :skip-archived false})
                card-ids   (into #{} (map :entity_id) (by-model "Card" extraction))]
            (is (contains? card-ids (:entity_id (t2/select-one :model/Card :id active-card-id))))
            (is (contains? card-ids (:entity_id (t2/select-one :model/Card :id archived-card-id))))))))))

(deftest snippet-target-test
  (testing "Snippet target exports the snippets and cards it uses"
    (mt/with-empty-h2-app-db!
      (mt/with-temp [:model/NativeQuerySnippet {b-eid :entity_id} {:name "B" :content "1 = 1"}
                     :model/Card               {d-id :id d-eid :entity_id} {:name "D"}
                     :model/NativeQuerySnippet {a-id :id a-eid :entity_id}
                     {:name "A" :content (format "{{snippet: B}} AND id IN ({{#%d-d}})" d-id)}]
        (let [extraction (into [] (extract/extract {:no-settings   true
                                                    :no-data-model true
                                                    :no-transforms true
                                                    :targets       [[:model/NativeQuerySnippet a-id]]}))]
          (is (= #{a-eid b-eid} (ids-by-model "NativeQuerySnippet" extraction)))
          (is (= #{d-eid} (ids-by-model "Card" extraction))))))))

(deftest collection-export-includes-model-actions-test
  (testing "GHY-4722: exporting a collection exports the actions of its models, though a model doesn't reference them"
    (mt/with-empty-h2-app-db!
      (ts/with-temp-dpc [:model/Database   {db-id :id}      {:name "My Database"}
                         :model/Collection {coll-id :id}    {:name "Models"}
                         :model/Card       {model-id :id}   {:name          "Model"
                                                             :type          :model
                                                             :database_id   db-id
                                                             :collection_id coll-id
                                                             :dataset_query {:database db-id
                                                                             :type     :native
                                                                             :native   {:query "select 1"}}}
                         :model/Action     {action-id :id}  {:name "My Action" :type :implicit :model_id model-id}
                         :model/Action     {archived-id :id} {:name "Old Action" :type :implicit :model_id model-id
                                                              :archived true}]
        (let [eid (fn [id] (t2/select-one-fn :entity_id :model/Action :id id))]
          (is (= #{(eid action-id) (eid archived-id)}
                 (ids-by-model "Action" (extract/extract {:targets       [[:model/Collection coll-id]]
                                                          :no-data-model true}))))
          (testing "with :skip-archived, the archived action is left out"
            (is (= #{(eid action-id)}
                   (ids-by-model "Action" (extract/extract {:targets       [[:model/Collection coll-id]]
                                                            :no-data-model true
                                                            :skip-archived true}))))))))))

(deftest collection-export-includes-user-settings-test
  (mt/with-empty-h2-app-db!
    (ts/with-temp-dpc [:model/Database    {db-id    :id} {:name "DB"}
                       :model/Collection  {coll-id  :id} {:name "Library" :type "library-data"}
                       :model/Table       {table-id :id} {:name "T" :db_id db-id
                                                          :is_published true
                                                          :collection_id coll-id}
                       :model/Field       _              {:name "F1" :table_id table-id}
                       :model/Field       {f2-id    :id} {:name "F2" :table_id table-id}
                       :model/FieldUserSettings _ {:field_id f2-id :description "curated"}
                       :model/TableUserSettings _ {:table_id table-id :display_name "Renamed"}]
      (testing "targeting the collection exports the Table and its Fields, each beside its user settings"
        (let [entities        (into [] (extract/extract {:targets       [[:model/Collection coll-id]]
                                                         :no-data-model true}))
              model->entities (group-by (comp :model last :serdes/meta) entities)]
          (is (some #(= "T" (:name %)) (model->entities "Table")))
          (is (= #{"F1" "F2"}
                 (set (map :name (model->entities "Field")))))
          (is (= 1 (count (model->entities "TableUserSettings"))))
          (is (= #{"F2"}
                 (set (map #(last (:field_id %)) (model->entities "FieldUserSettings"))))
              "only the field the user edited has settings to export"))))))

(deftest collection-export-includes-published-tables-test
  (testing "Exporting a collection includes published tables without requiring data_model flag"
    (mt/with-empty-h2-app-db!
      (ts/with-temp-dpc [:model/Database   {db-id :id}   {:name "My Database"}
                         :model/Collection {coll-id :id} {:name "Export Collection"}
                         :model/Table      _             {:name          "Published Table"
                                                          :db_id         db-id
                                                          :is_published  true
                                                          :collection_id coll-id}
                         :model/Table      _             {:name          "Unpublished Table"
                                                          :db_id         db-id
                                                          :is_published  false}
                         :model/Table      _             {:name          "Other Table"
                                                          :db_id         db-id
                                                          :is_published  true
                                                          :collection_id nil}]
        (let [opts        {:targets       [[:model/Collection coll-id]]
                           :no-data-model true
                           :no-settings   true}
              extracted   (into [] (extract/extract opts))
              table-names (->> extracted
                               (filter #(= "Table" (-> % :serdes/meta last :model)))
                               (map :name)
                               set)]
          (testing "published table in target collection is exported"
            (is (contains? table-names "Published Table")))
          (testing "unpublished table is not exported"
            (is (not (contains? table-names "Unpublished Table"))))
          (testing "published table in other collection is not exported"
            (is (not (contains? table-names "Other Table"))))
          (testing "database is not exported (no-data-model: true)"
            (is (empty? (filter #(= "Database" (-> % :serdes/meta last :model)) extracted)))))))))

(defn- filter-definition
  "A Segment definition filtering the Table `table-id` in the Database `db-id` on its Field `field-id`."
  [db-id table-id field-id]
  (let [mp (lib-be/application-database-metadata-provider db-id)]
    (-> (lib/query mp (lib.metadata/table mp table-id))
        (lib/filter (lib/> (lib.metadata/field mp field-id) 100)))))

(deftest collection-export-includes-fields-and-segments-test
  (testing "Exporting a collection with published tables includes their Fields and Segments"
    (mt/with-empty-h2-app-db!
      (ts/with-temp-dpc [:model/Database   {db-id :id}          {:name "My Database"}
                         :model/Collection {coll-id :id}        {:name "Export Collection"}
                         :model/Table      {table-id :id}       {:name          "Published Table"
                                                                 :db_id         db-id
                                                                 :is_published  true
                                                                 :collection_id coll-id}
                         :model/Field      {field1-id :id}      {:name      "Field One"
                                                                 :table_id  table-id
                                                                 :base_type :type/Integer}
                         :model/Field      {field2-id :id}      {:name      "Field Two"
                                                                 :table_id  table-id
                                                                 :base_type :type/Text}
                         :model/Segment    {segment-id :id}     {:name       "Test Segment"
                                                                 :table_id   table-id
                                                                 :definition (filter-definition db-id table-id field1-id)}
                         ;; Create another table with fields that should NOT be exported
                         :model/Table      {other-table-id :id} {:name          "Other Table"
                                                                 :db_id         db-id
                                                                 :is_published  false}
                         :model/Field      _                    {:name      "Other Field"
                                                                 :table_id  other-table-id
                                                                 :base_type :type/Integer}]
        (let [opts        {:targets       [[:model/Collection coll-id]]
                           :no-data-model true
                           :no-settings   true}
              extracted   (into [] (extract/extract opts))
              field-ids   (->> extracted
                               (filter #(= "Field" (-> % :serdes/meta last :model)))
                               (map #(t2/select-one-pk :model/Field
                                                       :table_id (t2/select-one-pk :model/Table :name (nth (:table_id %) 2))
                                                       :name (:name %)))
                               set)
              segment-ids (->> extracted
                               (filter #(= "Segment" (-> % :serdes/meta last :model)))
                               (map #(:id (t2/select-one :model/Segment :entity_id (:entity_id %))))
                               set)]
          (testing "fields from published table are exported"
            (is (contains? field-ids field1-id))
            (is (contains? field-ids field2-id)))
          (testing "segments from published table are exported"
            (is (contains? segment-ids segment-id)))
          (testing "fields from non-published table are NOT exported"
            (is (= 2 (count field-ids)))))))))

(deftest dashcard-order-test
  (mt/with-empty-h2-app-db!
    (ts/with-temp-dpc
      [:model/Collection    {coll-id :id}                 {:name "Some Collection"}
       :model/Card          {card-id :id}                 {:name "Some Question", :collection_id coll-id}
       :model/Dashboard     {dash-id :id}                 {:name "Some Dashboard", :collection_id coll-id}
       :model/DashboardTab  {second-tab :id}              {:dashboard_id dash-id :name "Second" :position 1}
       :model/DashboardTab  {first-tab :id}               {:dashboard_id dash-id :name "First" :position 0}
       :model/DashboardCard {in-second :entity_id}        {:card_id card-id :dashboard_id dash-id
                                                           :dashboard_tab_id second-tab}
       :model/DashboardCard {in-first-b :entity_id}       {:card_id card-id :dashboard_id dash-id
                                                           :dashboard_tab_id first-tab :entity_id "bbbbbbbbbbbbbbbbbbbbb"}
       :model/DashboardCard {in-first-a :entity_id}       {:card_id card-id :dashboard_id dash-id
                                                           :dashboard_tab_id first-tab :entity_id "aaaaaaaaaaaaaaaaaaaaa"}]
      (testing "dashcards are ordered by their tab's local id, then by row, col and entity_id"
        (is (= [in-second in-first-a in-first-b]
               (map :entity_id (:dashcards (ts/extract-one "Dashboard" dash-id)))))))))

(deftest setting-from-env-var-test
  (let [exported-site-name #(some (fn [{k :key v :value}] (when (= "site-name" k) [v]))
                                  (into [] (serialization/export :model/Setting (select/select-rows :model/Setting {}))))]
    (mt/with-temporary-setting-values [site-name "From the app DB"]
      (testing "Setting set in app DB is exported"
        (is (= ["From the app DB"] (exported-site-name))))
      (mt/with-temp-env-var-value! [mb-site-name "From an env var"]
        (testing "Setting set by env var is not exported"
          (is (nil? (exported-site-name))))))))

(deftest no-metabase-version-stamp-test
  (testing "extract does not stamp :metabase_version on entities (GHY-4013: it caused spurious remote-sync diffs)"
    (mt/with-empty-h2-app-db!
      (ts/with-temp-dpc [:model/Collection {coll-id :id} {:name "My Collection"}
                         :model/Card       _             {:name "My Card" :collection_id coll-id}]
        (let [extracted (into [] (extract/extract {}))
              by-model  (group-by (comp :model last :serdes/meta) extracted)]
          (doseq [m      ["Collection" "Card"]
                  entity (get by-model m)]
            (is (not (contains? entity :metabase_version))
                (str m " should not carry a :metabase_version"))))))))

(deftest untargeted-export-collections-test
  (mt/with-empty-h2-app-db!
    (ts/with-temp-dpc [:model/Collection {coll-id :id coll-eid :entity_id} {:name "Some Collection"}
                       :model/Collection {child-eid :entity_id}            {:name     "Nested Collection"
                                                                            :location (format "/%s/" coll-id)}
                       :model/User       {mark-id :id}                     {:first_name "Mark"
                                                                            :last_name  "Knopfler"
                                                                            :email      "mark@direstrai.ts"}]
      (testing "no user specified"
        (is (= #{coll-eid child-eid}
               (ids-by-model "Collection" (extract/extract {})))))
      (testing "valid user specified takes their personal collection too"
        (is (= #{coll-eid child-eid (:entity_id (personal-collection mark-id))}
               (ids-by-model "Collection" (extract/extract {:user-id mark-id})))))
      (testing "invalid user specified"
        (is (= #{coll-eid child-eid}
               (ids-by-model "Collection" (extract/extract {:user-id 218921}))))))))

(deftest targets-skip-archived-test
  (testing "skip-archived leaves out archived collections and their contents"
    (mt/with-empty-h2-app-db!
      (ts/with-temp-dpc [:model/Collection {parent-id :id parent-eid :entity_id} {:name "Parent Collection"}
                         :model/Collection {archived-child-id :id archived-child-eid :entity_id}
                         {:name     "Archived Child Collection"
                          :archived true
                          :location (format "/%d/" parent-id)}
                         :model/Collection {active-child-id :id active-child-eid :entity_id}
                         {:name     "Active Child Collection"
                          :archived false
                          :location (format "/%d/" parent-id)}
                         :model/Card       {in-archived-eid :entity_id} {:name          "Card in archived collection"
                                                                         :collection_id archived-child-id}
                         :model/Card       {in-active-eid :entity_id}   {:name          "Card in active collection"
                                                                         :collection_id active-child-id}]
        (let [opts {:targets       [[:model/Collection parent-id]]
                    :no-settings   true
                    :no-data-model true
                    :no-transforms true}]
          (testing "with skip-archived"
            (let [extraction (into [] (extract/extract (assoc opts :skip-archived true)))]
              (is (= #{parent-eid active-child-eid} (ids-by-model "Collection" extraction)))
              (is (= #{in-active-eid} (ids-by-model "Card" extraction)))))
          (testing "without skip-archived"
            (let [extraction (into [] (extract/extract opts))]
              (is (= #{parent-eid active-child-eid archived-child-eid} (ids-by-model "Collection" extraction)))
              (is (= #{in-active-eid in-archived-eid} (ids-by-model "Card" extraction))))))))))

(defn- extract-ex
  "The ExceptionInfo `extract/extract` throws for `targets`, or nil."
  [targets]
  (try
    (dorun (extract/extract {:targets targets}))
    nil
    (catch clojure.lang.ExceptionInfo e e)))

(deftest targets-missing-id-test
  (testing "target id that does not exist is rejected as client input"
    (mt/with-empty-h2-app-db!
      (ts/with-temp-dpc [:model/Collection {coll-id :id coll-eid :entity_id} {:name "Real Collection"}
                         :model/Card       {card-eid :entity_id}            {:name          "Real Card"
                                                                             :collection_id coll-id}]
        (let [missing-id Integer/MAX_VALUE]
          (testing "nonexistent Collection id"
            (let [e (extract-ex [[:model/Collection missing-id]])]
              (is (re-find #"Could not find Collection with ID" (ex-message e)))
              (is (re-find (re-pattern (str missing-id)) (ex-message e)))
              (is (= {:status-code 400 :model "Collection" :id missing-id}
                     (select-keys (ex-data e) [:status-code :model :id])))))
          (testing "nonexistent id of model other than Collection"
            (is (re-find #"Could not find Card with ID" (ex-message (extract-ex [[:model/Card missing-id]])))))
          (testing "nonexistent entity id"
            (is (re-find #"Could not find Collection with entity ID"
                         (ex-message (extract-ex [[:model/Collection "abcdefghijklmnopqrstu"]])))))
          (testing "nil id"
            (is (= 400 (:status-code (ex-data (extract-ex [[:model/Collection nil]]))))))
          (testing "ids that do exist still resolve"
            (let [extraction (into [] (extract/extract {:targets       [[:model/Collection coll-id]]
                                                        :no-settings   true
                                                        :no-data-model true
                                                        :no-transforms true}))]
              (is (= #{coll-eid} (ids-by-model "Collection" extraction)))
              (is (= #{card-eid} (ids-by-model "Card" extraction))))))))))

(deftest exploration-content-left-out-test
  (testing "exploration Documents and Cards their Summary document materializes are not exported"
    (mt/with-empty-h2-app-db!
      (ts/with-temp-dpc [:model/Collection  {coll-id :id}             {:name "Explored"}
                         :model/Exploration {expl-id :id}             {:name "Exploration"}
                         :model/Document    {summary-id :id}          {:name           "Summary"
                                                                       :collection_id  coll-id
                                                                       :exploration_id expl-id}
                         :model/Document    {doc-eid :entity_id}      {:name "Plain document" :collection_id coll-id}
                         :model/Card        {materialized-eid :entity_id} {:name          "Materialized"
                                                                           :collection_id coll-id
                                                                           :document_id   summary-id}
                         :model/Card        {card-eid :entity_id}     {:name "Plain card" :collection_id coll-id}]
        (is (some? materialized-eid))
        (doseq [[label opts] [["untargeted" {}]
                              ["targeted" {:targets [[:model/Collection coll-id]]}]]]
          (testing label
            (let [extraction (into [] (extract/extract (merge {:no-settings   true
                                                               :no-data-model true
                                                               :no-transforms true}
                                                              opts)))]
              (is (= #{doc-eid} (ids-by-model "Document" extraction)))
              (is (= #{card-eid} (ids-by-model "Card" extraction))))))))))

(deftest select-rows-skip-archived-test
  (testing "skip-archived drops archived rows of every model with archived column"
    (mt/with-empty-h2-app-db!
      (ts/with-temp-dpc [:model/Card      {active-eid :entity_id}        {:name "Active"}
                         :model/Card      {archived-eid :entity_id}      {:name "Archived" :archived true}
                         :model/Dashboard {archived-dash-eid :entity_id} {:name "Archived dashboard" :archived true}]
        (let [eids (fn [model opts] (into #{} (map :entity_id) (select/select-rows model opts)))]
          (testing "with skip-archived"
            (is (contains? (eids :model/Card {:skip-archived true}) active-eid))
            (is (not (contains? (eids :model/Card {:skip-archived true}) archived-eid)))
            (is (not (contains? (eids :model/Dashboard {:skip-archived true}) archived-dash-eid))))
          (testing "without skip-archived"
            (is (set/subset? #{active-eid archived-eid} (eids :model/Card {})))
            (is (contains? (eids :model/Dashboard {}) archived-dash-eid))))))))

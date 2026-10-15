(ns metabase-enterprise.library-branching.instance.rows-test
  "The rows of the instance that the change lists name each item by."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.features-test-util :as features.tu]
   [metabase-enterprise.library-branching.instance.app-db :as app-db]
   [metabase-enterprise.library-branching.instance.rows :as rows]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db) features.tu/with-features)

(deftest ^:parallel every-kind-has-a-model-name-test
  (testing "each kind of scope has the model name of remote sync"
    (is (= scope/kinds (set (keys rows/model-names)))))
  (testing "each kind that the instance syncs has rows"
    (is (every? rows/kinds (keys app-db/kind-stores)))))

(defn- table-key
  [table-id]
  (let [{:keys [db schema table]} (first (library-branching.db/table-keys-by-id [table-id]))]
    [db schema table]))

(deftest details-test
  (mt/with-temp [:model/Collection         collection {:name "Rows"}
                 :model/Collection         child      {:name "Child" :location (str "/" (:id collection) "/")}
                 :model/Card               question   {:name "Q" :type :question :collection_id (:id collection)}
                 :model/Card               model      {:name "M" :type :model :collection_id (:id collection)}
                 :model/Card               metric     {:name "Mt" :type :metric :collection_id (:id child)}
                 :model/Dashboard          dashboard  {:name "D" :collection_id (:id collection)}
                 :model/NativeQuerySnippet snippet    {:name "lb rows snippet" :content "1"}
                 :model/Timeline           timeline   {:name "T" :collection_id (:id collection)}
                 :model/Glossary           term       {:term "lb rows term" :definition "A term."}
                 :model/Segment            segment    {:name "S" :table_id (mt/id :venues)}
                 :model/Measure            measure    {:name "Me" :table_id (mt/id :venues)}
                 :model/Action             action     {:name "Ac" :type :query :model_id (:id model)}]
    (let [venues (table-key (mt/id :venues))
          items  [{:id (:entity_id collection) :kind :collection}
                  {:id (:entity_id question) :kind :question}
                  {:id (:entity_id model) :kind :model}
                  {:id (:entity_id metric) :kind :metric}
                  {:id (:entity_id dashboard) :kind :dashboard}
                  {:id (:entity_id snippet) :kind :snippet}
                  {:id (:entity_id timeline) :kind :timeline}
                  {:id (:entity_id term) :kind :glossary-term}
                  {:id (:entity_id segment) :kind :segment}
                  {:id (:entity_id measure) :kind :measure}
                  {:id (:entity_id action) :kind :action}
                  {:id venues :kind :published-table}]
          venues-collection (t2/select-one-fn :collection_id :model/Table (mt/id :venues))]
      (is (= {(:entity_id collection) {:model "collection" :model_id (:id collection) :collection_id (:id collection)
                                       :table_id nil}
              (:entity_id question)   {:model "card" :model_id (:id question) :collection_id (:id collection)
                                       :table_id nil}
              (:entity_id model)      {:model "card" :model_id (:id model) :collection_id (:id collection)
                                       :table_id nil}
              (:entity_id metric)     {:model "card" :model_id (:id metric) :collection_id (:id child) :table_id nil}
              (:entity_id dashboard)  {:model "dashboard" :model_id (:id dashboard) :collection_id (:id collection)
                                       :table_id nil}
              (:entity_id snippet)    {:model "nativequerysnippet" :model_id (:id snippet)
                                       :collection_id (:collection_id snippet) :table_id nil}
              (:entity_id timeline)   {:model "timeline" :model_id (:id timeline) :collection_id (:id collection)
                                       :table_id nil}
              (:entity_id term)       {:model "glossary" :model_id (:id term) :collection_id nil :table_id nil}
              (:entity_id segment)    {:model "segment" :model_id (:id segment) :collection_id venues-collection
                                       :table_id (mt/id :venues)}
              (:entity_id measure)    {:model "measure" :model_id (:id measure) :collection_id venues-collection
                                       :table_id (mt/id :venues)}
              (:entity_id action)     {:model "action" :model_id (:id action) :collection_id (:id collection)
                                       :table_id nil}
              venues                  {:model "table" :model_id (mt/id :venues) :collection_id venues-collection
                                       :table_id (mt/id :venues)}}
             (rows/details items))))))

(deftest details-of-a-published-table-test
  (testing "a published table is in its collection, and a segment of it in the same collection"
    (mt/with-temp [:model/Collection collection {:name "Data" :type "library-data"}
                   :model/Segment    segment    {:name "S" :table_id (mt/id :checkins)}]
      (mt/with-temp-vals-in-db :model/Table (mt/id :checkins) {:is_published true :collection_id (:id collection)}
        (let [checkins (table-key (mt/id :checkins))]
          (is (= {checkins            {:model "table" :model_id (mt/id :checkins) :collection_id (:id collection)
                                       :table_id (mt/id :checkins)}
                  (:entity_id segment) {:model "segment" :model_id (:id segment) :collection_id (:id collection)
                                        :table_id (mt/id :checkins)}}
                 (rows/details [{:id checkins :kind :published-table}
                                {:id (:entity_id segment) :kind :segment}]))))))))

(deftest details-with-no-row-test
  (testing "an identity with no row, a kind with no rows, and no kind: only the model name"
    (is (= {"NoSuchCard00000000001"          {:model "card" :model_id nil :collection_id nil :table_id nil}
            ["No database" "PUBLIC" "NOPE"] {:model "table" :model_id nil :collection_id nil :table_id nil}
            "SomeTransform0000001"           {:model "transform" :model_id nil :collection_id nil :table_id nil}
            "NoKind00000000000001"           {:model nil :model_id nil :collection_id nil :table_id nil}}
           (rows/details [{:id "NoSuchCard00000000001" :kind :metric}
                          {:id ["No database" "PUBLIC" "NOPE"] :kind :published-table}
                          {:id "SomeTransform0000001" :kind :transform}
                          {:id "NoKind00000000000001" :kind nil}])))))

(deftest details-in-batches-test
  (testing "more identities than one query takes"
    (let [ids (mapv #(format "Missing%014d" %) (range 1500))]
      (is (= 1500 (count (rows/details (mapv (fn [id] {:id id :kind :question}) ids))))))))

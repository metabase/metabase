(ns metabase.remote-sync.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- synced?
  "Whether the row of `model` with `pk` is synced."
  [model pk]
  (let [pk-column (first (t2/primary-keys model))]
    (t2/exists? model {:where [:and [:= pk-column pk] [:in pk-column (remote-sync/synced-ids-clause model nil)]]})))

(deftest synced-models-test
  (testing "content models define which of their rows are synced"
    (is (every? (set (remote-sync/synced-models))
                [:model/Card :model/Collection :model/Dashboard :model/DashboardCard :model/Document
                 :model/NativeQuerySnippet :model/Timeline :model/Transform]))))

(deftest collection-content-test
  (mt/with-temp [:model/Collection    synced   {:name "Synced" :is_remote_synced true :location "/"}
                 :model/Collection    child    {:name "Child" :is_remote_synced true :location (format "/%d/" (:id synced))}
                 :model/Collection    unsynced {:name "Unsynced" :location "/"}
                 :model/Card          card     {:collection_id (:id child)}
                 :model/Card          archived {:collection_id (:id child) :archived true}
                 :model/Card          other    {:collection_id (:id unsynced)}
                 :model/Dashboard     dash     {:collection_id (:id synced)}
                 :model/DashboardCard dashcard {:dashboard_id (:id dash) :card_id (:id card)}]
    (testing "synced top-level collection and its descendants are synced, with their content"
      (is (synced? :model/Collection (:id synced)))
      (is (synced? :model/Collection (:id child)))
      (is (synced? :model/Card (:id card)))
      (is (synced? :model/Dashboard (:id dash)))
      (is (synced? :model/DashboardCard (:id dashcard))))
    (testing "archived content and content of unsynced collections is not synced"
      (is (not (synced? :model/Card (:id archived))))
      (is (not (synced? :model/Collection (:id unsynced))))
      (is (not (synced? :model/Card (:id other)))))))

(deftest library-content-test
  (mt/with-temp [:model/NativeQuerySnippet snippet  {}
                 :model/NativeQuerySnippet archived {:archived true}
                 :model/Glossary          term     {:term (mt/random-name) :definition "Definition"}]
    (testing "snippets and glossary entries are always synced, but archived snippets"
      (is (synced? :model/NativeQuerySnippet (:id snippet)))
      (is (not (synced? :model/NativeQuerySnippet (:id archived))))
      (is (synced? :model/Glossary (:id term))))))

(deftest transforms-content-test
  (mt/with-temp [:model/Collection folder    {:name "Folder" :namespace "transforms" :location "/"}
                 :model/Transform  transform {:collection_id (:id folder)}]
    (testing "transforms and their folders are always synced"
      (is (synced? :model/Transform (:id transform)))
      (is (synced? :model/Collection (:id folder))))))

(deftest without-remote-sync-test
  (mt/with-premium-features #{}
    (mt/with-temp [:model/Collection synced {:name "Synced" :is_remote_synced true :location "/"}
                   :model/Card       card   {:collection_id (:id synced)}]
      (testing "without remote sync, every row can be written"
        (is (false? (remote-sync/read-only?)))
        (is (true? (remote-sync/can-write? :model/Card (:id card))))))))

(deftest synced-name-test
  (testing "exported entities are named by their name, and glossary entries by their term"
    (is (= "Card" (remote-sync/synced-name :model/Card {:name "Card"})))
    (is (= "Term" (remote-sync/synced-name :model/Glossary {:term "Term"})))))

(deftest items-test
  (doseq [model (remote-sync/synced-models)
          :let  [items (:synced-items (remote-sync/spec model))]]
    (testing (str model " has items unless it is a SerDes child nested in its parent, and its items query runs on the app DB")
      (if (when-let [parent (:parent (serialization/spec model))] (not (:import-only? parent)))
        (is (nil? items))
        (is (= [] (items [Integer/MAX_VALUE])))))))

(deftest synced-rows-per-model-test
  (mt/with-temp [:model/Collection        synced          {:name "Synced" :is_remote_synced true :location "/"}
                 :model/Collection        unsynced        {:name "Unsynced" :location "/"}
                 :model/Table             synced-table    {:db_id (mt/id) :name "synced_table"}
                 :model/Table             unsynced-table  {:db_id (mt/id) :name "unsynced_table"}
                 :model/TableUserSettings _               {:table_id      (:id synced-table)
                                                           :is_published  true
                                                           :collection_id (:id synced)}
                 :model/TableUserSettings _               {:table_id      (:id unsynced-table)
                                                           :is_published  true
                                                           :collection_id (:id unsynced)}
                 :model/Field             synced-field    {:table_id (:id synced-table) :name "SYNCED"}
                 :model/Field             unsynced-field  {:table_id (:id unsynced-table) :name "UNSYNCED"}
                 :model/FieldUserSettings _               {:field_id (:id synced-field) :display_name "Synced"}
                 :model/FieldUserSettings _               {:field_id (:id unsynced-field) :display_name "Unsynced"}
                 :model/Segment           synced-seg      {:table_id (:id synced-table) :name "Synced segment"}
                 :model/Segment           unsynced-seg    {:table_id (:id unsynced-table) :name "Unsynced segment"}
                 :model/Measure           synced-measure  {:table_id (:id synced-table) :name "Synced measure"}
                 :model/Measure           unsynced-measure {:table_id (:id unsynced-table) :name "Unsynced measure"}
                 :model/Document          synced-doc      {:name "Synced" :collection_id (:id synced)}
                 :model/Document          unsynced-doc    {:name "Unsynced" :collection_id (:id unsynced)}
                 :model/Timeline          synced-tl       {:name "Synced" :collection_id (:id synced)}
                 :model/Timeline          unsynced-tl     {:name "Unsynced" :collection_id (:id unsynced)}
                 :model/TimelineEvent     synced-event    {:timeline_id (:id synced-tl)}
                 :model/TimelineEvent     unsynced-event  {:timeline_id (:id unsynced-tl)}
                 :model/Dashboard         synced-dash     {:collection_id (:id synced)}
                 :model/Dashboard         unsynced-dash   {:collection_id (:id unsynced)}
                 :model/DashboardTab      synced-tab      {:dashboard_id (:id synced-dash) :name "Synced" :position 0}
                 :model/DashboardTab      unsynced-tab    {:dashboard_id (:id unsynced-dash) :name "Unsynced" :position 0}
                 :model/Collection        actions-folder  {:name "Actions" :namespace "data-actions" :location "/"}
                 :model/Card              unsynced-model  {:type :model :collection_id (:id unsynced)}
                 :model/Action            synced-action   {:name "Synced" :type :implicit :collection_id (:id actions-folder)}
                 :model/Action            unsynced-action {:name "Unsynced" :type :implicit :model_id (:id unsynced-model)}
                 :model/ImplicitAction    _               {:action_id (:id synced-action) :kind "row/create" :table_id (mt/id :venues)}
                 :model/ImplicitAction    _               {:action_id (:id unsynced-action) :kind "row/create"}
                 :model/Action            synced-query    {:name "Synced query" :type :query :collection_id (:id actions-folder)}
                 :model/Action            unsynced-query  {:name "Unsynced query" :type :query :model_id (:id unsynced-model)}
                 :model/QueryAction       _               {:action_id     (:id synced-query)
                                                           :database_id   (mt/id)
                                                           :dataset_query (mt/native-query {:query "SELECT 1"})}
                 :model/QueryAction       _               {:action_id     (:id unsynced-query)
                                                           :database_id   (mt/id)
                                                           :dataset_query (mt/native-query {:query "SELECT 1"})}
                 :model/Transform         transform       {}]
    (doseq [[model synced-pk unsynced-pk] [[:model/TableUserSettings (:id synced-table) (:id unsynced-table)]
                                           [:model/FieldUserSettings (:id synced-field) (:id unsynced-field)]
                                           [:model/Segment (:id synced-seg) (:id unsynced-seg)]
                                           [:model/Measure (:id synced-measure) (:id unsynced-measure)]
                                           [:model/Document (:id synced-doc) (:id unsynced-doc)]
                                           [:model/Timeline (:id synced-tl) (:id unsynced-tl)]
                                           [:model/TimelineEvent (:id synced-event) (:id unsynced-event)]
                                           [:model/DashboardTab (:id synced-tab) (:id unsynced-tab)]
                                           [:model/Action (:id synced-action) (:id unsynced-action)]
                                           [:model/ImplicitAction (:id synced-action) (:id unsynced-action)]
                                           [:model/QueryAction (:id synced-query) (:id unsynced-query)]]]
      (testing (str model " syncs the rows of synced content, and not the others")
        (is (synced? model synced-pk))
        (when unsynced-pk
          (is (not (synced? model unsynced-pk))))))
    (mt/with-temp [:model/TableIndex index {:transform_id (:id transform) :index_name "idx" :structured {:kind :btree :name "idx" :columns [{:name "id"}]}}]
      (testing "the indexes of a transform sync with it"
        (is (synced? :model/TableIndex (:id index)))))
    (when config/ee-available?
      (mt/with-temp [:model/PythonLibrary library {:path "synced" :source "def synced(): pass"}
                     :model/DataApp       app     {}
                     :model/TransformTest test    {:transform_id (:id transform)
                                                   :name         "Test"
                                                   :creator_id   (mt/user->id :crowberto)
                                                   :inputs       []
                                                   :expectations []}]
        (testing "Python libraries and data apps are synced, and the tests of a transform sync with it"
          (is (synced? :model/PythonLibrary (:id library)))
          (is (synced? :model/DataApp (:id app)))
          (is (synced? :model/TransformTest (:id test))))))))

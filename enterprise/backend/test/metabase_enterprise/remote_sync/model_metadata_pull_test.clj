(ns metabase-enterprise.remote-sync.model-metadata-pull-test
  "A remote-sync export writes only the overrides of an MBQL model's result metadata. A pull of that file must keep
  the column types that the model's query gives."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.search.core :as search]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(use-fixtures :each
  (fn [f]
    (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
      (test-helpers/clean-remote-sync-state f)))
  test-helpers/commit-with-temp)

(defn- new-task-id [task-type]
  (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type task-type
                                                  :initiated_by   (mt/user->id :rasta)}))

(defn- columns
  "The `[name base_type display_name]` of each result metadata column of the Card `card-id`."
  [card-id]
  (mapv (juxt :name :base_type :display_name)
        (t2/select-one-fn :result_metadata :model/Card :id card-id)))

(defn- export!
  "Export all remote-synced content to a new mock source, and return the source."
  []
  (let [source  (test-helpers/create-mock-source :initial-files {"main" {}})
        task-id (new-task-id "export")
        export  (impl/export! (source.p/snapshot source) task-id "Full export" :force? true)]
    (impl/handle-task-result! export task-id)
    (is (= :success (:status export)))
    source))

(defn- forced-pull!
  "Pull the files of `source` with a forced pull."
  [source]
  (let [task-id (new-task-id "import")
        result  (impl/import! (source.p/snapshot source) task-id :force? true)]
    (impl/handle-task-result! result task-id)
    (is (= :success (:status result)) (pr-str (select-keys result [:status :message])))))

(deftest forced-pull-keeps-model-column-types-test
  (testing "a forced pull of an exported MBQL model keeps the base types of its columns"
    (mt/with-premium-features #{:remote-sync}
      (mt/with-temporary-setting-values [remote-sync-type :read-write]
        (mt/with-model-cleanup [:model/RemoteSyncTask]
          (mt/with-temp [:model/Collection {coll-id :id} {:name "Models" :is_remote_synced true :location "/"}
                         :model/Card       {card-id :id} {:name          "Venues model"
                                                          :type          :model
                                                          :collection_id coll-id
                                                          :dataset_query (let [mp (mt/metadata-provider)]
                                                                           (lib/query mp (lib.metadata/table mp (mt/id :venues))))}]
            (let [before (columns card-id)]
              (is (= :type/Text (some (fn [[col-name base-type]] (when (= "NAME" col-name) base-type)) before))
                  "Precondition: the model's NAME column has a type")
              (forced-pull! (export!))
              (is (= before (columns card-id))))))))))

(deftest forced-pull-keeps-native-model-columns-test
  (testing "a forced pull of an exported native model stores the types and display names of the exported columns"
    (mt/with-premium-features #{:remote-sync}
      (mt/with-temporary-setting-values [remote-sync-type :read-write]
        (mt/with-model-cleanup [:model/RemoteSyncTask]
          (mt/with-temp [:model/Collection {coll-id :id} {:name "Models" :is_remote_synced true :location "/"}
                         :model/Card       {card-id :id} {:name            "Native venues model"
                                                          :type            :model
                                                          :collection_id   coll-id
                                                          :dataset_query   (lib/native-query (mt/metadata-provider)
                                                                                             "SELECT ID, NAME FROM VENUES")
                                                          :result_metadata [{:name         "ID"
                                                                             :display_name "ID"
                                                                             :base_type    :type/BigInteger
                                                                             :field_ref    [:field "ID" {:base-type :type/BigInteger}]}
                                                                            {:name         "NAME"
                                                                             :display_name "Venue name"
                                                                             :base_type    :type/Text
                                                                             :field_ref    [:field "NAME" {:base-type :type/Text}]}]}]
            (let [before (columns card-id)]
              (is (= [["ID" :type/BigInteger "ID"] ["NAME" :type/Text "Venue name"]] before)
                  "Precondition: the native model stores the given columns")
              (let [source (export!)]
                ;; A local edit after the export, so that the pull writes result_metadata.
                (t2/update! :model/Card card-id {:result_metadata (assoc-in (t2/select-one-fn :result_metadata :model/Card :id card-id)
                                                                            [1 :display_name] "Local name")})
                (is (= "Local name" (get-in (columns card-id) [1 2])))
                (forced-pull! source)
                (is (= before (columns card-id)))))))))))

(defn- replace-in-files!
  "Replace `match` with `replacement` in each file of the main branch of the mock `source`. Return the changed paths."
  [source match replacement]
  (let [files-atom (:files-atom source)
        paths      (vec (for [[path content] (get @files-atom "main")
                              :when (and (string? content) (str/includes? content match))]
                          path))]
    (doseq [path paths]
      (swap! files-atom update-in ["main" path] str/replace match replacement))
    paths))

(deftest forced-pull-of-native-model-query-change-keeps-columns-test
  (testing "a forced pull that changes only the SQL of a native model keeps the columns of the model"
    (mt/with-premium-features #{:remote-sync}
      (mt/with-temporary-setting-values [remote-sync-type :read-write]
        (mt/with-model-cleanup [:model/RemoteSyncTask]
          (mt/with-temp [:model/Collection {coll-id :id} {:name "Models" :is_remote_synced true :location "/"}
                         :model/Card       {card-id :id} {:name            "Native venues model"
                                                          :type            :model
                                                          :collection_id   coll-id
                                                          :dataset_query   (lib/native-query (mt/metadata-provider)
                                                                                             "SELECT ID, NAME FROM VENUES")
                                                          :result_metadata [{:name         "ID"
                                                                             :display_name "ID"
                                                                             :base_type    :type/BigInteger
                                                                             :field_ref    [:field "ID" {:base-type :type/BigInteger}]}
                                                                            {:name         "NAME"
                                                                             :display_name "Venue name"
                                                                             :base_type    :type/Text
                                                                             :field_ref    [:field "NAME" {:base-type :type/Text}]}]}]
            (let [before (columns card-id)
                  source (export!)]
              (is (= 1 (count (replace-in-files! source "SELECT ID, NAME FROM VENUES" "SELECT ID, NAME FROM VENUES WHERE ID > 0")))
                  "Precondition: one exported file has the SQL of the model")
              (forced-pull! source)
              (is (= "SELECT ID, NAME FROM VENUES WHERE ID > 0"
                     (lib/raw-native-query (t2/select-one-fn :dataset_query :model/Card :id card-id))))
              (is (= before (columns card-id))))))))))

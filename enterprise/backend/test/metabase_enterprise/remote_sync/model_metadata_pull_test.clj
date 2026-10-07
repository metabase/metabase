(ns metabase-enterprise.remote-sync.model-metadata-pull-test
  "A remote-sync pull keeps the columns of a card. An export writes only the overrides of an MBQL model's columns; the
  pull keeps the column types that the model's query gives. An export writes the full columns of a native card; the
  pull keeps them, also when it changes the SQL or the file holds a legacy query. A pull that changes the SQL of a
  native card whose file has no columns stores no columns."
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
  "The `[name base_type display_name id]` of each result metadata column of the Card `card-id`."
  [card-id]
  (mapv (juxt :name :base_type :display_name :id)
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

(def ^:private native-venues-columns
  [{:name         "ID"
    :display_name "ID"
    :base_type    :type/BigInteger
    :field_ref    [:field "ID" {:base-type :type/BigInteger}]}
   {:name         "NAME"
    :display_name "Venue name"
    :base_type    :type/Text
    :field_ref    [:field "NAME" {:base-type :type/Text}]}])

(deftest forced-pull-keeps-model-column-types-test
  (testing "a forced pull of an exported MBQL model keeps the base types of its columns"
    (mt/with-premium-features #{:remote-sync}
      (mt/with-temporary-setting-values [remote-sync-type :read-write]
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
            (is (= before (columns card-id)))))))))

(deftest forced-pull-keeps-native-model-columns-test
  (testing "a forced pull of an exported native model stores the types and display names of the exported columns"
    (mt/with-premium-features #{:remote-sync}
      (mt/with-temporary-setting-values [remote-sync-type :read-write]
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Models" :is_remote_synced true :location "/"}
                       :model/Card       {card-id :id} {:name            "Native venues model"
                                                        :type            :model
                                                        :collection_id   coll-id
                                                        :dataset_query   (lib/native-query (mt/metadata-provider)
                                                                                           "SELECT ID, NAME FROM VENUES")
                                                        :result_metadata native-venues-columns}]
          (let [before (columns card-id)]
            (is (= [["ID" :type/BigInteger "ID" nil] ["NAME" :type/Text "Venue name" nil]] before)
                "Precondition: the native model stores the given columns")
            (let [source (export!)]
              ;; A local edit after the export, so that the pull writes result_metadata.
              (t2/update! :model/Card card-id {:result_metadata (assoc-in (t2/select-one-fn :result_metadata :model/Card :id card-id)
                                                                          [1 :display_name] "Local name")})
              (is (= "Local name" (get-in (columns card-id) [1 2])))
              (forced-pull! source)
              (is (= before (columns card-id))))))))))

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
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Models" :is_remote_synced true :location "/"}
                       :model/Card       {card-id :id} {:name            "Native venues model"
                                                        :type            :model
                                                        :collection_id   coll-id
                                                        :dataset_query   (lib/native-query (mt/metadata-provider)
                                                                                           "SELECT ID, NAME FROM VENUES")
                                                        :result_metadata native-venues-columns}]
          (let [before (columns card-id)
                source (export!)]
            (is (= 1 (count (replace-in-files! source "SELECT ID, NAME FROM VENUES" "SELECT ID, NAME FROM VENUES WHERE ID > 0")))
                "Precondition: one exported file has the SQL of the model")
            (forced-pull! source)
            (is (= "SELECT ID, NAME FROM VENUES WHERE ID > 0"
                   (lib/raw-native-query (t2/select-one-fn :dataset_query :model/Card :id card-id))))
            (is (= before (columns card-id)))))))))

(deftest forced-pull-of-native-model-with-mapped-column-query-change-keeps-columns-test
  (testing "a forced pull that changes only the SQL of a native model with a column mapped to a field keeps the columns of the model"
    (mt/with-premium-features #{:remote-sync}
      (mt/with-temporary-setting-values [remote-sync-type :read-write]
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Models" :is_remote_synced true :location "/"}
                       :model/Card       {card-id :id} {:name            "Native venues model"
                                                        :type            :model
                                                        :collection_id   coll-id
                                                        :dataset_query   (lib/native-query (mt/metadata-provider)
                                                                                           "SELECT ID, NAME FROM VENUES")
                                                        :result_metadata (assoc-in native-venues-columns [1 :id] (mt/id :venues :name))}]
          (let [before (columns card-id)
                source (export!)]
            (is (= [["ID" :type/BigInteger "ID" nil] ["NAME" :type/Text "Venue name" (mt/id :venues :name)]] before)
                "Precondition: the native model stores the given columns, and its NAME column is mapped to a field")
            (is (= 1 (count (replace-in-files! source "SELECT ID, NAME FROM VENUES" "SELECT ID, NAME FROM VENUES WHERE ID > 0")))
                "Precondition: one exported file has the SQL of the model")
            (forced-pull! source)
            (is (= "SELECT ID, NAME FROM VENUES WHERE ID > 0"
                   (lib/raw-native-query (t2/select-one-fn :dataset_query :model/Card :id card-id))))
            (is (= before (columns card-id)))))))))

(deftest forced-pull-of-native-question-query-change-keeps-columns-test
  (testing "a forced pull that changes only the SQL of a native question keeps the columns of the question"
    (mt/with-premium-features #{:remote-sync}
      (mt/with-temporary-setting-values [remote-sync-type :read-write]
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Questions" :is_remote_synced true :location "/"}
                       :model/Card       {card-id :id} {:name            "Native venues question"
                                                        :type            :question
                                                        :collection_id   coll-id
                                                        :dataset_query   (lib/native-query (mt/metadata-provider)
                                                                                           "SELECT ID, NAME FROM VENUES")
                                                        :result_metadata native-venues-columns}]
          (let [before (columns card-id)
                source (export!)]
            (is (= [["ID" :type/BigInteger "ID" nil] ["NAME" :type/Text "Venue name" nil]] before)
                "Precondition: the native question stores the given columns")
            (is (= 1 (count (replace-in-files! source "SELECT ID, NAME FROM VENUES" "SELECT ID, NAME FROM VENUES WHERE ID > 0")))
                "Precondition: one exported file has the SQL of the question")
            (forced-pull! source)
            (is (= "SELECT ID, NAME FROM VENUES WHERE ID > 0"
                   (lib/raw-native-query (t2/select-one-fn :dataset_query :model/Card :id card-id))))
            (is (= before (columns card-id)))))))))

(deftest forced-pull-of-native-question-with-legacy-query-file-test
  (testing "a forced pull of a native question whose file holds a legacy query and columns succeeds and keeps the columns"
    (mt/with-premium-features #{:remote-sync}
      (mt/with-temporary-setting-values [remote-sync-type :read-write]
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Questions" :is_remote_synced true :location "/"}
                       :model/Card       {card-id :id} {:name            "Native venues question"
                                                        :type            :question
                                                        :collection_id   coll-id
                                                        :dataset_query   (lib/native-query (mt/metadata-provider)
                                                                                           "SELECT ID, NAME FROM VENUES")
                                                        :result_metadata native-venues-columns}]
          (let [before (columns card-id)
                source (export!)]
            (is (= 1 (count (replace-in-files! source
                                               "  stages:\n  - native: SELECT ID, NAME FROM VENUES\n    lib/type: mbql.stage/native\n  lib/type: mbql/query\n"
                                               "  native:\n    query: SELECT ID, NAME FROM VENUES WHERE ID > 0\n  type: native\n")))
                "Precondition: one exported file has the query in the legacy form")
            (forced-pull! source)
            (is (= "SELECT ID, NAME FROM VENUES WHERE ID > 0"
                   (lib/raw-native-query (t2/select-one-fn :dataset_query :model/Card :id card-id))))
            (is (= before (columns card-id)))))))))

(defn- export-without-columns!
  "Export the native Card `card-id` while it has no columns, so that its file has no result_metadata. Then store
  `native-venues-columns` again, and return the source."
  [card-id]
  (t2/update! :model/Card card-id {:result_metadata nil})
  (is (= [] (columns card-id)) "Precondition: the card has no columns at the export")
  (let [source (export!)]
    (t2/update! :model/Card card-id {:result_metadata native-venues-columns})
    (is (= 2 (count (columns card-id))) "Precondition: the card has columns at the pull")
    source))

(deftest forced-pull-of-native-question-query-change-without-file-columns-stores-no-columns-test
  (testing "a forced pull that changes the SQL of a native question whose file has no columns stores no columns"
    (mt/with-premium-features #{:remote-sync}
      (mt/with-temporary-setting-values [remote-sync-type :read-write]
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Questions" :is_remote_synced true :location "/"}
                       :model/Card       {card-id :id} {:name            "Native venues question"
                                                        :type            :question
                                                        :collection_id   coll-id
                                                        :dataset_query   (lib/native-query (mt/metadata-provider)
                                                                                           "SELECT ID, NAME FROM VENUES")
                                                        :result_metadata native-venues-columns}]
          (let [source (export-without-columns! card-id)]
            (is (= 1 (count (replace-in-files! source "SELECT ID, NAME FROM VENUES" "SELECT ID, PRICE FROM VENUES")))
                "Precondition: one exported file has the SQL of the question")
            (forced-pull! source)
            (is (= "SELECT ID, PRICE FROM VENUES"
                   (lib/raw-native-query (t2/select-one-fn :dataset_query :model/Card :id card-id))))
            (is (= [] (columns card-id)))))))))

(deftest forced-pull-of-native-question-without-file-columns-keeps-columns-test
  (testing "a forced pull that does not change the SQL of a native question whose file has no columns keeps its columns"
    (mt/with-premium-features #{:remote-sync}
      (mt/with-temporary-setting-values [remote-sync-type :read-write]
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Questions" :is_remote_synced true :location "/"}
                       :model/Card       {card-id :id} {:name            "Native venues question"
                                                        :type            :question
                                                        :collection_id   coll-id
                                                        :dataset_query   (lib/native-query (mt/metadata-provider)
                                                                                           "SELECT ID, NAME FROM VENUES")
                                                        :result_metadata native-venues-columns}]
          (let [before (columns card-id)]
            (forced-pull! (export-without-columns! card-id))
            (is (= before (columns card-id)))))))))

(deftest forced-pull-of-native-then-mbql-question-query-change-keeps-columns-test
  (testing "a forced pull that changes only the SQL of a question with a native stage and an MBQL stage keeps its columns"
    (mt/with-premium-features #{:remote-sync}
      (mt/with-temporary-setting-values [remote-sync-type :read-write]
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Questions" :is_remote_synced true :location "/"}
                       :model/Card       {card-id :id} {:name            "Native then MBQL question"
                                                        :type            :question
                                                        :collection_id   coll-id
                                                        :dataset_query   (lib/append-stage
                                                                          (lib/native-query (mt/metadata-provider)
                                                                                            "SELECT ID, NAME FROM VENUES"))
                                                        :result_metadata native-venues-columns}]
          (let [before (columns card-id)
                source (export!)]
            (is (= [["ID" :type/BigInteger "ID" nil] ["NAME" :type/Text "Venue name" nil]] before)
                "Precondition: the question stores the given columns")
            (is (= 2 (count (:stages (t2/select-one-fn :dataset_query :model/Card :id card-id))))
                "Precondition: the stored query has two stages")
            (is (= 1 (count (replace-in-files! source "SELECT ID, NAME FROM VENUES" "SELECT ID, NAME FROM VENUES WHERE ID > 0")))
                "Precondition: one exported file has the SQL of the question")
            (forced-pull! source)
            (is (= "SELECT ID, NAME FROM VENUES WHERE ID > 0"
                   (lib/raw-native-query (t2/select-one-fn :dataset_query :model/Card :id card-id))))
            (is (= before (columns card-id)))))))))

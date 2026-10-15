(ns metabase-enterprise.library-branching.instance.kinds-test
  "The content that the instance reads for each kind, and the local changes that a content difference shows. Each
  test writes its content in a transaction that rolls back, and reads it in that transaction."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.engine.diff :as diff]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.layout :as layout]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.app-db :as app-db]
   [metabase-enterprise.library-branching.instance.kinds.published-table :as kinds.published-table]
   [metabase.collections.core :as collections]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.sync.sync-metadata.tables :as sync.tables]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.malli.registry :as mr]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- children-location
  [{:keys [id location]}]
  (str location id "/"))

(defn- db-name [] (t2/select-one-fn :name :model/Database (mt/id)))

(defn- table-key
  [table]
  (let [{:keys [schema name]} (t2/select-one :model/Table (mt/id table))]
    [(db-name) schema name]))

(defn- field-key
  [table field]
  (conj (table-key table) (t2/select-one-fn :name :model/Field (mt/id table field))))

(defn- sum-query
  "A metric query: the sum of `field` of `table`."
  [table field]
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id table)))
        (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id table field)))))))

(defn- read-items
  "The items of the synced snapshot of the instance with the identities `ids`."
  [& ids]
  (select-keys (app-db/read-current) ids))

(defn- read-item
  [id]
  (get (app-db/read-current) id))

(defn- archive-collection!
  [collection-id]
  (mt/with-current-user (mt/user->id :crowberto)
    (collections/archive-or-unarchive-collection! (t2/select-one :model/Collection collection-id) {:archived true})))

;;; ---------------------------------------------------- Content ---------------------------------------------------

(deftest collection-content-test
  (testing "a collection: its name, its parent as the place, and its attributes in the document form"
    (collections.tu/with-library [{:keys [metrics]}]
      (mt/with-temp [:model/Collection revenue {:name        "Revenue"
                                                :type        collections/library-metrics-collection-type
                                                :description "Revenue metrics."
                                                :location    (children-location metrics)}
                     :model/Collection filters {:name "Filters" :namespace "snippets" :location "/"}]
        (is (= {(:entity_id revenue) {:kind  :collection
                                      :name  "Revenue"
                                      :place (:entity_id metrics)
                                      :refs  #{}
                                      :attrs {:description "Revenue metrics." :type "library-metrics"}}
                (:entity_id filters) {:kind  :collection
                                      :name  "Filters"
                                      :place nil
                                      :refs  #{}
                                      :attrs {:namespace "snippets"}}}
               (read-items (:entity_id revenue) (:entity_id filters))))))))

(deftest metric-content-test
  (collections.tu/with-library [{:keys [metrics]}]
    (mt/with-temp [:model/Card metric {:name          "Total price"
                                       :type          :metric
                                       :description   "The sum of prices."
                                       :display       :scalar
                                       :collection_id (:id metrics)
                                       :dataset_query (sum-query :venues :price)}]
      (testing "a metric: its collection as the place, the query by natural keys, and the references of the query"
        (let [{:keys [attrs] :as item} (read-item (:entity_id metric))]
          (is (= {:kind  :metric
                  :name  "Total price"
                  :place (:entity_id metrics)
                  :refs  #{[:database [:env [(db-name)]]]
                           [:source-table [:env (table-key :venues)]]
                           [:field [:env (field-key :venues :price)]]}}
                 (dissoc item :attrs)))
          (is (= #{:description :display :query} (set (keys attrs))))
          (is (= "scalar" (:display attrs)))
          (is (= (table-key :venues) (get-in attrs [:query :stages 0 :source-table])))))
      (testing "a public link and the embedding settings are not content, and do not change the item"
        (let [before (read-item (:entity_id metric))]
          (t2/update! :model/Card (:id metric) {:public_uuid       (str (random-uuid))
                                                :made_public_by_id (mt/user->id :crowberto)
                                                :enable_embedding  true
                                                :embedding_params  {:category "enabled"}})
          (is (= before (read-item (:entity_id metric))))
          (t2/update! :model/Card (:id metric) {:public_uuid nil :made_public_by_id nil})
          (is (= before (read-item (:entity_id metric)))))))))

(deftest snippet-content-test
  (testing "a snippet: its content, and a reference to each snippet that its template tags name, by identity"
    (mt/with-temp [:model/Collection         folder {:name "Filters" :namespace "snippets" :location "/"}
                   :model/NativeQuerySnippet base   {:name "Base filter for library branching" :content "x > 1"}
                   :model/NativeQuerySnippet combo  {:name          "Combo"
                                                     :collection_id (:id folder)
                                                     :content       "{{snippet: Base filter for library branching}}"}]
      (let [{:keys [attrs] :as item} (read-item (:entity_id combo))]
        (is (= {:kind :snippet :name "Combo" :place (:entity_id folder) :refs #{[:snippet (:entity_id base)]}}
               (dissoc item :attrs)))
        (is (= (:entity_id base)
               (get-in attrs [:template_tags (keyword "snippet: Base filter for library branching") :snippet-id]))))
      (is (= {:kind :snippet :name "Base filter for library branching" :place nil :refs #{} :attrs {:content "x > 1"}}
             (read-item (:entity_id base)))))))

(deftest published-table-content-test
  (collections.tu/with-library [{:keys [data]}]
    (mt/with-temp [:model/TableUserSettings _ {:table_id      (mt/id :venues)
                                               :is_published  true
                                               :collection_id (:id data)
                                               :description   "Places to eat."}
                   :model/FieldUserSettings _ {:field_id (mt/id :venues :price) :display_name "Price level"}
                   :model/FieldUserSettings _ {:field_id           (mt/id :venues :category_id)
                                               :fk_target_field_id (mt/id :categories :id)}]
      (let [expected {:kind  :published-table
                      :name  (t2/select-one-fn :display_name :model/Table (mt/id :venues))
                      :place (:entity_id data)
                      :refs  #{[:table [:env (table-key :venues)]]
                               [:field [:env (field-key :venues :price)]]
                               [:field [:env (field-key :venues :category_id)]]
                               [:fk-target [:env (field-key :categories :id)]]}
                      :attrs {:description "Places to eat."
                              :fields      {:PRICE       {:display_name "Price level"}
                                            :CATEGORY_ID {:fk_target (field-key :categories :id)}}}}]
        (testing "a published table: the values that users set on it and on its fields, never the table rows"
          (is (= expected (read-item (table-key :venues)))))
        (testing "a value that warehouse sync writes is not content"
          (t2/update! :metabase_table (mt/id :venues) {:description "A comment in the warehouse."})
          (t2/update! :metabase_field (mt/id :venues :name) {:description "Sync wrote this."})
          (is (= expected (read-item (table-key :venues)))))
        (testing "the user settings of an unpublished table are no item"
          (mt/with-temp [:model/FieldUserSettings _ {:field_id (mt/id :users :name) :display_name "Who"}]
            (is (nil? (read-item (table-key :users))))))))))

(deftest published-table-remapping-content-test
  (testing "a published table holds the remappings of its fields: a foreign-key remapping by the natural key of its
            target field, an internal remapping with the labels that a person set"
    (collections.tu/with-library [{:keys [data]}]
      (t2/with-transaction [_ nil {:rollback-only true}]
        (t2/delete! :model/FieldValues :field_id [:in [(mt/id :venues :price) (mt/id :venues :name)]])
        (t2/insert! :model/TableUserSettings {:table_id (mt/id :venues) :is_published true :collection_id (:id data)})
        (t2/insert! :model/Dimension {:field_id                (mt/id :venues :category_id)
                                      :name                    "Category"
                                      :type                    :external
                                      :human_readable_field_id (mt/id :categories :name)})
        (t2/insert! :model/Dimension {:field_id (mt/id :venues :price) :name "Price" :type :internal})
        (t2/insert! :model/Dimension {:field_id (mt/id :venues :name) :name "Name" :type :internal})
        ;; The custom mapping editor writes a label for each value: the text of the value for each label that the
        ;; person did not set.
        (t2/insert! :model/FieldValues {:field_id              (mt/id :venues :price)
                                        :type                  :full
                                        :values                [1 2 3 4]
                                        :human_readable_values ["$" "2" "$$$" "4"]})
        (t2/insert! :model/FieldValues {:field_id (mt/id :venues :name) :type :full :values ["A" "B"]})
        (let [item (read-item (table-key :venues))]
          (is (= {:CATEGORY_ID {:remapping {:type "external" :name "Category" :field (field-key :categories :name)}}
                  :PRICE       {:remapping {:type "internal" :name "Price" :labels [[1 "$"] [3 "$$$"]]}}
                  :NAME        {:remapping {:type "internal" :name "Name"}}}
                 (get-in item [:attrs :fields])))
          (is (contains? (:refs item) [:remapping [:env (field-key :categories :name)]])))
        (testing "a label that is the text of its value is no label"
          (t2/update! :model/FieldValues {:field_id (mt/id :venues :price)} {:human_readable_values ["1" "2" "3" "4"]})
          (is (= {:remapping {:type "internal" :name "Price"}}
                 (get-in (read-item (table-key :venues)) [:attrs :fields :PRICE]))))
        (testing "the human-readable values of a field with no internal remapping are no content"
          (t2/delete! :model/Dimension :field_id (mt/id :venues :price))
          (t2/update! :model/Dimension {:field_id (mt/id :venues :name)} {:type :external
                                                                          :human_readable_field_id (mt/id :venues :id)})
          (t2/update! :model/FieldValues {:field_id (mt/id :venues :name)} {:human_readable_values ["a" "b"]})
          (is (= {:CATEGORY_ID {:remapping {:type "external" :name "Category" :field (field-key :categories :name)}}
                  :NAME        {:remapping {:type "external" :name "Name" :field (field-key :venues :id)}}}
                 (get-in (read-item (table-key :venues)) [:attrs :fields]))))))))

(defn- rescan!
  "Stores `values` as the values of field `field-id`, as a warehouse scan that finds them stores them."
  [field-id values]
  (field-values/persist-field-values! (t2/select-one :model/Field field-id)
                                      (field-values/get-latest-full-field-values field-id)
                                      values))

(deftest published-table-rescan-keeps-remapping-test
  (testing "a warehouse scan that adds or drops a value with no label leaves the internal remapping as it is"
    (collections.tu/with-library [{:keys [data]}]
      (t2/with-transaction [_ nil {:rollback-only true}]
        (let [price (mt/id :venues :price)
              id    (table-key :venues)]
          (t2/delete! :model/FieldValues :field_id price)
          (t2/insert! :model/TableUserSettings {:table_id (mt/id :venues) :is_published true :collection_id (:id data)})
          (t2/insert! :model/Dimension {:field_id price :name "Price" :type :internal})
          (t2/insert! :model/FieldValues {:field_id              price
                                          :type                  :full
                                          :values                [1 2 3]
                                          :human_readable_values ["Cheap" "2" "3"]})
          (let [item (read-item id)]
            (is (= {:type "internal" :name "Price" :labels [[1 "Cheap"]]}
                   (get-in item [:attrs :fields :PRICE :remapping])))
            (testing "a scan that adds a value"
              (is (= ::field-values/fv-updated (rescan! price [1 2 3 4])))
              (is (= item (read-item id))))
            (testing "a scan that drops a value"
              (is (= ::field-values/fv-updated (rescan! price [1 2 4])))
              (is (= item (read-item id))))))))))

(defn- archive-by-sync!
  "Archives table `table-id` as warehouse sync archives a table that the warehouse no longer has: sync deactivates it,
  and archives and renames it after the threshold."
  [table-id]
  (t2/update! :metabase_table table-id {:active         false
                                        :deactivated_at (.minusDays (java.time.OffsetDateTime/now) 15)})
  (#'sync.tables/archive-tables! (t2/select-one :model/Database (mt/id))))

(deftest archived-published-table-test
  (testing "a published table that warehouse sync archives keeps its identity, its content and its path"
    (collections.tu/with-library [{:keys [data]}]
      (mt/with-temp [:model/Table             table {:db_id        (mt/id)
                                                     :schema       "PUBLIC"
                                                     :name         "lb_kinds_archived"
                                                     :display_name "Archived orders"
                                                     :active       true}
                     :model/TableUserSettings _     {:table_id      (:id table)
                                                     :is_published  true
                                                     :collection_id (:id data)
                                                     :description   "Orders of last year."}]
        (let [k      [(db-name) "PUBLIC" "lb_kinds_archived"]
              paths  #(layout/layout kinds/codecs %)
              before (app-db/read-current)]
          (is (= "Archived orders" (:name (get before k))))
          (archive-by-sync! (:id table))
          (testing "warehouse sync renamed the table"
            (is (str/starts-with? (t2/select-one-fn :name :metabase_table (:id table)) "lb_kinds_archived__mbarchiv__")))
          (let [after (app-db/read-current)]
            (testing "the read gives the same item at the same path: a push or a pull sees no change"
              (is (= (get before k) (get after k)))
              (is (= {:created #{} :deleted #{} :updated #{}} (diff/diff before after)))
              (is (= (get (paths before) k) (get (paths after) k))))
            (testing "a reference to the table names its original key"
              (is (= [{:id (:id table) :db (db-name) :schema "PUBLIC" :table "lb_kinds_archived"}]
                     (library-branching.db/table-keys-by-id [(:id table)]))))
            (testing "the current content and a write find the table by its original key"
              (is (= (get before k) (instance/current kinds.published-table/kind-store k)))
              (instance/write! kinds.published-table/kind-store k
                               (assoc-in (get before k) [:attrs :description] "Orders of the year before."))
              (is (= "Orders of the year before."
                     (get-in (app-db/read-current) [k :attrs :description]))))
            (testing "a later table with the original name does not take the key from the published table"
              (let [item (get (app-db/read-current) k)]
                (mt/with-temp [:model/Table _ {:db_id (mt/id) :schema "PUBLIC" :name "lb_kinds_archived" :active true}]
                  (is (= item (get (app-db/read-current) k)))
                  (is (= item (instance/current kinds.published-table/kind-store k))))))))))))

(deftest items-fit-the-format-test
  (testing "every item that the instance reads fits the schema of its kind, and survives encode and decode"
    (collections.tu/with-library [{:keys [data metrics]}]
      (mt/with-temp [:model/Card              _ {:name          "Total price"
                                                 :type          :metric
                                                 :collection_id (:id metrics)
                                                 :dataset_query (sum-query :venues :price)}
                     :model/Collection        f {:name "Filters" :namespace "snippets" :location "/"}
                     :model/NativeQuerySnippet _ {:name "A filter" :collection_id (:id f) :content "{{x}} > 1"}
                     :model/TableUserSettings _ {:table_id (mt/id :venues) :is_published true :collection_id (:id data)}
                     :model/FieldUserSettings _ {:field_id (mt/id :venues :price) :semantic_type :type/Currency}
                     :model/Dimension         _ {:field_id                (mt/id :venues :category_id)
                                                 :name                    "Category"
                                                 :type                    :external
                                                 :human_readable_field_id (mt/id :categories :name)}
                     :model/Dimension         _ {:field_id (mt/id :venues :price) :name "Price" :type :internal}
                     :model/Glossary          _ {:term       "lb format churn"
                                                 :definition "Who leaves: 10% of: them."
                                                 :creator_id (mt/user->id :crowberto)}]
        (let [by-kind (codec/by-kind kinds/codecs)
              s       (app-db/read-current)]
          (is (= #{:collection :glossary-term :metric :published-table :snippet} (set (map :kind (vals s)))))
          (doseq [[id item] s
                  :let [c (get by-kind (:kind item))]]
            (testing (pr-str id)
              (is (mr/validate (codec/schema c) item))
              (is (= [id item] (codec/decode c (codec/read-yaml (writer/write-yaml (codec/encode c id item)))))))))))))

;;; ------------------------------------------------- Local changes ------------------------------------------------

(deftest local-changes-test
  (collections.tu/with-library [{:keys [library data metrics]}]
    (mt/with-temp [:model/Collection         folder  {:name "Folder" :location (children-location library)}
                   :model/Collection         sub     {:name "Sub" :location (children-location folder)}
                   :model/Card               metric  {:name          "Total price"
                                                      :type          :metric
                                                      :collection_id (:id metrics)
                                                      :dataset_query (sum-query :venues :price)}
                   :model/Card               nested  {:name          "Nested"
                                                      :type          :metric
                                                      :collection_id (:id folder)
                                                      :dataset_query (sum-query :venues :price)}
                   :model/Collection         outside {:name "Outside" :location "/"}
                   :model/NativeQuerySnippet snippet {:name "A snippet for library branching" :content "1 = 1"}
                   :model/TableUserSettings  _       {:table_id      (mt/id :venues)
                                                      :is_published  true
                                                      :collection_id (:id data)}]
      (let [base   (app-db/read-current)
            local  #(diff/diff base (app-db/read-current))
            none   {:created #{} :deleted #{} :updated #{}}
            venues (table-key :venues)]
        (testing "a save that changes nothing is no local change"
          (t2/update! :model/Card (:id metric) {:name "Total price"})
          (t2/update! :model/NativeQuerySnippet (:id snippet) {:content "1 = 1"})
          (t2/update! :model/Collection (:id folder) {:name "Folder"})
          (is (= none (local))))
        (testing "a rename is a local update, and the rename back is no change"
          (t2/update! :model/Card (:id metric) {:name "Sum of prices"})
          (is (= (assoc none :updated #{(:entity_id metric)}) (local)))
          (t2/update! :model/Card (:id metric) {:name "Total price"})
          (is (= none (local))))
        (testing "a field setting of a published table is a local update of the table"
          (mt/with-temp [:model/FieldUserSettings _ {:field_id (mt/id :venues :price) :display_name "Price level"}]
            (is (= (assoc none :updated #{venues}) (local)))))
        (testing "a new snippet at the root of the snippets namespace is a local create"
          (mt/with-temp [:model/NativeQuerySnippet new-snippet {:name "New snippet for library branching"
                                                                :content "2 = 2"}]
            (is (= (assoc none :created #{(:entity_id new-snippet)}) (local)))))
        (testing "a trashed metric is a local delete"
          (t2/with-transaction [_ nil {:rollback-only true}]
            (t2/update! :model/Card (:id metric) {:archived true})
            (is (= (assoc none :deleted #{(:entity_id metric)}) (local)))))
        (testing "a metric moved out of the Library is a local delete"
          (t2/with-transaction [_ nil {:rollback-only true}]
            (t2/update! :model/Card (:id metric) {:collection_id (:id outside)})
            (is (= (assoc none :deleted #{(:entity_id metric)}) (local)))))
        (testing "an unpublished table is a local delete"
          (t2/with-transaction [_ nil {:rollback-only true}]
            (t2/update! :model/TableUserSettings (mt/id :venues) {:is_published false})
            (is (= (assoc none :deleted #{venues}) (local)))))
        (testing "a trashed collection is a local delete with its subtree; its siblings stay"
          (t2/with-transaction [_ nil {:rollback-only true}]
            (archive-collection! (:id folder))
            (is (= (assoc none :deleted #{(:entity_id folder) (:entity_id sub) (:entity_id nested)}) (local)))))
        (testing "after the rollbacks, nothing changed"
          (is (= none (local))))))))

;;; ---------------------------------------------------- Reads -----------------------------------------------------

(defn- statements-of-read
  "The number of statements that one read of the synced snapshot sends."
  []
  (t2/with-call-count [call-count]
    (app-db/read-current)
    (call-count)))

(deftest batched-read-test
  (testing "a read sends the same number of statements for one item of each kind as for several, whatever they refer to"
    (collections.tu/with-library [{:keys [data metrics]}]
      (mt/with-temp [:model/Card              _ {:name          "Price"
                                                 :type          :metric
                                                 :collection_id (:id metrics)
                                                 :dataset_query (sum-query :venues :price)}
                     :model/Collection        f {:name "Filters" :namespace "snippets" :location "/"}
                     :model/NativeQuerySnippet _ {:name "One" :collection_id (:id f) :content "1 = 1"}
                     :model/TableUserSettings _ {:table_id (mt/id :venues) :is_published true :collection_id (:id data)}
                     :model/FieldUserSettings _ {:field_id (mt/id :venues :price) :display_name "Price level"}
                     :model/Dimension         _ {:field_id (mt/id :venues :price) :name "Price" :type :internal}
                     :model/Glossary          _ {:term "lb batch one" :definition "1" :creator_id (mt/user->id :rasta)}]
        (let [few (statements-of-read)]
          (mt/with-temp [:model/Card              _ {:name          "Latitude"
                                                     :type          :metric
                                                     :collection_id (:id metrics)
                                                     :dataset_query (sum-query :venues :latitude)}
                         :model/Card              _ {:name          "User id"
                                                     :type          :metric
                                                     :collection_id (:id metrics)
                                                     :dataset_query (sum-query :checkins :user_id)}
                         :model/Card              _ {:name          "Category id"
                                                     :type          :metric
                                                     :collection_id (:id metrics)
                                                     :dataset_query (sum-query :venues :category_id)}
                         :model/NativeQuerySnippet _ {:name "Two" :collection_id (:id f) :content "2 = 2"}
                         :model/NativeQuerySnippet _ {:name "Three" :content "3 = 3"}
                         :model/Collection        _ {:name "Sub" :location (children-location metrics)}
                         :model/TableUserSettings _ {:table_id      (mt/id :users)
                                                     :is_published  true
                                                     :collection_id (:id data)}
                         :model/FieldUserSettings _ {:field_id (mt/id :users :name) :display_name "Who"}
                         :model/FieldUserSettings _ {:field_id           (mt/id :checkins :user_id)
                                                     :fk_target_field_id (mt/id :users :id)}
                         :model/Dimension         _ {:field_id (mt/id :users :name) :name "Who" :type :internal}
                         :model/Dimension         _ {:field_id                (mt/id :checkins :user_id)
                                                     :name                    "User"
                                                     :type                    :external
                                                     :human_readable_field_id (mt/id :users :name)}
                         :model/TableUserSettings _ {:table_id      (mt/id :checkins)
                                                     :is_published  true
                                                     :collection_id (:id data)}
                         :model/Glossary          _ {:term "lb batch two" :definition "2" :creator_id (mt/user->id :rasta)}
                         :model/Glossary          _ {:term       "lb batch three"
                                                     :definition "3"
                                                     :creator_id (mt/user->id :crowberto)}]
            (is (= few (statements-of-read)))))))))

(deftest repeated-read-test
  (testing "reads of unchanged content give equal snapshots"
    (collections.tu/with-library [{:keys [metrics]}]
      (mt/with-temp [:model/Card _ {:name          "Price"
                                    :type          :metric
                                    :collection_id (:id metrics)
                                    :dataset_query (sum-query :venues :price)}]
        (is (apply = (repeatedly 3 app-db/read-current)))))))

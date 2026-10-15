(ns metabase-enterprise.library-branching.instance.write-test
  "The write side of the instance for each kind: `write!`, `current` and `trash!`. Each test writes in a transaction
  that rolls back."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.format.kinds :as format.kinds]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.app-db :as app-db]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

;;; ---------------------------------------------------- Helpers ---------------------------------------------------

(defn- store [kind] (get app-db/kind-stores kind))

(defn write!
  "Writes `item` as item `id` of `kind`, with the references of its attributes."
  [kind id item]
  (instance/write! (store kind) id (assoc item :refs (format.kinds/refs kind id (:attrs item)))))

(defn current [kind id] (instance/current (store kind) id))

(defn trash! [kind id] (instance/trash! (store kind) id))

(defn refusal
  "The reason of the ::instance/refused that `(f)` throws, or nil when it throws none."
  [f]
  (try
    (f)
    nil
    (catch clojure.lang.ExceptionInfo e
      (when (= ::instance/refused (:type (ex-data e)))
        (:reason (ex-data e))))))

(defn children-location
  [{:keys [id location]}]
  (str location id "/"))

(defn db-name [] (t2/select-one-fn :name :model/Database (mt/id)))

(defn table-key
  [table]
  (let [{:keys [schema name]} (t2/select-one :model/Table (mt/id table))]
    [(db-name) schema name]))

(defn field-key
  [table field]
  (conj (table-key table) (t2/select-one-fn :name :model/Field (mt/id table field))))

(defn sum-query
  [table field]
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id table)))
        (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id table field)))))))

(defn metric-item
  "The content of a metric at `place` named `item-name`, whose query is the portable query of the metric `card`."
  [card place item-name]
  (-> (current :metric (:entity_id card))
      (assoc :name item-name :place place)))

(def ^:private new-metric-id "lbWriteMetric00000001")

;;; ---------------------------------------------------- Metrics ---------------------------------------------------

(deftest metric-write-test
  (collections.tu/with-library [{:keys [metrics]}]
    (mt/with-temp [:model/Card       model-metric {:name          "Total price"
                                                   :type          :metric
                                                   :display       :scalar
                                                   :collection_id (:id metrics)
                                                   :dataset_query (sum-query :venues :price)}
                   :model/Collection sub          {:name     "Revenue"
                                                   :type     "library-metrics"
                                                   :location (children-location metrics)}]
      (let [item (-> (metric-item model-metric (:entity_id metrics) "Revenue")
                     (assoc-in [:attrs :description] "All revenue."))]
        (testing "a write of a new identity creates the metric, and current returns the content"
          (write! :metric new-metric-id item)
          (is (= (assoc item :refs (format.kinds/refs :metric new-metric-id (:attrs item)))
                 (current :metric new-metric-id)))
          (is (= {:type :metric :collection_id (:id metrics) :archived false}
                 (t2/select-one [:model/Card :type :collection_id :archived] :entity_id new-metric-id))))
        (let [card-id (t2/select-one-pk :model/Card :entity_id new-metric-id)]
          (testing "a write changes every attribute that differs, and an absent attribute goes to its default"
            (let [changed (-> item
                              (assoc :name "Revenue, all")
                              (update :attrs dissoc :description)
                              (update :attrs assoc
                                      :display "line"
                                      :collection_preview false
                                      :visualization_settings {:graph.metrics ["sum"]}))]
              (write! :metric new-metric-id changed)
              (is (= (:attrs changed) (:attrs (current :metric new-metric-id))))
              (is (nil? (t2/select-one-fn :description :model/Card card-id)))))
          (testing "a write of another place moves the metric"
            (write! :metric new-metric-id (assoc item :place (:entity_id sub)))
            (is (= (:entity_id sub) (:place (current :metric new-metric-id))))
            (is (= (:id sub) (t2/select-one-fn :collection_id :model/Card card-id))))
          (testing "trash! moves the metric to the trash: current is nil, and it is not in the synced snapshot"
            (trash! :metric new-metric-id)
            (is (nil? (current :metric new-metric-id)))
            (is (not (contains? (app-db/read-current) new-metric-id)))
            (is (= {:archived true :archived_directly true}
                   (t2/select-one [:model/Card :archived :archived_directly] card-id))))
          (testing "a trash of an item in the trash, and of an identity that no row has, does nothing"
            (is (nil? (trash! :metric new-metric-id)))
            (is (nil? (trash! :metric "lbNoSuchMetric0000001"))))
          (testing "a write of a trashed identity restores the same row with the content"
            (write! :metric new-metric-id item)
            (is (= (:attrs item) (:attrs (current :metric new-metric-id))))
            (is (= card-id (t2/select-one-pk :model/Card :entity_id new-metric-id)))
            (is (= {:archived false :archived_directly false}
                   (t2/select-one [:model/Card :archived :archived_directly] card-id)))))))))

(deftest write-keeps-instance-local-attributes-test
  (testing "a write never changes the public link, the embedding settings or the creator"
    (collections.tu/with-library [{:keys [metrics]}]
      (mt/with-temp [:model/Card card {:name              "Shared"
                                       :type              :metric
                                       :display           :scalar
                                       :collection_id     (:id metrics)
                                       :dataset_query     (sum-query :venues :price)
                                       :creator_id        (mt/user->id :rasta)
                                       :public_uuid       (str (random-uuid))
                                       :made_public_by_id (mt/user->id :crowberto)
                                       :enable_embedding  true
                                       :embedding_params  {:category "enabled"}}]
        (let [local   [:public_uuid :made_public_by_id :enable_embedding :embedding_params :creator_id]
              before  (t2/select-one (into [:model/Card] local) (:id card))
              other   (:attrs (current :metric (:entity_id card)))
              changed (-> (current :metric (:entity_id card))
                          (assoc :name "Shared, renamed")
                          (assoc :attrs (assoc other :description "Changed" :display "line")))]
          (mt/with-current-user (mt/user->id :crowberto)
            (write! :metric (:entity_id card) changed))
          (is (= "Shared, renamed" (:name (current :metric (:entity_id card)))))
          (is (= before (t2/select-one (into [:model/Card] local) (:id card)))))))))

;;; -------------------------------------------------- Identity rule ------------------------------------------------

(deftest no-take-over-outside-the-library-test
  (testing "a write cannot take over an item outside the Library tree that has the same identity, and writes nothing"
    (collections.tu/with-library [{:keys [metrics]}]
      (let [personal (t2/select-one-pk :model/Collection :personal_owner_id (mt/user->id :rasta))]
        (mt/with-temp [:model/Card       model    {:name          "Library metric"
                                                   :type          :metric
                                                   :display       :scalar
                                                   :collection_id (:id metrics)
                                                   :dataset_query (sum-query :venues :price)}
                       :model/Card       mine     {:name          "My metric"
                                                   :type          :metric
                                                   :display       :scalar
                                                   :collection_id personal
                                                   :dataset_query (sum-query :venues :price)}
                       :model/Card       at-root  {:name          "Root metric"
                                                   :type          :metric
                                                   :display       :scalar
                                                   :collection_id nil
                                                   :dataset_query (sum-query :venues :price)}
                       :model/Card       question {:name          "A question"
                                                   :type          :question
                                                   :display       :table
                                                   :collection_id (:id metrics)
                                                   :dataset_query (sum-query :venues :price)}
                       :model/Collection folder   {:name     "My folder"
                                                   :location (str "/" personal "/")}]
          (let [item     (metric-item model (:entity_id metrics) "Taken over")
                row      #(t2/select-one [:model/Card :name :type :collection_id :archived] (:id %))
                rows     (mapv row [mine at-root question])]
            (is (= :outside-library (refusal #(write! :metric (:entity_id mine) item))))
            (is (= :outside-library (refusal #(write! :metric (:entity_id at-root) item))))
            (is (= :other-kind (refusal #(write! :metric (:entity_id question) item))))
            (is (= :outside-library (refusal #(trash! :metric (:entity_id mine)))))
            (is (= :outside-library
                   (refusal #(write! :collection (:entity_id folder)
                                     {:kind :collection :name "Taken" :place (:entity_id metrics) :refs #{}
                                      :attrs {:type "library-metrics"}}))))
            (is (= rows (mapv row [mine at-root question])))
            (is (= {:name "My folder" :location (str "/" personal "/")}
                   (t2/select-one [:model/Collection :name :location] (:id folder))))))))))

;;; ----------------------------------------------------- Trash ----------------------------------------------------

(deftest trash-keeps-outside-content-working-test
  (testing "after trash! of a Library metric, a question outside the Library that uses it still runs"
    (collections.tu/with-library [{:keys [metrics]}]
      (mt/with-temp [:model/Card metric {:name          "Price total"
                                         :type          :metric
                                         :display       :scalar
                                         :collection_id (:id metrics)
                                         :dataset_query (sum-query :venues :price)}]
        (let [mp       (mt/metadata-provider)
              query    (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                           (lib/aggregate (lib.metadata/metric mp (:id metric))))
              run      #(-> (qp/process-query query) :data :rows)
              expected (run)]
          (is (seq expected))
          (trash! :metric (:entity_id metric))
          (is (nil? (current :metric (:entity_id metric))))
          (is (= expected (run))))))))

(deftest collection-trash-and-restore-test
  (collections.tu/with-library [{:keys [metrics]}]
    (mt/with-temp [:model/Collection folder {:name     "Folder"
                                             :type     "library-metrics"
                                             :location (children-location metrics)}
                   :model/Collection sub    {:name     "Sub"
                                             :type     "library-metrics"
                                             :location (children-location folder)}
                   :model/Card       metric {:name          "Price total"
                                             :type          :metric
                                             :display       :scalar
                                             :collection_id (:id folder)
                                             :dataset_query (sum-query :venues :price)}]
      (let [ids    (map :entity_id [folder sub metric])
            before (app-db/read-current)]
        (testing "trash! of a collection moves its subtree and its items to the trash"
          (trash! :collection (:entity_id folder))
          (is (= [nil nil nil] (map #(current %1 %2) [:collection :collection :metric] ids)))
          (is (every? :archived (t2/select [:model/Collection :archived] :id [:in (map :id [folder sub])])))
          (is (t2/select-one-fn :archived :model/Card (:id metric))))
        (testing "a write of the trashed collection restores it alone, at its place"
          (write! :collection (:entity_id folder) (get before (:entity_id folder)))
          (is (= (get before (:entity_id folder)) (current :collection (:entity_id folder))))
          (is (nil? (current :collection (:entity_id sub))))
          (is (nil? (current :metric (:entity_id metric)))))
        (testing "a write of each item under it restores the item"
          (write! :collection (:entity_id sub) (get before (:entity_id sub)))
          (write! :metric (:entity_id metric) (get before (:entity_id metric)))
          (is (= (select-keys before ids) (select-keys (app-db/read-current) ids))))))))

;;; ---------------------------------------------------- Places ----------------------------------------------------

(deftest move-to-the-root-level-test
  (testing "a write with no place moves an item to the root level of its namespace"
    (mt/with-temp [:model/Collection         outer   {:name "Outer" :namespace "snippets" :location "/"}
                   :model/Collection         inner   {:name "Inner" :namespace "snippets" :location (children-location outer)}
                   :model/Collection         leaf    {:name "Leaf" :namespace "snippets" :location (children-location inner)}
                   :model/NativeQuerySnippet snippet {:name          "Root move snippet"
                                                      :content       "1 = 1"
                                                      :collection_id (:id inner)}]
      (let [inner-item (current :collection (:entity_id inner))]
        (testing "a collection, with its subtree"
          (write! :collection (:entity_id inner) (assoc inner-item :place nil))
          (is (nil? (:place (current :collection (:entity_id inner)))))
          (is (= "/" (t2/select-one-fn :location :model/Collection (:id inner))))
          (is (= (str "/" (:id inner) "/") (t2/select-one-fn :location :model/Collection (:id leaf))))
          (is (= (:entity_id inner) (:place (current :collection (:entity_id leaf))))))
        (testing "a snippet"
          (write! :snippet (:entity_id snippet) (assoc (current :snippet (:entity_id snippet)) :place nil))
          (is (nil? (:place (current :snippet (:entity_id snippet)))))
          (is (nil? (t2/select-one-fn :collection_id :model/NativeQuerySnippet (:id snippet))))))))
  (testing "a collection that is not a fixed root cannot be at the root level"
    (collections.tu/with-library [{:keys [metrics]}]
      (mt/with-temp [:model/Collection folder {:name     "Folder"
                                               :type     "library-metrics"
                                               :location (children-location metrics)}]
        (is (= :place (refusal #(write! :collection (:entity_id folder)
                                        (assoc (current :collection (:entity_id folder)) :place nil)))))
        (is (= (children-location metrics) (t2/select-one-fn :location :model/Collection (:id folder))))))))

(deftest refused-writes-write-nothing-test
  (collections.tu/with-library [{:keys [metrics data]}]
    (mt/with-temp [:model/Card       model-metric {:name          "Total price"
                                                   :type          :metric
                                                   :display       :scalar
                                                   :collection_id (:id metrics)
                                                   :dataset_query (sum-query :venues :price)}
                   :model/Collection trashed      {:name     "Trashed"
                                                   :type     "library-metrics"
                                                   :location (children-location metrics)
                                                   :archived true}
                   :model/Collection outside      {:name "Outside" :location "/"}]
      (let [item   (metric-item model-metric (:entity_id metrics) "New")
            table  (table-key :venues)
            tables #(t2/select-one [:model/TableUserSettings :is_published :collection_id] :table_id (mt/id :venues))
            before (tables)]
        (is (= :invalid-content (refusal #(instance/write! (store :metric) new-metric-id (assoc item :kind :snippet)))))
        (is (= :invalid-content (refusal #(write! :metric new-metric-id (update item :attrs dissoc :query)))))
        (is (= :invalid-content (refusal #(instance/write! (store :metric) new-metric-id (assoc item :refs #{})))))
        (is (= :place (refusal #(write! :metric new-metric-id (assoc item :place (:entity_id trashed))))))
        (is (= :place (refusal #(write! :metric new-metric-id (assoc item :place (:entity_id outside))))))
        (is (= :place (refusal #(write! :metric new-metric-id (assoc item :place "lbNoSuchCollection001")))))
        (is (= :place (refusal #(write! :metric new-metric-id (assoc item :place nil)))))
        (is (not (t2/exists? :model/Card :entity_id new-metric-id)))
        (is (= :environment (refusal #(write! :published-table [(db-name) "PUBLIC" "NO_SUCH_TABLE"]
                                              {:kind :published-table :name "None" :place (:entity_id data)
                                               :attrs {}}))))
        (is (= :environment (refusal #(write! :published-table table
                                              {:kind  :published-table :name "Venues" :place (:entity_id data)
                                               :attrs {:description "Places"
                                                       :fields      {:NO_SUCH_FIELD {:display_name "None"}}}}))))
        (is (= before (tables)))))))

;;; ------------------------------------------------ Published tables -----------------------------------------------

(deftest published-table-write-test
  (collections.tu/with-library [{:keys [data]}]
    (t2/with-transaction [_ nil {:rollback-only true}]
      (t2/delete! :model/TableUserSettings :table_id (mt/id :venues))
      (t2/delete! :model/FieldUserSettings :field_id [:in (t2/select-pks-set :model/Field :table_id (mt/id :venues))])
      (let [id      (table-key :venues)
            item    {:kind  :published-table
                     :name  "Places"
                     :place (:entity_id data)
                     :attrs {:description "Places to eat."
                             :fields      {:PRICE       {:display_name "Price level" :semantic_type "type/Category"}
                                           :CATEGORY_ID {:fk_target (field-key :categories :id)}}}}
            refs    #(assoc % :refs (format.kinds/refs :published-table id (:attrs %)))]
        (is (nil? (current :published-table id)))
        (testing "a write publishes the table into its place, with the values that users set"
          (write! :published-table id item)
          (is (= (refs item) (current :published-table id)))
          (is (= (mt/id :categories :id)
                 (t2/select-one-fn :fk_target_field_id :model/FieldUserSettings :field_id (mt/id :venues :category_id)))))
        (testing "an absent field setting is cleared"
          (let [changed (update-in item [:attrs :fields] dissoc :PRICE)]
            (write! :published-table id changed)
            (is (= (refs changed) (current :published-table id)))))
        (testing "a name equal to the table's own display name is no user value"
          (let [own     (t2/select-one-fn :display_name :model/Table (mt/id :venues))
                changed (assoc item :name own)]
            (write! :published-table id changed)
            (is (= (refs changed) (current :published-table id)))
            (is (nil? (t2/select-one-fn :display_name :model/TableUserSettings :table_id (mt/id :venues))))))
        (testing "a data layer reads back with no visibility type, which Metabase derives from it"
          (doseq [layer ["hidden" "final" "internal" "hidden"]]
            (let [changed (assoc-in item [:attrs :data_layer] layer)]
              (write! :published-table id changed)
              (is (= (refs changed) (current :published-table id)) layer)))
          (is (= :hidden (t2/select-one-fn :visibility_type :model/TableUserSettings :table_id (mt/id :venues))))
          (write! :published-table id item)
          (is (= (refs item) (current :published-table id))))
        (testing "content with the visibility type of the table is refused"
          (is (= :invalid-content
                 (refusal #(write! :published-table id (assoc-in item [:attrs :visibility_type] "hidden"))))))
        (testing "trash! unpublishes the table, and a write publishes it again"
          (trash! :published-table id)
          (is (nil? (current :published-table id)))
          (write! :published-table id item)
          (is (= (refs item) (current :published-table id))))))))

(defn- field-values-writes
  "The number of writes of human-readable values that `(f)` makes."
  [f]
  (let [n (atom 0)]
    (mt/with-dynamic-fn-redefs [library-branching.db/set-human-readable-values! (fn [& _] (swap! n inc) 1)]
      (f))
    @n))

(deftest published-table-remapping-write-test
  (testing "a write sets the remappings of the fields; a local removal is a change that the next write undoes; a write
            with no remapping removes it"
    (collections.tu/with-library [{:keys [data]}]
      (t2/with-transaction [_ nil {:rollback-only true}]
        (let [field-ids (t2/select-pks-set :model/Field :table_id (mt/id :venues))]
          (t2/delete! :model/TableUserSettings :table_id (mt/id :venues))
          (t2/delete! :model/FieldUserSettings :field_id [:in field-ids])
          (t2/delete! :model/Dimension :field_id [:in field-ids])
          (t2/delete! :model/FieldValues :field_id (mt/id :venues :price))
          (t2/insert! :model/FieldValues {:field_id (mt/id :venues :price) :type :full :values [1 2 3 4]}))
        (let [id        (table-key :venues)
              price     (mt/id :venues :price)
              item      {:kind  :published-table
                         :name  "Places"
                         :place (:entity_id data)
                         :attrs {:fields {:CATEGORY_ID {:remapping {:type  "external"
                                                                    :name  "Category"
                                                                    :field (field-key :categories :name)}}
                                          :PRICE       {:display_name "Price level"
                                                        :remapping    {:type   "internal"
                                                                       :name   "Price"
                                                                       :labels [[1 "$"] [2 "$$"]]}}}}}
              refs      #(assoc % :refs (format.kinds/refs :published-table id (:attrs %)))
              dimension #(t2/select-one [:model/Dimension :type :name :human_readable_field_id]
                                        :field_id (mt/id :venues %))
              values    #(some-> (t2/select-one [:model/FieldValues :values :human_readable_values]
                                                :field_id price :type :full)
                                 (->> (into {})))]
          (testing "a write sets both kinds of remapping; the labels go to the values that warehouse sync found, and a
                    value with no label gets its own text"
            (write! :published-table id item)
            (is (= (refs item) (current :published-table id)))
            (is (= {:type :external :name "Category" :human_readable_field_id (mt/id :categories :name)}
                   (into {} (dimension :category_id))))
            (is (= {:type :internal :name "Price" :human_readable_field_id nil} (into {} (dimension :price))))
            (is (= {:values [1 2 3 4] :human_readable_values ["$" "$$" "3" "4"]} (values)))
            (testing "a write of the current content writes no field values"
              (is (zero? (field-values-writes #(write! :published-table id (current :published-table id)))))))
          (testing "a local removal of a remapping is a change of the table, and a write restores it"
            (t2/delete! :model/Dimension :field_id (mt/id :venues :category_id))
            (is (not= (refs item) (current :published-table id)))
            (write! :published-table id item)
            (is (= (refs item) (current :published-table id))))
          (testing "a write changes the type of a remapping and its labels"
            (let [changed (-> item
                              (assoc-in [:attrs :fields :CATEGORY_ID :remapping] {:type "internal" :name "Kind"})
                              (assoc-in [:attrs :fields :PRICE :remapping :labels] [[1 "Cheap"] [2 "Dear"] [3 "Very"]]))]
              (write! :published-table id changed)
              (is (= (refs changed) (current :published-table id)))
              (is (= {:type :internal :name "Kind" :human_readable_field_id nil}
                     (into {} (dimension :category_id))))
              (is (= {:values [1 2 3 4] :human_readable_values ["Cheap" "Dear" "Very" "4"]} (values)))))
          (testing "an internal remapping with no labels clears the human-readable values"
            (let [changed (update-in item [:attrs :fields :PRICE :remapping] dissoc :labels)]
              (write! :published-table id changed)
              (is (= (refs changed) (current :published-table id)))
              (is (= {:values [1 2 3 4] :human_readable_values []} (values)))
              (testing "and a write of that content again writes no field values"
                (is (zero? (field-values-writes #(write! :published-table id changed)))))))
          (testing "a label of a value that warehouse sync did not find stays out of the instance, and the values stay"
            (let [changed (assoc-in item [:attrs :fields :PRICE :remapping :labels] [[1 "$"] [9 "Nine"]])]
              (write! :published-table id changed)
              (is (= (refs (assoc-in item [:attrs :fields :PRICE :remapping :labels] [[1 "$"]]))
                     (current :published-table id)))
              (is (= {:values [1 2 3 4] :human_readable_values ["$" "2" "3" "4"]} (values)))
              (testing "and a write of that content again writes no field values"
                (is (zero? (field-values-writes #(write! :published-table id changed)))))))
          (testing "with no field values row, a write sets the dimension and inserts no row"
            (t2/delete! :model/FieldValues :field_id price)
            (write! :published-table id item)
            (is (= (refs (update-in item [:attrs :fields :PRICE :remapping] dissoc :labels))
                   (current :published-table id)))
            (is (= {:type :internal :name "Price" :human_readable_field_id nil} (into {} (dimension :price))))
            (is (nil? (values)))
            (t2/insert! :model/FieldValues {:field_id price :type :full :values [1 2 3 4]}))
          (testing "a write with no remapping removes the dimension, and keeps the other settings of the field"
            (let [changed (-> item
                              (update-in [:attrs :fields] dissoc :CATEGORY_ID)
                              (update-in [:attrs :fields :PRICE] dissoc :remapping))]
              (write! :published-table id changed)
              (is (= (refs changed) (current :published-table id)))
              (is (nil? (dimension :category_id)))
              (is (nil? (dimension :price)))
              (is (= "Price level" (t2/select-one-fn :display_name :model/FieldUserSettings :field_id price)))))
          (testing "a remapping to a field that the instance does not have is refused, and writes nothing"
            (let [before (current :published-table id)]
              (is (= :environment
                     (refusal #(write! :published-table id
                                       (assoc-in item [:attrs :fields :CATEGORY_ID :remapping :field]
                                                 (conj (table-key :categories) "NO_SUCH_FIELD"))))))
              (is (= before (current :published-table id))))))))))

(deftest published-table-legacy-visibility-type-test
  (testing "a visibility type that a person saved reads as the data layer that Metabase gives it, and a write of that
            content changes no row"
    (collections.tu/with-library [{:keys [data]}]
      (t2/with-transaction [_ nil {:rollback-only true}]
        (let [table-id (mt/id :venues)
              id       (table-key :venues)
              settings #(t2/select-one :metabase_table_user_settings :table_id table-id)]
          (t2/delete! :model/TableUserSettings :table_id table-id)
          (t2/delete! :model/FieldUserSettings :field_id [:in (t2/select-pks-set :model/Field :table_id table-id)])
          (t2/insert! :model/TableUserSettings {:table_id        table-id
                                                :is_published    true
                                                :collection_id   (:id data)
                                                :visibility_type :technical})
          (let [item   (current :published-table id)
                before (settings)]
            (is (= {:data_layer "hidden"} (:attrs item)))
            (write! :published-table id item)
            (is (= before (settings)))
            (is (= "technical" (:visibility_type (settings))))))))))

;;; ---------------------------------------------------- Snippets ---------------------------------------------------

(deftest snippet-write-test
  (mt/with-temp [:model/Collection         folder {:name "Writes" :namespace "snippets" :location "/"}
                 :model/NativeQuerySnippet base   {:name "Base for library writes" :content "x > 1"}
                 :model/NativeQuerySnippet combo  {:name          "Combo for library writes"
                                                   :collection_id (:id folder)
                                                   :content       "{{snippet: Base for library writes}} AND y = 2"}]
    (let [item (current :snippet (:entity_id combo))
          id   "lbWriteSnippet0000001"]
      (testing "a new snippet with a reference to another snippet"
        (write! :snippet id (assoc item :name "Copy for library writes"))
        (is (= (assoc item :name "Copy for library writes") (current :snippet id)))
        (is (= #{[:snippet (:entity_id base)]} (:refs (current :snippet id)))))
      (testing "a change of the content and of the description"
        (let [changed (-> item
                          (assoc :name "Copy for library writes")
                          (assoc :attrs {:content "z = 3" :description "Plain."}))]
          (write! :snippet id changed)
          (is (= (assoc changed :refs #{}) (current :snippet id)))))
      (testing "trash! and a restore"
        (trash! :snippet id)
        (is (nil? (current :snippet id)))
        (write! :snippet id (assoc item :name "Copy for library writes"))
        (is (= (assoc item :name "Copy for library writes") (current :snippet id)))))))

;;; ----------------------------------------------------- Laws -----------------------------------------------------

(defn- rows
  "Every column of the app DB rows that hold the content of the items of `ids` of the synced snapshot."
  [s]
  (let [ids (keys s)]
    {:cards       (t2/select :report_card :entity_id [:in (filter string? ids)] {:order-by [:id]})
     :collections (t2/select :collection :entity_id [:in (filter string? ids)] {:order-by [:id]})
     :snippets    (t2/select :native_query_snippet :entity_id [:in (filter string? ids)] {:order-by [:id]})
     :tables      (t2/select :metabase_table_user_settings {:order-by [:table_id]})
     :fields      (t2/select :metabase_field_user_settings {:order-by [:field_id]})
     :dimensions  (t2/select :dimension {:order-by [:id]})
     :values      (t2/select :metabase_fieldvalues :field_id (mt/id :venues :price) {:order-by [:id]})}))

(deftest write-of-current-content-changes-no-row-test
  (testing "GetPut: a write of the current content of each item changes no row, not even a time stamp"
    (collections.tu/with-library [{:keys [data metrics]}]
      (mt/with-temp [:model/Card              _ {:name                   "Price"
                                                 :type                   :metric
                                                 :display                :scalar
                                                 :description            "The sum."
                                                 :visualization_settings {:graph.metrics ["sum"]}
                                                 :collection_id          (:id metrics)
                                                 :dataset_query          (sum-query :venues :price)}
                     :model/Collection        f {:name "Filters" :namespace "snippets" :location "/"}
                     :model/NativeQuerySnippet _ {:name "Getput snippet" :collection_id (:id f) :content "{{x}} > 1"}
                     :model/TableUserSettings _ {:table_id      (mt/id :venues)
                                                 :is_published  true
                                                 :collection_id (:id data)
                                                 :description   "Places."}
                     :model/FieldUserSettings _ {:field_id (mt/id :venues :price) :display_name "Price level"}
                     :model/Dimension         _ {:field_id                (mt/id :venues :category_id)
                                                 :name                    "Category"
                                                 :type                    :external
                                                 :human_readable_field_id (mt/id :categories :name)}
                     :model/Dimension         _ {:field_id (mt/id :venues :price) :name "Price" :type :internal}]
        (let [s      (app-db/read-current)
              before (rows s)]
          (doseq [[id item] (sort-by (comp str key) s)]
            (instance/write! (store (:kind item)) id item))
          (is (= before (rows s)))
          (is (= s (app-db/read-current))))))))

(deftest take-theirs-over-a-local-change-test
  (testing "a write of the pushed content over a local rename gives the pushed content, and one row has the identity"
    (collections.tu/with-library [{:keys [metrics]}]
      (mt/with-temp [:model/Card card {:name          "Pushed name"
                                       :type          :metric
                                       :display       :scalar
                                       :collection_id (:id metrics)
                                       :dataset_query (sum-query :venues :price)}]
        (let [pushed (current :metric (:entity_id card))]
          (t2/update! :model/Card (:id card) {:name "Local name"})
          (write! :metric (:entity_id card) pushed)
          (is (= pushed (current :metric (:entity_id card))))
          (is (= 1 (t2/count :model/Card :entity_id (:entity_id card)))))))))

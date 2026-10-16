(ns metabase-enterprise.serialization.v2.kind-layout-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.test-util :as ts]
   [metabase-enterprise.serialization.v2.extract :as extract]
   [metabase-enterprise.serialization.v2.ingest :as ingest]
   [metabase-enterprise.serialization.v2.load :as serdes.load]
   [metabase-enterprise.serialization.v2.storage :as storage]
   [metabase-enterprise.serialization.v2.storage.files :as storage.files]
   [metabase-enterprise.serialization.v2.storage.kind-folders :as kind-folders]
   [metabase-enterprise.serialization.v2.storage.kind-layout :as kind-layout]
   [metabase-enterprise.serialization.v2.storage.util :as storage.util]
   [metabase.actions.core :as actions]
   [metabase.collections.core :as collections]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- create-world!
  "Creates one item of each kind the kind layout places, and returns the entity_id of each, by a name the tests use."
  []
  (collections/create-library-collection!)
  (let [library    (t2/select-one :model/Collection :type collections/library-collection-type)
        coll-of    (fn [coll-type] (t2/select-one :model/Collection :type coll-type :location (str "/" (:id library) "/")))
        data       (coll-of collections/library-data-collection-type)
        metrics    (coll-of collections/library-metrics-collection-type)
        dashboards (coll-of collections/library-dashboards-collection-type)
        user       (ts/create! :model/User :email "maker@example.com")
        db         (ts/create! :model/Database :name "My DB" :engine :postgres)
        sales      (ts/create! :model/Collection :name "Sales" :type collections/library-data-collection-type
                               :location (str (:location data) (:id data) "/"))
        orders     (ts/create! :model/Table :name "orders" :schema "PUBLIC" :db_id (:id db)
                               :is_published true :collection_id (:id sales))
        total      (ts/create! :model/Field :name "TOTAL" :table_id (:id orders) :base_type :type/Integer)
        _customers (ts/create! :model/Table :name "customers" :schema "PUBLIC" :db_id (:id db))
        segment    (ts/create! :model/Segment :name "Big Orders" :table_id (:id orders) :creator_id (:id user)
                               :definition {:source-table (:id orders) :filter [:> [:field (:id total) nil] 100]})
        query      {:database (:id db) :type :query :query {:source-table (:id orders)}}
        mrr        (ts/create! :model/Card :name "MRR" :type :metric :collection_id (:id metrics)
                               :dataset_query query :creator_id (:id user))
        kpis       (ts/create! :model/Dashboard :name "KPIs" :collection_id (:id dashboards) :creator_id (:id user))
        ops        (ts/create! :model/Collection :name "Ops" :location "/")
        daily      (ts/create! :model/Dashboard :name "Daily" :collection_id (:id ops) :creator_id (:id user))
        weekly     (ts/create! :model/Card :name "Weekly Actives" :collection_id (:id ops)
                               :dashboard_id (:id daily) :dataset_query query :creator_id (:id user))
        model      (ts/create! :model/Card :name "Orders Model" :type :model :collection_id (:id ops)
                               :dataset_query query :creator_id (:id user))
        refund     (ts/create! :model/Action :name "Refund" :type :implicit :model_id (:id model)
                               :creator_id (:id user))
        launches   (ts/create! :model/Timeline :name "Launches" :collection_id (:id ops) :creator_id (:id user))
        question   (ts/create! :model/Card :name "Orders" :collection_id (:id ops) :dataset_query query
                               :creator_id (:id user))
        notes      (ts/create! :model/Document :name "Q3 Notes" :collection_id (:id ops) :creator_id (:id user)
                               :document {:type "doc" :content []} :content_type "application/json+vnd.prose-mirror")
        top        (ts/create! :model/Card :name "Top Customers" :collection_id (:id ops) :document_id (:id notes)
                               :dataset_query query :creator_id (:id user))
        active     (ts/create! :model/NativeQuerySnippet :name "Active Users" :content "1" :creator_id (:id user))
        shared     (ts/create! :model/Collection :name "Shared" :namespace :snippets :location "/")
        spenders   (ts/create! :model/NativeQuerySnippet :name "Big Spenders" :content "2" :creator_id (:id user)
                               :collection_id (:id shared))
        restart    (t2/select-one :model/Action
                                  :id (actions/insert! {:name          "Restart Job"
                                                        :type          :query
                                                        :database_id   (:id db)
                                                        :dataset_query {:lib/type :mbql/query
                                                                        :database (:id db)
                                                                        :stages   [{:lib/type :mbql.stage/native
                                                                                    :native   "SELECT 1"}]}
                                                        :creator_id    (:id user)}))
        transform  (ts/create! :model/Transform :name "Dedupe Users" :creator_id (:id user)
                               :source {:type  "query"
                                        :query {:database (:id db) :type "native" :native {:query "SELECT 1 AS ID"}}}
                               :target {:database (:id db) :type "table" :schema "PUBLIC" :name "deduped"})
        tt         (ts/create! :model/TransformTest :name "Nulls Dropped" :transform_id (:id transform)
                               :creator_id (:id user) :inputs [] :expectations [])
        tag        (ts/create! :model/TransformTag :name "Nightly")
        arr        (ts/create! :model/Glossary :term "ARR" :definition "Annual recurring revenue" :creator_id (:id user))]
    {:library    (:entity_id library)
     :data       (:entity_id data)
     :metrics    (:entity_id metrics)
     :dashboards (:entity_id dashboards)
     :sales      (:entity_id sales)
     :segment    (:entity_id segment)
     :mrr        (:entity_id mrr)
     :kpis       (:entity_id kpis)
     :daily      (:entity_id daily)
     :weekly     (:entity_id weekly)
     :ops        (:entity_id ops)
     :model      (:entity_id model)
     :refund     (:entity_id refund)
     :launches   (:entity_id launches)
     :question   (:entity_id question)
     :notes      (:entity_id notes)
     :top        (:entity_id top)
     :active     (:entity_id active)
     :shared     (:entity_id shared)
     :spenders   (:entity_id spenders)
     :restart    (:entity_id restart)
     :transform  (:entity_id transform)
     :tt         (:entity_id tt)
     :tag        (:entity_id tag)
     :arr        (:entity_id arr)}))

(def ^:private expected-paths
  "The path the kind layout gives each item of [[create-world!]]; nil for an item with no file."
  {:library    nil
   :data       nil
   :metrics    nil
   :dashboards nil
   :sales      "data/sales/collection.yaml"
   :segment    "data/sales/orders.table/big_orders.segment.yaml"
   :mrr        "metrics/mrr.metric.yaml"
   :kpis       "dashboards/kpis.dashboard.yaml"
   :daily      "collections/main/ops/daily.dashboard.yaml"
   :weekly     "collections/main/ops/daily.dashboard/weekly_actives.question.yaml"
   :ops        "collections/main/ops/collection.yaml"
   :model      "collections/main/ops/orders_model.model.yaml"
   :refund     "collections/main/ops/orders_model.model/refund.action.yaml"
   :launches   "collections/main/ops/launches.timeline.yaml"
   :question   "collections/main/ops/orders.question.yaml"
   :notes      "collections/main/ops/q3_notes.document.yaml"
   :top        "collections/main/ops/q3_notes.document/top_customers.question.yaml"
   :active     "snippets/active_users.snippet.yaml"
   :shared     "snippets/shared/collection.yaml"
   :spenders   "snippets/shared/big_spenders.snippet.yaml"
   :restart    "data_actions/restart_job.action.yaml"
   :transform  "transforms/dedupe_users.transform.yaml"
   :tt         "transforms/dedupe_users.transform/nulls_dropped.transform_test.yaml"
   :tag        "transform_tags/nightly.transform_tag.yaml"
   :arr        "glossary/arr.term.yaml"})

(def ^:private expected-data-model-paths
  "The path the kind layout gives each table, field and database of [[create-world!]]."
  #{"data/sales/orders.table.yaml"
    "databases/my_db/public/customers.table.yaml"
    "databases/my_db.database.yaml"})

(defn- extract-all []
  (serdes/with-cache (into [] (extract/extract {:no-settings true :include-field-values false}))))

(deftest kind-layout-paths-test
  (mt/with-premium-features #{:transforms-basic :library}
    (ts/with-random-dump-dir [dump-dir "kind-layout-"]
      (ts/with-dbs [source-db dest-db]
        (let [eids     (ts/with-db source-db (create-world!))
              entities (ts/with-db source-db (extract-all))
              ctx      (ts/with-db source-db (storage.util/storage-context kind-layout/kind-layout))
              paths    (ts/with-db source-db
                         (into {} (map (juxt identity #(storage.util/entity-file-path ctx %))) entities))
              by-eid   (into {} (for [[entity path] paths
                                      :when (:entity_id entity)]
                                  [(:entity_id entity) path]))]
          (testing "each item is at the path of its kind"
            (doseq [[k eid] eids]
              (testing k
                (is (contains? by-eid eid) "the item is extracted")
                (is (= (expected-paths k) (by-eid eid))))))
          (testing "tables, fields and databases"
            (is (every? (set (vals paths)) expected-data-model-paths)))
          (testing "no two items share a path"
            (let [written (remove nil? (vals paths))]
              (is (= (count written) (count (distinct written))))))
          (testing "only the Library's collections have no file"
            (is (= #{(:library eids) (:data eids) (:metrics eids) (:dashboards eids)}
                   (into #{} (comp (filter (comp nil? val))
                                   (map key)
                                   ;; a table's settings, columns and remappings are in the table's file
                                   (remove (comp #{"TableUserSettings" "Field" "FieldUserSettings" "Dimension"}
                                                 :model last :serdes/meta))
                                   (map :entity_id))
                         paths))))
          (testing "every path is in a folder the import reads"
            (is (every? ingest/entity-file-path? (remove nil? (vals paths)))))
          (testing "export then import gives the same items"
            (ts/with-db source-db
              (storage/store! entities (storage.files/file-writer dump-dir kind-layout/kind-layout)))
            (is (not (.exists (io/file dump-dir "collections" "main" "ops.yaml"))) "no collection file of the default layout")
            ;; a file the user keeps in a folder of the kind layout is skipped, not an error
            (spit (io/file dump-dir "data" "list.yaml") "- a\n- b\n")
            (ts/with-db dest-db
              (collections/create-library-collection!)
              (is (serdes/with-cache (serdes.load/load-metabase! (ingest/ingest-yaml dump-dir))))
              (let [loaded (into #{} (comp (map :entity_id) (remove nil?)) (extract-all))]
                (doseq [[k eid] eids]
                  (testing k
                    (is (contains? loaded eid))))))))))))

(defn- path-of
  "The kind layout's path of the card with `card-id`, in storage context `ctx`."
  [ctx card-id]
  (storage.util/entity-file-path ctx (serdes/extract-one "Card" {} (t2/select-one :model/Card :id card-id))))

(deftest name-clashes-number-items-in-creation-order-test
  (mt/with-empty-h2-app-db!
    (let [ops    (ts/create! :model/Collection :name "Ops" :location "/")
          card!  (fn [card-name created-at]
                   (:id (ts/create! :model/Card :name card-name :collection_id (:id ops) :created_at created-at)))
          ;; the newer card is created first
          newer  (card! "Orders" #t "2026-02-01T00:00:00Z")
          older  (card! "Orders" #t "2026-01-01T00:00:00Z")
          model  (:id (ts/create! :model/Card :name "Orders" :type :model :collection_id (:id ops)
                                  :created_at #t "2026-03-01T00:00:00Z"))
          expect {older "collections/main/ops/orders.question.yaml"
                  newer "collections/main/ops/orders_2.question.yaml"
                  model "collections/main/ops/orders.model.yaml"}
          ctx!   #(storage.util/storage-context kind-layout/kind-layout)]
      (testing "the older card keeps the name; the newer one gets _2; another kind does not count"
        (let [ctx (ctx!)]
          (is (= expect (into {} (map (juxt identity (partial path-of ctx))) [older newer model])))))
      (testing "the order in which an export resolves the paths does not change them"
        (let [ctx (ctx!)]
          (is (= expect (into {} (map (juxt identity (partial path-of ctx))) [model newer older])))))
      (testing "one item at a time, as an incremental export resolves it, gives the same names"
        (is (= expect (into {} (map (juxt identity #(path-of (ctx!) %))) [newer older model]))))
      (testing "an archived card does not count"
        (t2/update! :model/Card older {:archived true})
        (is (= "collections/main/ops/orders.question.yaml" (path-of (ctx!) newer)))))))

(deftest dots-in-names-become-underscores-test
  (testing "a name cannot end in .<kind>, so a collection named like a contained-items folder does not clash with it"
    (mt/with-empty-h2-app-db!
      (let [ops     (ts/create! :model/Collection :name "Ops" :location "/")
            daily   (ts/create! :model/Dashboard :name "Daily" :collection_id (:id ops))
            clash   (ts/create! :model/Collection :name "daily.dashboard" :location (str "/" (:id ops) "/"))
            dotted  (ts/create! :model/Card :name "v1.2 totals.question" :collection_id (:id ops))
            ctx     (storage.util/storage-context kind-layout/kind-layout)
            path-of (fn [model instance]
                      (storage.util/entity-file-path ctx (serdes/extract-one model {} instance)))]
        (is (= "collections/main/ops/daily.dashboard.yaml"
               (storage.util/entity-file-path ctx {:serdes/meta   [{:model "Dashboard" :id (:entity_id daily)}]
                                                   :entity_id     (:entity_id daily)
                                                   :name          "Daily"
                                                   :collection_id (:entity_id ops)})))
        (is (= "collections/main/ops/daily_dashboard/collection.yaml" (path-of "Collection" clash)))
        (is (= "collections/main/ops/v1_2_totals_question.question.yaml" (path-of "Card" dotted)))))))

(deftest data-app-resources-are-in-the-apps-folder-test
  (testing "a data app's resources are in the app's own folder, also when its slug has a -, and its collection has no file"
    (mt/with-premium-features #{:data-apps}
      (mt/with-empty-h2-app-db!
        (let [app        (ts/create! :model/DataApp :name "sales-app" :display_name "Sales" :bundle_path "index.js"
                                     :bundle (.getBytes "B" "UTF-8"))
              collection (t2/select-one :model/Collection :id (:resource_collection_id app))
              ctx        (storage.util/storage-context kind-layout/kind-layout)
              app-path   (storage.util/entity-file-path ctx (serdes/extract-one "DataApp" {} app))
              coll-path  (storage.util/entity-file-path ctx (serdes/extract-one "Collection" {} collection))]
          (is (= "data_apps/sales-app/data_app.yaml" app-path))
          (is (nil? coll-path) "the app's collection has no file: data_app.yaml names it"))))))

(deftest collections-without-folders-do-not-take-numbers-test
  (testing "the Trash and the Library have no folder in collections/main/, so a collection of the same name is not _2"
    (mt/with-empty-h2-app-db!
      (collections/create-library-collection!)
      (let [trash   (ts/create! :model/Collection :name "Trash" :location "/")
            library (ts/create! :model/Collection :name "Library" :location "/")
            ctx     (storage.util/storage-context kind-layout/kind-layout)
            path-of #(storage.util/entity-file-path ctx (serdes/extract-one "Collection" {} %))]
        (is (= "collections/main/trash/collection.yaml" (path-of trash)))
        (is (= "collections/main/library/collection.yaml" (path-of library)))))))

(deftest other-namespaces-are-folders-under-collections-test
  (testing "a collection of another namespace than the default one is under collections/<namespace folder>/"
    (mt/with-premium-features #{:tenants}
      (mt/with-empty-h2-app-db!
        (mt/with-temporary-setting-values [use-tenants true]
          (let [shared (ts/create! :model/Collection :name "Partners" :location "/"
                                   :namespace :shared-tenant-collection)
                ctx    (storage.util/storage-context kind-layout/kind-layout)]
            (is (= "collections/shared_tenant_collection/partners/collection.yaml"
                   (storage.util/entity-file-path ctx (serdes/extract-one "Collection" {} shared))))))))
    (testing "there is no top-level folder per namespace"
      (is (not-any? kind-folders/top-level-folders ["analytics" "shared_tenant_collection" "tenant_specific"]))
      (is (not-any? ingest/legal-top-level-paths ["analytics" "shared_tenant_collection" "tenant_specific"])))))

(deftest field-values-are-one-file-per-column-test
  (testing "a column's field values are the file <column>.field_values.yaml in its table's folder"
    (mt/with-empty-h2-app-db!
      (let [db     (ts/create! :model/Database :name "My DB" :engine :postgres)
            table  (ts/create! :model/Table :name "customers" :schema "PUBLIC" :db_id (:id db))
            field  (ts/create! :model/Field :name "STATUS" :table_id (:id table) :base_type :type/Text)
            values (ts/create! :model/FieldValues :field_id (:id field) :type :full :values ["a" "b"])
            ctx    (storage.util/storage-context kind-layout/kind-layout)]
        (is (= "databases/my_db/public/customers.table/status.field_values.yaml"
               (storage.util/entity-file-path ctx (serdes/extract-one "FieldValues" {} values))))))))

(defn- table-world!
  "A database with two tables, `orders` and `products`: `orders` has settings, a column with settings, and a column
  remapped to a column of `products`. Returns the ids."
  []
  (let [db       (ts/create! :model/Database :name "Shop" :engine :postgres)
        orders   (ts/create! :model/Table :name "orders" :schema "PUBLIC" :db_id (:id db))
        products (ts/create! :model/Table :name "products" :schema "PUBLIC" :db_id (:id db))
        title    (ts/create! :model/Field :name "TITLE" :table_id (:id products) :base_type :type/Text :position 0)
        total    (ts/create! :model/Field :name "TOTAL" :table_id (:id orders) :base_type :type/Float :position 1)
        product  (ts/create! :model/Field :name "PRODUCT_ID" :table_id (:id orders) :base_type :type/Integer
                             :position 0)]
    (t2/insert! :model/TableUserSettings {:table_id (:id orders) :display_name "Shop orders"})
    (t2/insert! :model/FieldUserSettings {:field_id (:id total) :description "Total with tax"})
    (ts/create! :model/Dimension :field_id (:id product) :type :external :name "Product"
                :human_readable_field_id (:id title))
    {:orders (:id orders) :products (:id products) :title (:id title) :total (:id total) :product (:id product)}))

(deftest one-file-per-table-serdes-round-trip-test
  (testing "a serdes export in the kind layout writes one file per table, which loads back to the same rows"
    (ts/with-random-dump-dir [dump-dir "table-document-"]
      (ts/with-dbs [source-db dest-db]
        (ts/with-db source-db
          (table-world!)
          (storage/store! (extract-all) (storage.files/file-writer dump-dir kind-layout/kind-layout)))
        (let [orders-file (io/file dump-dir "databases" "shop" "public" "orders.table.yaml")
              document    (yaml/from-file orders-file)]
          (testing "the file holds the table's settings, then its columns in column order"
            (is (= "Shop orders" (:display_name document)))
            (is (= ["PRODUCT_ID" "TOTAL"] (map :name (:columns document))))
            (is (=? {:name      "PRODUCT_ID"
                     :remapping {:type "external" :human_readable_field_id ["Shop" "PUBLIC" "products" "TITLE"]}
                     :metadata  {:base_type "type/Integer"}}
                    (first (:columns document))))
            (is (=? {:name "TOTAL" :description "Total with tax" :metadata {:base_type "type/Float"}}
                    (second (:columns document))))
            (is (=? {:name "orders" :db_id "Shop"} (:metadata document)) "a serdes export adds the schema"))
          (testing "no file for a column, its settings or its remapping"
            (is (not (.exists (io/file dump-dir "databases" "shop" "public" "orders.table")))))
          (testing "the files load into an empty instance, the remapping across two tables included"
            (ts/with-db dest-db
              (is (serdes/with-cache (serdes.load/load-metabase! (ingest/ingest-yaml dump-dir))))
              (let [table-id (t2/select-one-pk :model/Table :name "orders")
                    field-id (fn [table field] (t2/select-one-pk :model/Field :name field
                                                                 :table_id (t2/select-one-pk :model/Table :name table)))]
                (is (= "Shop orders" (t2/select-one-fn :display_name :model/TableUserSettings :table_id table-id)))
                (is (= "Total with tax" (t2/select-one-fn :description :model/FieldUserSettings
                                                          :field_id (field-id "orders" "TOTAL"))))
                (is (=? {:type :external :human_readable_field_id (field-id "products" "TITLE")}
                        (t2/select-one :model/Dimension :field_id (field-id "orders" "PRODUCT_ID"))))))))))))

(deftest ai-context-in-its-items-folder-test
  (testing "a serdes export in the kind layout writes AI context in its item's folder; the old flat folder still loads"
    (doseq [[layout expected-file] [[kind-layout/kind-layout ["databases" "shop" "public" "orders.table" "ai_context.yaml"]]
                                    [storage.util/storage-path-layout ["osi_ai_context"]]]]
      (testing (str expected-file)
        (ts/with-random-dump-dir [dump-dir "ai-context-"]
          (ts/with-dbs [source-db dest-db]
            (ts/with-db source-db
              (let [{:keys [orders]} (table-world!)]
                (t2/insert! :model/OsiAiContext {:entity_type "table" :entity_local_id orders
                                                 :ai_context {:instructions "One row per order"}}))
              ;; a serdes export extracts AI context only with its item, in the kind layout; an earlier export wrote
              ;; each one to the flat osi_ai_context/ folder
              (storage/store! (cond-> (extract-all)
                                (= layout storage.util/storage-path-layout)
                                (conj (serdes/extract-one "OsiAiContext" {} (t2/select-one :model/OsiAiContext))))
                              (storage.files/file-writer dump-dir layout)))
            (is (.exists ^java.io.File (apply io/file dump-dir expected-file)))
            (ts/with-db dest-db
              (is (serdes/with-cache (serdes.load/load-metabase! (ingest/ingest-yaml dump-dir))))
              (is (= {:instructions "One row per order"}
                     (t2/select-one-fn :ai_context :model/OsiAiContext :entity_type "table"
                                       :entity_local_id (t2/select-one-pk :model/Table :name "orders")))))))))))

(deftest kind-layout-is-the-default-test
  (testing "plain serdes export writes the kind layout"
    (ts/with-random-dump-dir [dump-dir "default-layout-"]
      (ts/with-dbs [source-db]
        (ts/with-db source-db
          (mt/with-temp [:model/Collection {coll-id :id} {:name "Shop"}
                         :model/Card       _             {:name "Orders" :collection_id coll-id}]
            (storage/store! (extract-all) (storage.files/file-writer dump-dir))))
        (is (.exists (io/file dump-dir "collections" "main" "shop" "orders.question.yaml"))))))
  (testing "a storage context names its layout"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"names no layout"
                          (storage.util/entity-file-path (serdes/storage-base-context)
                                                         {:serdes/meta [{:model "Card" :id "A"}] :name "A"})))))

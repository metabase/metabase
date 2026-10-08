(ns metabase-enterprise.data-apps.serialization-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase-enterprise.data-apps.serialization :as apps.serialization]
   [metabase-enterprise.data-apps.test-util :as data-apps.tu]
   [metabase-enterprise.serialization.core :as serialization]
   [metabase-enterprise.serialization.test-util :as ts]
   [metabase-enterprise.serialization.v2.extract :as extract]
   [metabase.actions.core :as actions]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.malli.fn :as mu.fn]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- insert-app! [& {:as extra}]
  (t2/insert-returning-instance! :model/DataApp
                                 (merge {:name          "sales-ops"
                                         :display_name  "Sales Ops"
                                         :bundle_path   "dist/index.js"
                                         :bundle        (.getBytes "console.log(1)" "UTF-8")
                                         :allowed_hosts ["https://api.example.com"]}
                                        extra)))

(defn- export!
  "Export the data apps, with the collection each owns (its serdes descendant) when `with-collections?`."
  [dir & {:keys [with-collections?]}]
  (serialization/store! (if with-collections?
                          (extract/extract {:targets        (mapv (fn [id] ["DataApp" id])
                                                                  (t2/select-pks-vec :model/DataApp))
                                            :no-settings    true
                                            :no-data-model  true})
                          (serdes/extract-all "DataApp" {}))
                        (serialization/file-writer dir)))

(defn- import! [dir]
  (serialization/load-metabase! (serialization/ingest-yaml dir)))

(defn- bundle-text [app]
  (String. ^bytes (t2/select-one-fn :bundle [:model/DataApp :bundle] :id (:id app)) "UTF-8"))

(defn- write-app-files!
  "Write a serialized data app with `yaml` fields and the `files` next to it under `data_apps/<dir>/`."
  [dump-dir dir yaml-fields files]
  (let [app-dir (io/file dump-dir "data_apps" dir)]
    (.mkdirs app-dir)
    (spit (io/file app-dir "data_app.yaml") (yaml/generate-string yaml-fields))
    (doseq [[path content] files
            :let [f (io/file app-dir ^String path)]]
      (io/make-parents f)
      (spit f content))))

(defn- app-yaml [entity-id slug & {:as extra}]
  (merge {:serdes/meta [{:model "DataApp" :id entity-id :label slug}]
          :entity_id   entity-id
          :slug        slug
          :name        "Sales"
          :path        "dist/index.js"}
         extra))

(deftest export-writes-the-manifest-and-the-bundle-file-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (ts/with-random-dump-dir [dump-dir "data-app-export-"]
      (let [app (insert-app! :description "Pipeline health")]
        (export! dump-dir)
        (testing "the manifest is a serdes YAML in the app's directory, keyed like a hand-written data_app.yaml"
          (is (= {:serdes/meta   [{:model "DataApp"}]
                  :entity_id     (:entity_id app)
                  :slug          "sales-ops"
                  :name          "Sales Ops"
                  :description   "Pipeline health"
                  :path          "dist/index.js"
                  :allowed_hosts ["https://api.example.com"]
                  :collection    (t2/select-one-fn :entity_id :model/Collection :id (:resource_collection_id app))}
                 (dissoc (yaml/from-file (io/file dump-dir "data_apps" "sales-ops" "data_app.yaml"))
                         :created_at))))
        (testing "the bundle is a plain file at its path next to the manifest"
          (is (= "console.log(1)"
                 (slurp (io/file dump-dir "data_apps" "sales-ops" "dist" "index.js")))))))))

(deftest round-trip-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (ts/with-random-dump-dir [dump-dir "data-app-round-trip-"]
        (let [app                  (insert-app!)
              collection-entity-id (t2/select-one-fn :entity_id :model/Collection :id (:resource_collection_id app))]
          (export! dump-dir :with-collections? true)
          (testing "the app's collection is exported with it, like any collection"
            (is (= [collection-entity-id]
                   (->> (file-seq (io/file dump-dir "collections"))
                        (filter #(.isFile ^java.io.File %))
                        (map (comp :entity_id yaml/from-file))))))
          (t2/delete! :model/DataApp (:id app))
          (import! dump-dir)
          (let [imported (t2/select-one :model/DataApp :entity_id (:entity_id app))]
            (is (=? {:name          "sales-ops"
                     :display_name  "Sales Ops"
                     :bundle_path   "dist/index.js"
                     :bundle_hash   (:bundle_hash app)
                     :allowed_hosts ["https://api.example.com"]}
                    imported))
            (is (= "console.log(1)" (bundle-text imported)))
            (testing "the import links the collection the manifest names and creates the permission group"
              (is (=? {:entity_id collection-entity-id :namespace :data-apps}
                      (t2/select-one :model/Collection :id (:resource_collection_id imported))))
              (is (t2/exists? :model/PermissionsGroup :id (:permission_group_id imported))))))))))

(deftest import-refuses-a-manifest-that-names-another-collection-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (ts/with-random-dump-dir [dump-dir "data-app-switch-"]
        (mt/with-temp [:model/Collection {other-entity-id :entity_id} {:name "Other" :namespace :data-apps}]
          (let [app (insert-app!)]
            (write-app-files! dump-dir "sales-ops" (app-yaml (:entity_id app) "sales-ops" :collection other-entity-id)
                              {"dist/index.js" "B"})
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Failed to load" (import! dump-dir)))
            (is (= (:resource_collection_id app)
                   (t2/select-one-fn :resource_collection_id :model/DataApp :id (:id app))))))))))

(deftest import-refuses-a-manifest-naming-a-collection-the-repository-lacks-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (ts/with-random-dump-dir [dump-dir "data-app-no-collection-"]
        (write-app-files! dump-dir "x" (app-yaml "pZrj7PDuz3vSWYYi0QFhd" "x" :collection "nosuchcollection00001")
                          {"dist/index.js" "B"})
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Collection 'nosuchcollection00001' was not found"
                              (import! dump-dir)))
        (is (not (t2/exists? :model/DataApp :entity_id "pZrj7PDuz3vSWYYi0QFhd")))))))

(deftest import-updates-in-place-and-keeps-local-state-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (ts/with-random-dump-dir [dump-dir "data-app-update-"]
        (let [app (insert-app! :enabled false)]
          (write-app-files! dump-dir "sales-ops" (app-yaml (:entity_id app) "sales-ops" :name "Renamed"
                                                           :path "./dist/index.js")
                            {"dist/index.js" "console.log(2)"})
          (import! dump-dir)
          (let [updated (t2/select-one :model/DataApp :id (:id app))]
            (is (=? {:display_name           "Renamed"
                     :enabled                false
                     :resource_collection_id (:resource_collection_id app)
                     :permission_group_id    (:permission_group_id app)}
                    updated))
            (is (= "console.log(2)" (bundle-text updated)))
            (is (not= (:bundle_hash app) (:bundle_hash updated)))))))))

(deftest import-rejects-invalid-apps-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (testing "a missing bundle file"
        (ts/with-random-dump-dir [dump-dir "data-app-missing-"]
          (write-app-files! dump-dir "x" (app-yaml "pZrj7PDuz3vSWYYi0QFhd" "x") {})
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Failed to load"
                                (import! dump-dir)))))
      (testing "a manifest field that fails validation"
        (ts/with-random-dump-dir [dump-dir "data-app-invalid-"]
          (write-app-files! dump-dir "x" (app-yaml "pZrj7PDuz3vSWYYi0QFhd" "Not A Slug")
                            {"dist/index.js" "BUNDLE"})
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Failed to load"
                                (import! dump-dir)))))
      (testing "a bundle path leaving the app's directory is never read"
        (ts/with-random-dump-dir [dump-dir "data-app-traversal-"]
          (write-app-files! dump-dir "x" (app-yaml "pZrj7PDuz3vSWYYi0QFhd" "x" :path "../../secret.js") {})
          (is (= "Invalid resource file path: ../../secret.js"
                 (try
                   (serialization/ingest-one (serialization/ingest-yaml dump-dir)
                                             [{:model "DataApp" :id "pZrj7PDuz3vSWYYi0QFhd"}])
                   nil
                   (catch clojure.lang.ExceptionInfo e
                     (ex-message (ex-cause e))))))))
      (is (not (t2/exists? :model/DataApp))))))

(deftest import-clears-an-omitted-description-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (ts/with-random-dump-dir [dump-dir "data-app-description-"]
        (let [app (insert-app! :description "Pipeline health")]
          (write-app-files! dump-dir "sales-ops" (app-yaml (:entity_id app) "sales-ops") {"dist/index.js" "B"})
          (import! dump-dir)
          (is (nil? (t2/select-one-fn :description :model/DataApp :id (:id app)))))))))

(deftest import-does-not-take-over-an-app-made-on-the-instance-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (ts/with-random-dump-dir [dump-dir "data-app-takeover-"]
        (let [app (insert-app!)]
          (write-app-files! dump-dir "sales-ops" (app-yaml "Ld3cXiYs9n8HP3q3FvC7R" "sales-ops") {"dist/index.js" "B"})
          (let [e (try (import! dump-dir) nil (catch clojure.lang.ExceptionInfo e e))]
            (is (re-find #"Failed to load" (ex-message e)))
            (testing "the pull says what to do, rather than failing on the slug's unique index"
              (is (re-find #"named \"sales-ops\" already exists on this instance"
                           (ex-message (ex-cause e))))))
          (is (=? {:entity_id (:entity_id app)} (t2/select-one :model/DataApp :id (:id app)))))))))

(deftest export-includes-data-apps-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (let [app (insert-app!)]
      (is (some #(= [{:model "DataApp" :id (:entity_id app)}] (map (fn [m] (dissoc m :label)) (:serdes/meta %)))
                (into [] (extract/extract {:no-collections true :no-data-model true :no-settings true})))))))

(deftest round-trip-with-resources-test
  (testing "an app travels with its collection and what that holds, written under collections/data_apps/"
    (mt/with-premium-features #{:data-apps}
      (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup :model/Card :model/Action]
        (ts/with-random-dump-dir [dump-dir "data-app-resources-"]
          (let [app           (insert-app!)
                collection-id (:resource_collection_id app)
                mp            (mt/metadata-provider)
                query         (lib/query mp (lib.metadata/table mp (mt/id :venues)))]
            (mt/with-temp [:model/Card {question-eid :entity_id} {:name "Venues list" :type :question
                                                                  :collection_id collection-id :dataset_query query}]
              (let [action-id  (actions/insert! {:name          "Rename venue"
                                                 :type          :query
                                                 :collection_id collection-id
                                                 :database_id   (mt/id)
                                                 :dataset_query (lib/native-query mp "UPDATE venues SET name = 'x'")})
                    action-eid (t2/select-one-fn :entity_id :model/Action :id action-id)]
                (export! dump-dir :with-collections? true)
                (testing "the files sit under the collection's directory of the data-apps namespace"
                  (doseq [path ["data_app__sales_ops.yaml" "data_app__sales_ops/venues_list.yaml"
                                "data_app__sales_ops/rename_venue.yaml"]]
                    (is (.exists (io/file dump-dir "collections" "data_apps" path)) path)))
                (t2/delete! :model/DataApp (:id app))
                (is (not (t2/exists? :model/Card :entity_id question-eid)) "deleting the app deletes its collection's cards")
                (import! dump-dir)
                (let [imported      (t2/select-one :model/DataApp :entity_id (:entity_id app))
                      collection-id (:resource_collection_id imported)]
                  (is (pos-int? collection-id))
                  (is (= collection-id (t2/select-one-fn :collection_id :model/Card :entity_id question-eid)))
                  (is (= collection-id (t2/select-one-fn :collection_id :model/Action :entity_id action-eid))))))))))))

(def ^:private app-collection "appCollectionEntity01")

(def ^:private other-collection "otherCollectionEnt001")

(defn- do-with-collections!
  "Call `f` with the collections `app-collection` and `other-collection` in place."
  [f]
  (mt/with-temp [:model/Collection _ {:entity_id app-collection :name "App collection" :namespace "data-apps"}
                 :model/Collection _ {:entity_id other-collection :name "Other collection" :namespace "data-apps"}]
    (f)))

(defn- query-item
  "A query to serialize named `query-name`, in `app-collection` with a fresh entity ID unless `extra` says otherwise."
  [query-name definition & {:as extra}]
  (merge {:name query-name :query definition :entity_id (u/generate-nano-id) :collection_id app-collection} extra))

(defn- action-item
  "An action to serialize, in `app-collection` with a fresh entity ID unless `action` is a map saying otherwise."
  [action]
  (merge {:entity_id (u/generate-nano-id) :collection_id app-collection}
         (if (map? action) action {:action_id action})))

(defn- request-body [{:keys [queries actions]}]
  {:queries (vec queries) :actions (mapv action-item actions)})

(defn- serialize!
  "Serialize `body` as `user` over HTTP, with the collections in place."
  ([user status body]
   (serialize! user status body #{:data-apps}))
  ([user status body features]
   (do-with-collections!
    (fn []
      (mt/with-premium-features features
        (mt/user-http-request user :post status "apps/serialize" (request-body body)))))))

(defn- serialize-directly!
  "Serialize `body` as a superuser by calling the function, for a test that redefines what runs on the request thread,
  with the types of its definitions as keywords, as the endpoint hands them over."
  [body]
  (do-with-collections!
   (fn []
     (mt/with-premium-features #{:data-apps}
       (mt/with-current-user (mt/user->id :crowberto)
         (apps.serialization/serialize
          (walk/postwalk #(cond-> % (and (map? %) (string? (:type %))) (update :type keyword))
                         (request-body body))))))))

(defn- file-entity
  "The entity a serialization `file` holds."
  [{:keys [yaml]}]
  (yaml/parse-string yaml))

(defn- db-name []
  (t2/select-one-fn :name :model/Database (mt/id)))

(defn- table-path [table]
  [(db-name) "PUBLIC" table])

(defn- field-path [table field]
  [(db-name) "PUBLIC" table field])

(defn- venues-column [field-name & {:as extra}]
  (merge {:type "column" :name field-name :tableId (mt/id :venues) :sourceName "VENUES"} extra))

(defn- venues-definition [& {:as stage}]
  {:stages [(merge {:source {:type "table" :id (mt/id :venues)}} stage)]})

(defn- metric-count-definition [metric-id]
  (venues-definition :aggregations [{:type "metric" :id metric-id}]))

(deftest serialization-needs-each-items-entity-id-name-and-collection-test
  (testing "the saved question is written with the given entity ID, name and collection, so every query names them"
    (mt/with-premium-features #{:data-apps}
      (doseq [missing [:name :entity_id :collection_id]]
        (testing (pr-str missing)
          (is (=? {:errors {:queries some?}}
                  (mt/user-http-request :crowberto :post 400 "apps/serialize"
                                        {:queries [(dissoc (query-item "Venues" (venues-definition)) missing)]
                                         :actions []}))))))))

(deftest serialization-needs-each-actions-entity-id-and-collection-test
  (mt/with-premium-features #{:data-apps}
    (doseq [missing [:entity_id :collection_id]]
      (testing (pr-str missing)
        (is (=? {:errors {:actions some?}}
                (mt/user-http-request :crowberto :post 400 "apps/serialize"
                                      {:queries []
                                       :actions [(dissoc (action-item 1) missing)]})))))))

(deftest refuses-a-collection-that-does-not-exist-test
  (data-apps.tu/do-with-sources!
   (fn [{:keys [action-id]}]
     (is (=? {:queries [{:error "Collection noSuchCollectionEnt01 does not exist on this instance."}
                        {:path string?}]
              :actions [{:error "Collection noSuchCollectionEnt01 does not exist on this instance."}]}
             (serialize! :crowberto 200
                         {:queries [(query-item "Gone" (venues-definition) :collection_id "noSuchCollectionEnt01")
                                    (query-item "Here" (venues-definition))]
                          :actions [{:action_id action-id :collection_id "noSuchCollectionEnt01"}]}))))))

(deftest serializes-a-query-with-every-reference-portable-test
  (let [response (serialize! :crowberto 200
                             {:queries [(query-item "PriceByCategory"
                                                    (venues-definition
                                                     :filters      [{:type "operator" :operator ">"
                                                                     :args [(venues-column "PRICE")
                                                                            {:type "literal" :value 1}]}]
                                                     :aggregations [{:type "operator" :operator "sum" :name "total"
                                                                     :args [(venues-column "PRICE")]}]
                                                     :breakouts    [{:type          "column"
                                                                     :name          "NAME"
                                                                     :sourceName    "CATEGORIES"
                                                                     :sourceFieldId (mt/id :venues :category_id)}]
                                                     :orderBys     [{:type      "column"
                                                                     :name      "total"
                                                                     :direction "desc"}]
                                                     :limit        5))]})
        entity   (file-entity (first (:queries response)))]
    (testing "the query Metabase builds from the definition, referencing tables and fields by name"
      (let [price       (field-path "VENUES" "PRICE")
            category-id (field-path "VENUES" "CATEGORY_ID")
            category    (field-path "CATEGORIES" "NAME")]
        (is (=? {:dataset_query {:lib/type "mbql/query"
                                 :database (db-name)
                                 :stages   [{:source-table (table-path "VENUES")
                                             :filters      [[">" {} ["field" {} price] 1]]
                                             :aggregation  [["sum" {:name "total"} ["field" {} price]]]
                                             :breakout     [["field" {:source-field category-id} category]]
                                             :order-by     [["desc" {} ["aggregation"
                                                                        {:lib/source-name "total"}
                                                                        string?]]]
                                             :limit        5}]}}
                entity))
        (is (empty? (:metrics response)))))
    (testing "only the uuid the order by points at is kept, and it is the aggregation's"
      (let [stage (-> entity :dataset_query :stages first)]
        (is (= (get-in stage [:aggregation 0 1 :lib/uuid])
               (get-in stage [:order-by 0 2 2])))
        (is (nil? (get-in stage [:filters 0 1 :lib/uuid])))))))

(deftest only-a-superuser-serializes-test
  (testing "an app's resources are written into its repository, which only an admin works with"
    (let [body {:queries [(query-item "Venues" (venues-definition))]}]
      (is (= "You don't have permissions to do that." (serialize! :rasta 403 body)))
      (is (=? {:queries [{:path string? :yaml string?}]} (serialize! :crowberto 200 body))))))

(deftest lists-the-metrics-a-query-aggregates-test
  (data-apps.tu/do-with-sources!
   (fn [{:keys [metric-id]}]
     (let [metric-eid (t2/select-one-fn :entity_id :model/Card :id metric-id)
           response   (serialize! :crowberto 200
                                  {:queries [(query-item "VenueCount" (metric-count-definition metric-id))]})
           metric     (file-entity (first (:metrics response)))
           question   (file-entity (first (:queries response)))]
       (is (= 1 (count (:metrics response))))
       (is (=? {:type          "metric"
                :collection_id app-collection
                :dataset_query {:stages [{:source-table (table-path "VENUES")}]}}
               metric))
       (testing "the copy has its own entity ID, and the question reads the copy rather than the source metric"
         (is (not= metric-eid (:entity_id metric)))
         (is (= (:entity_id metric) (get-in question [:dataset_query :stages 0 :aggregation 0 2])))
         (is (not= metric-eid (get-in question [:dataset_query :stages 0 :aggregation 0 2]))))
       (testing "the copy's entity ID is the same every time"
         (is (= (:entity_id metric)
                (-> (serialize! :crowberto 200 {:queries [(query-item "VenueCount" (metric-count-definition metric-id))]})
                    :metrics first file-entity :entity_id))))))))

(deftest copies-a-metric-once-per-collection-test
  (data-apps.tu/do-with-sources!
   (fn [{:keys [metric-id]}]
     (let [definition (metric-count-definition metric-id)
           response   (serialize! :crowberto 200
                                  {:queries [(query-item "A" definition)
                                             (query-item "B" definition)
                                             (query-item "C" definition :collection_id other-collection)]})
           metrics    (mapv file-entity (:metrics response))
           references (mapv #(get-in (file-entity %) [:dataset_query :stages 0 :aggregation 0 2]) (:queries response))]
       (is (= 2 (count metrics)))
       (is (= #{app-collection other-collection} (set (map :collection_id metrics))))
       (is (apply distinct? (map :entity_id metrics)))
       (is (= (first references) (second references)))
       (is (= (set references) (set (map :entity_id metrics))))))))

(deftest answers-each-query-on-its-own-test
  (let [response (serialize! :crowberto 200
                             {:queries [(query-item "Venues" (venues-definition))
                                        (query-item "Broken" (venues-definition :fields [(venues-column "NOT_A_COLUMN")]))]})]
    (is (=? [{:path string? :yaml string?} {:error "No column found"}]
            (:queries response)))
    (is (=? {:dataset_query {:stages [{:source-table (table-path "VENUES")}]}}
            (file-entity (first (:queries response)))))))

(deftest serializes-a-query-action-test
  (data-apps.tu/do-with-sources!
   (fn [{:keys [action-id]}]
     (let [response (serialize! :crowberto 200 {:actions [{:action_id action-id :entity_id "actionCopyEntity00001"}]})
           entity   (file-entity (first (:actions response)))]
       (is (=? {:entity_id     "actionCopyEntity00001"
                :collection_id app-collection
                :type          "query"
                :query         [{:database_id   (db-name)
                                 :dataset_query {:database (db-name)}}]}
               entity))
       (is (not (contains? entity :model_id))
           "it names no model")))))

(deftest refuses-an-action-that-belongs-to-a-model-test
  (testing "a data app runs only actions that belong to no model, as the typed schema lists only those"
    (data-apps.tu/do-with-sources!
     (fn [{:keys [model-action-id]}]
       (is (=? {:actions [{:error #"Action \d+ belongs to a model\..*"}]}
               (serialize! :crowberto 200 {:actions [model-action-id]})))))))

(deftest refuses-what-a-copy-cannot-hold-test
  (data-apps.tu/do-with-sources!
   (fn [{:keys [metric-id model-id]}]
     (let [mp          (mt/metadata-provider)
           model-count (lib/aggregate (lib/query mp (lib.metadata/card mp model-id)) (lib/count))]
       (mt/with-temp [:model/Card {reading-metric-id :id} {:name          "Metric reading a model"
                                                           :type          :metric
                                                           :database_id   (mt/id)
                                                           :dataset_query model-count}]
         (let [card-sql-id (actions/insert! {:name          "Read a card"
                                             :type          :query
                                             :database_id   (mt/id)
                                             :dataset_query (lib/native-query
                                                             mp (str "SELECT * FROM {{#" metric-id "}}"))})
               response    (serialize! :crowberto 200
                                       {:queries [(query-item "ReadsMetric" (metric-count-definition reading-metric-id))]
                                        :actions [card-sql-id Integer/MAX_VALUE]})]
           (testing "a query action whose SQL reads a card"
             (is (=? {:error (re-pattern (str ".*reads card " metric-id ".*"))}
                     (nth (:actions response) 0))))
           (testing "an action that does not exist"
             (is (=? {:error #".*does not exist.*"} (nth (:actions response) 1))))
           (testing "a metric that reads a card; the query that aggregates it is still built"
             (is (=? {:queries [{:path string?}]
                      :metrics [{:error (re-pattern (str ".*reads card " model-id ".*"))}]}
                     response)))))))))

(deftest rejects-unsupported-definitions-test
  (testing "the request accepts only what data app definitions support"
    (doseq [path [[:queries 0 :query :stages 0 :joins]
                  [:queries 0 :query :stages 0 :expressions]]]
      (testing (pr-str path)
        (do-with-collections!
         (fn []
           (mt/with-premium-features #{:data-apps}
             (mt/user-http-request :crowberto :post 400 "apps/serialize"
                                   (assoc-in {:queries [(query-item "Venues" (venues-definition))] :actions []}
                                             path [])))))))))

(deftest refuses-a-table-that-does-not-exist-test
  (is (=? {:queries [{:error (str "Table " Integer/MAX_VALUE " does not exist.")}]}
          (serialize! :crowberto 200
                      {:queries [(query-item "Nothing" {:stages [{:source {:type "table" :id Integer/MAX_VALUE}}]})]})))
  (testing "a deactivated table is gone too, as it is from the typed schema"
    (mt/with-temp [:model/Table {table-id :id} {:db_id (mt/id) :active false}]
      (is (=? {:queries [{:error (str "Table " table-id " does not exist.")}]}
              (serialize! :crowberto 200
                          {:queries [(query-item "Gone" {:stages [{:source {:type "table" :id table-id}}]})]}))))))

(deftest refuses-a-column-that-reaches-a-deactivated-table-test
  (testing "types generated before categories was deactivated still select its name through venues.category_id, and
            the query would fail on the implicit join when it runs"
    (mt/with-temp-vals-in-db :model/Table (mt/id :categories) {:active false}
      (is (=? {:queries [{:error (str "Table " (mt/id :categories) " does not exist.")}]}
              (serialize! :crowberto 200
                          {:queries [(query-item "VenueCategories"
                                                 (venues-definition
                                                  :fields [{:type "column" :name "NAME"
                                                            :sourceFieldId (mt/id :venues :category_id)}]))]}))))))

(deftest refuses-a-metric-that-reaches-a-deactivated-table-test
  (testing "a metric the query aggregates reads categories through venues.category_id in its own query, which the
            built query holds only the ID of, and the query would fail on the table when it runs"
    (let [mp         (mt/metadata-provider)
          venues     (lib/query mp (lib.metadata/table mp (mt/id :venues)))
          categories (mt/id :categories)
          category   (m/find-first (comp #{(mt/id :categories :name)} :id) (lib/filterable-columns venues))]
      (mt/with-temp [:model/Card {bars-id :id}  {:name          "Bars"
                                                 :type          :metric
                                                 :database_id   (mt/id)
                                                 :dataset_query (-> venues
                                                                    (lib/filter (lib/= category "Bar"))
                                                                    (lib/aggregate (lib/count)))}
                     :model/Card {count-id :id} {:name          "Venue count"
                                                 :type          :metric
                                                 :database_id   (mt/id)
                                                 :dataset_query (lib/aggregate venues (lib/count))}]
        (mt/with-temp-vals-in-db :model/Table categories {:active false}
          (is (=? {:queries [{:error (str "Table " categories " does not exist.")}
                             {:path string?}]
                   :metrics [{:path string?}]}
                  (serialize! :crowberto 200
                              {:queries [(query-item "BarCount" (metric-count-definition bars-id))
                                         (query-item "VenueCount" (metric-count-definition count-id))]}))))))))

(deftest refuses-a-column-remapped-to-a-deactivated-table-test
  (testing "venues.category_id displays categories.name, a join the query processor adds only when the query runs, so
            the built query never names categories"
    (let [categories (mt/id :categories)]
      (mt/with-column-remappings [venues.category_id categories.name]
        (mt/with-temp-vals-in-db :model/Table categories {:active false}
          (is (=? {:queries [{:error (str "Table " categories " does not exist.")}
                             {:path string?}]}
                  (serialize! :crowberto 200
                              {:queries [(query-item "VenueCategoryIds"
                                                     (venues-definition :fields [{:type "column" :name "CATEGORY_ID"}]))
                                         (query-item "VenuePrices"
                                                     (venues-definition :fields [{:type "column" :name "PRICE"}]))]}))))))))

(deftest refuses-a-definition-that-builds-an-invalid-query-test
  (testing "the request schema accepts what a type lets through, and lib's own checks are off in production, so the
            built query is checked: an invalid one must not serialize and then fail when it runs"
    (binding [mu.fn/*enforce* false]
      (is (=? {:queries [{:error "The definition does not build a valid query."}
                         {:path string?}]}
              (serialize-directly!
               {:queries [(query-item "Half" {:stages [{:source {:type :table :id (mt/id :venues)} :limit 1.5}]})
                          (query-item "Whole" {:stages [{:source {:type :table :id (mt/id :venues)} :limit 2}]})]}))))))

(deftest a-public-source-serializes-as-the-private-copy-the-author-writes-test
  (testing "what makes a source public or embedded is left out, since the pull refuses a copy that says it is"
    (data-apps.tu/do-with-sources!
     (fn [{:keys [metric-id action-id]}]
       (t2/update! :model/Card :id metric-id {:public_uuid       (str (random-uuid))
                                              :made_public_by_id (mt/user->id :crowberto)
                                              :enable_embedding  true
                                              :embedding_params  {}})
       (t2/update! :model/Action :id action-id {:public_uuid       (str (random-uuid))
                                                :made_public_by_id (mt/user->id :crowberto)})
       (let [{:keys [actions metrics] :as response}
             (serialize! :crowberto 200
                         {:queries [(query-item "VenueCount" (metric-count-definition metric-id))]
                          :actions [action-id]})]
         (is (=? {:actions [{:path string?}] :metrics [{:path string?}]} response))
         (doseq [file (concat actions metrics)]
           (is (not-any? (partial contains? (file-entity file))
                         [:public_uuid :made_public_by_id :enable_embedding :embedding_params :embedding_type]))))))))

(deftest an-item-serialization-cannot-extract-answers-with-the-cause-test
  (testing "one entity that fails inside its extraction comes back with the reason, which serialization wraps at each
            level, and the rest still serialize"
    (data-apps.tu/do-with-sources!
     (fn [{:keys [metric-id action-id]}]
       (t2/update! :model/Card :id metric-id {:visualization_settings {:broken true}})
       (let [export-settings (mt/original-fn #'serdes/export-visualization-settings)]
         (mt/with-dynamic-fn-redefs [serdes/export-visualization-settings (fn [settings]
                                                                            (if (:broken settings)
                                                                              (throw (ex-info "the metric is broken" {}))
                                                                              (export-settings settings)))]
           (is (=? {:queries [{:path string?}]
                    :actions [{:path string?}]
                    :metrics [{:error (str "Could not serialize Metric " metric-id ": the metric is broken")}]}
                   (serialize-directly!
                    {:queries [(query-item "VenueCount" (metric-count-definition metric-id))]
                     :actions [action-id]})))))))))

(deftest an-item-serialization-leaves-out-answers-without-a-reason-test
  (testing "a card materialized by an exploration Summary is one serialization leaves out without an error"
    (data-apps.tu/do-with-sources!
     (fn [{:keys [metric-id]}]
       (mt/with-temp [:model/Exploration {exploration-id :id} {:name "Explo" :creator_id (mt/user->id :crowberto)}
                      :model/Document    {summary-id :id}     {:name           "Summary"
                                                               :creator_id     (mt/user->id :crowberto)
                                                               :exploration_id exploration-id}]
         (t2/update! :model/Card :id metric-id {:document_id summary-id})
         (is (=? {:metrics [{:error (str "Could not serialize Metric " metric-id ".")}]}
                 (serialize! :crowberto 200
                             {:queries [(query-item "VenueCount" (metric-count-definition metric-id))]}))))))))

(deftest a-failure-of-the-serialization-is-logged-and-a-refusal-is-not-test
  (testing "a refusal is the author's to act on; anything else is a failure the server keeps a trace of"
    (mt/with-log-messages-for-level [messages [metabase-enterprise.data-apps.serialization :warn]]
      (is (=? {:queries [{:error "No column found"}
                         {:error (str "Table " Integer/MAX_VALUE " does not exist.")}]}
              (serialize-directly!
               {:queries [(query-item "Broken"
                                      {:stages [{:source {:type :table :id (mt/id :venues)}
                                                 :fields [{:type :column :name "NOT_A_COLUMN"}]}]})
                          (query-item "Nothing" {:stages [{:source {:type :table :id Integer/MAX_VALUE}}]})]})))
      (let [logged (filter #(str/includes? (:message %) "Could not serialize a data app resource") (messages))]
        (is (= 1 (count logged)))
        (is (str/includes? (:message (first logged)) "Broken"))))))

(deftest refuses-archived-sources-test
  (testing "the pull refuses an archived resource, so the serialization refuses an archived source"
    (data-apps.tu/do-with-sources!
     (fn [{:keys [action-id]}]
       (t2/update! :model/Action :id action-id {:archived true})
       (is (=? {:actions [{:error #".*is archived.*"}]}
               (serialize! :crowberto 200 {:actions [action-id]})))))))

(deftest refuses-an-action-whose-parameter-values-come-from-a-card-test
  (data-apps.tu/do-with-sources!
   (fn [{:keys [metric-id]}]
     (let [mp        (mt/metadata-provider)
           action-id (actions/insert! {:name          "Pick"
                                       :type          :query
                                       :database_id   (mt/id)
                                       :dataset_query (lib/native-query mp "UPDATE venues SET name = {{name}}")
                                       :parameters    [{:id "name" :slug "name" :type :string/=
                                                        :values_source_type   :card
                                                        :values_source_config {:card_id metric-id}}]})]
       (is (=? {:actions [{:error (re-pattern (str ".*reads card " metric-id ".*"))}]}
               (serialize! :crowberto 200 {:actions [action-id]})))))))

(deftest serializes-a-segment-reference-by-entity-id-test
  (let [mp (mt/metadata-provider)]
    (mt/with-temp [:model/Segment {segment-id :id, segment-eid :entity_id}
                   {:name       "Cheap"
                    :table_id   (mt/id :venues)
                    :definition (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                    (lib/filter (lib/< (lib.metadata/field mp (mt/id :venues :price)) 3)))}]
      (is (=? {:dataset_query {:stages [{:filters [["segment" {} segment-eid]]}]}}
              (-> (serialize! :crowberto 200
                              {:queries [(query-item "Cheap"
                                                     (venues-definition :filters [{:type "segment" :id segment-id}]))]})
                  :queries first file-entity))))))

(deftest refuses-sources-on-a-routing-destination-test
  (testing "a routing destination is reachable only through its router, so the typed schema leaves out what it backs,
            and so does the serialization"
    (mt/with-temp [:model/Database {router-id :id} {}
                   :model/DatabaseRouter _ {:database_id router-id :user_attribute "region"}
                   :model/Database {destination-id :id} {:router_database_id router-id}]
      (let [action-id (actions/insert! {:name          "Rename venue"
                                        :type          :query
                                        :database_id   destination-id
                                        :dataset_query {:lib/type :mbql/query
                                                        :database destination-id
                                                        :stages   [{:lib/type :mbql.stage/native
                                                                    :native   "UPDATE venues SET name = 'x'"}]}})]
        (is (=? {:actions [{:error #".*is backed by a routing destination.*"}]}
                (serialize! :crowberto 200 {:actions [action-id]})))))))

(deftest refuses-a-source-whose-settings-read-a-card-test
  (testing "a copy keeps every card its serialization references, so a click behaviour linking a saved question is refused
            like a query reading one"
    (data-apps.tu/do-with-sources!
     (fn [{:keys [metric-id model-id]}]
       (t2/update! :model/Card :id metric-id
                   {:visualization_settings {:click_behavior {:type "link" :linkType "question" :targetId model-id}}})
       (is (=? {:metrics [{:error (re-pattern (str ".*reads card " model-id ".*"))}]}
               (serialize! :crowberto 200
                           {:queries [(query-item "VenueCount" (metric-count-definition metric-id))]})))))))

(deftest extracts-the-cards-and-the-actions-once-test
  (testing "the cards and the actions are each extracted in one serialization query, however many the app uses"
    (data-apps.tu/do-with-sources!
     (fn [{:keys [metric-id action-id model-action-id]}]
       (let [calls   (atom [])
             extract (mt/original-fn #'apps.serialization/extract-by-entity-id)]
         (mt/with-dynamic-fn-redefs [apps.serialization/extract-by-entity-id (fn [model-name ids]
                                                                               (swap! calls conj model-name)
                                                                               (extract model-name ids))]
           (is (=? {:actions [{:path string?} {:error string?}] :metrics [{:path string?}]}
                   (serialize-directly!
                    {:queries [(query-item "VenueCount" (metric-count-definition metric-id))]
                     :actions [action-id model-action-id]}))))
         (is (= {"Card" 1 "Action" 1} (frequencies @calls))))))))

(deftest serializes-the-saved-question-an-author-writes-test
  (testing "a query comes back as the saved question that holds it: named as given, in the given collection, with the
            given entity ID, created by the caller, and nothing unset"
    (let [{:keys [path yaml] :as file} (-> (serialize! :crowberto 200
                                                       {:queries [(query-item "Venues list" (venues-definition :limit 5)
                                                                              :entity_id "savedQuestionEntity01")]})
                                           :queries first)
          entity                       (file-entity file)]
      (is (re-matches #"collections/.*/venues_list\.yaml" path))
      (is (string? yaml))
      (is (=? {:serdes/meta            [{:model "Card"}]
               :entity_id              "savedQuestionEntity01"
               :collection_id          app-collection
               :name                   "Venues list"
               :type                   "question"
               :display                "table"
               :creator_id             "crowberto@metabase.com"
               :visualization_settings {:column_settings nil}
               :parameters             []
               :parameter_mappings     []
               :dataset_query          {:database (db-name)
                                        :stages   [{:source-table (table-path "VENUES") :limit 5}]}}
              entity))
      (is (not-any? (partial contains? entity)
                    [:description :collection_position :public_uuid :card_schema :archived :enable_embedding])
          "what serialization leaves unset or at its default is left out, as the format omits it"))))

(deftest keys-come-in-the-order-serialization-writes-them-test
  (testing "the printed entity comes in the order serialization writes a file, so an author keeps it"
    (let [{:keys [yaml] :as file} (-> (serialize-directly! {:queries [(query-item "Venues" (venues-definition))]})
                                      :queries first)]
      (is (= [:database :stages :lib/type] (keys (:dataset_query (file-entity file)))))
      (is (< (str/index-of yaml "name:") (str/index-of yaml "\ndataset_query:"))))))

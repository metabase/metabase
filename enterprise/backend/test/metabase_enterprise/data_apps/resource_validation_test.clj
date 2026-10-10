(ns metabase-enterprise.data-apps.resource-validation-test
  "What the files of a data app's collection may hold, checked on the ingested files before anything loads."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.core :as data-apps]
   [metabase-enterprise.data-apps.test-util :as data-apps.tu]
   [metabase-enterprise.serialization.core :as serialization]
   [metabase.test :as mt]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private collection-eid (data-apps.tu/collection-entity-id "shop"))

(def ^:private question-eid "shopQuestionListVenue")

(defn- venues-query []
  {:stages [{:source {:type "table" :id (mt/id :venues)} :limit 5}]})

(defn- ingest [content]
  (serialization/read-timestamps (yaml/parse-string content {:key-fn serialization/parse-key})))

(defn- files
  "The data app entity files of the repo `tree`, as ingestion hands them to the check."
  [tree]
  (for [[path content] tree
        :when (str/ends-with? path ".yaml")]
    {:path path :entity (ingest content)}))

(def ^:private collection-name "Data App: shop")

(def ^:private collection-dir (str "collections/data_apps/" (data-apps.tu/collection-dir collection-name) "/"))

(def ^:private collection-path (data-apps.tu/collection-path collection-name))

(def ^:private question-path (str collection-dir "venueslist_"))

(def ^:private action-path (str collection-dir "rename_venue_"))

(defn- shop
  "The repo files of the `shop` app with `resources`, a map of repo paths to YAML text (see `data-apps.tu/app-files`)."
  [resources & {:as options}]
  (data-apps.tu/app-files "shop" (merge {:name "Shop" :path "index.js" :bundle "B"
                                         :collection collection-eid :resources resources}
                                        options)))

(defn- question-resources []
  (data-apps.tu/build-resources collection-name collection-eid [{:entity_id question-eid :name "VenuesList" :query (venues-query)}] []))

(defn- edit-file
  "`tree` with the YAML of the first file whose path starts with `prefix` changed by `f`."
  [tree prefix f]
  (let [path (some #(when (str/starts-with? % prefix) %) (sort (keys tree)))]
    (update tree path #(yaml/generate-string (f (yaml/parse-string %))))))

(defn- messages [tree]
  (mapv :message (data-apps/problems (files tree))))

(defn- warnings [tree]
  (mapv :message (data-apps/warnings (files tree))))

(defn- first-problem [tree]
  (first (data-apps/problems (files tree))))

(deftest valid-resources-have-no-problems-test
  (data-apps.tu/do-with-sources!
   (fn [{:keys [metric-id action-id]}]
     (let [resources (data-apps.tu/build-resources
                      collection-name collection-eid
                      [{:entity_id question-eid :name "VenuesList" :query (venues-query)}
                       {:entity_id "shopQuestionMetricVen" :name "VenueCount"
                        :query {:stages [{:source       {:type "table" :id (mt/id :venues)}
                                          :aggregations [{:type "metric" :id metric-id}]}]}}]
                      [action-id])]
       (is (= [] (messages (shop resources))))))))

(deftest an-app-with-only-its-collection-has-no-problems-test
  (is (= [] (messages (data-apps.tu/app-files "shop" {:name "Shop" :path "index.js" :bundle "B" :collection collection-eid})))))

(deftest a-file-is-named-with-its-problem-test
  (let [tree (edit-file (shop (question-resources)) question-path #(assoc % :archived true))]
    (is (=? {:file #"collections/data_apps/data_app__shop/.*\.yaml" :message #".*must not be archived\."}
            (first-problem tree)))))

(deftest refuses-what-a-resource-may-not-hold-test
  (let [refused (fn [tree message]
                  (is (some #(str/includes? % message) (messages tree)) message))]
    (testing "a manifest naming a collection whose file isn't in the repository"
      (refused (shop (question-resources) :collection (data-apps.tu/collection-entity-id "other"))
               "is not in the repository"))
    (testing "a card that isn't a question or metric: a model has no place, now that no action hangs off one"
      (doseq [card-type ["dashboard" "model"]]
        (refused (edit-file (shop (question-resources)) question-path #(assoc % :type card-type))
                 "must be a question or metric")))
    (testing "a card whose query names no database"
      (refused (edit-file (shop (question-resources)) question-path #(assoc % :dataset_query {}))
               "must hold a query"))
    (testing "a public card"
      (refused (edit-file (shop (question-resources)) question-path #(assoc % :public_uuid "8e2a9c55-6b0f-4b43-a1c4-fb5c0c1b2b0a"))
               "must not be public or embedded"))
    (testing "a card that reads a card outside the app"
      (mt/with-temp [:model/Card {other-id :id} {:dataset_query {:database (mt/id)
                                                                 :type     :query
                                                                 :query    {:source-table (mt/id :venues)}}}]
        (let [other-eid (t2/select-one-fn :entity_id :model/Card :id other-id)]
          (refused (edit-file (shop (question-resources)) question-path
                              #(update % :dataset_query assoc :stages [{:lib/type "mbql.stage/mbql" :source-card other-eid}]))
                   (str "references Card " other-eid)))))
    (testing "a file whose serdes/meta doesn't identify what it holds"
      (refused (edit-file (shop (question-resources)) question-path #(assoc % :serdes/meta [{:model "Card" :id "someOtherEntityId0001"}]))
               "must hold a single Card whose serdes/meta ID is its entity_id"))
    (testing "a manifest that doesn't identify the app, which a load would refuse"
      (refused (edit-file (shop nil) "data_apps/shop/data_app.yaml" #(dissoc % :entity_id))
               "must hold a single DataApp whose serdes/meta ID is its entity_id")
      (refused (edit-file (shop nil) "data_apps/shop/data_app.yaml" #(assoc % :entity_id "someOtherEntityId0001"))
               "must hold a single DataApp whose serdes/meta ID is its entity_id"))
    (testing "a manifest naming no collection"
      (refused (shop (question-resources) :collection nil) "must name the app's resource collection")
      (refused (shop nil :collection nil) "must name the app's resource collection"))
    (testing "a manifest naming a collection the repository doesn't hold"
      (refused (shop (dissoc (question-resources) collection-path)) "is not in the repository")
      (refused (shop nil) "is not in the repository"))))

(deftest refuses-an-action-the-app-cannot-run-test
  (data-apps.tu/do-with-sources!
   (fn [{:keys [model-id action-id]}]
     (let [model-eid   (t2/select-one-fn :entity_id :model/Card :id model-id)
           resources   (data-apps.tu/build-resources collection-name collection-eid
                                                     [{:entity_id question-eid :name "VenuesList" :query (venues-query)}]
                                                     [action-id])]
       (is (= [] (messages (shop resources))) "a query action that belongs to no model is fine")
       (testing "a data app runs only actions that belong to no model, the ones the typed schema lists"
         (is (some #(str/includes? % "must belong to no model")
                   (messages (edit-file (shop resources) action-path #(assoc % :model_id model-eid))))))
       (testing "and only query actions"
         (is (some #(str/includes? % "must be a query action")
                   (messages (edit-file (shop resources) action-path
                                        #(assoc % :type "implicit" :query [] :implicit [{:kind "row/create"}])))))
         (is (some #(str/includes? % "must carry exactly one query, and no implicit action")
                   (messages (edit-file (shop resources) action-path #(assoc % :implicit [{:kind "row/create"}]))))))
       (testing "a card or action has to name its creator, since a load can't save one without"
         (is (some #(str/includes? % "must name its creator in creator_id")
                   (messages (edit-file (shop resources) action-path #(dissoc % :creator_id)))))
         (is (some #(str/includes? % "must name its creator in creator_id")
                   (messages (edit-file (shop resources) question-path #(dissoc % :creator_id))))))
       (testing "an action outside the app's collection isn't the app's, so it isn't checked as its resource"
         (is (= [] (messages (edit-file (shop resources) action-path #(assoc % :collection_id "elsewhere0000000000a" :model_id model-eid))))))))))

(deftest refuses-what-this-app-does-not-own-test
  (testing "serialization would update any row carrying an entity ID a file names, so a file may only name the app's own"
    (testing "a card whose entity ID belongs to a card elsewhere"
      (mt/with-temp [:model/Card _ {:name "Someone else's" :entity_id question-eid}]
        (is (some #(str/includes? % (str "Card " question-eid " already exists outside")) (messages (shop (question-resources)))))))
    (testing "a collection that is another app's"
      (mt/with-temp [:model/Collection {collection-id :id} {:entity_id collection-eid :name "Theirs" :namespace :data-apps}
                     :model/DataApp    _ {:name "theirs" :display_name "Theirs" :bundle_path "index.js"
                                          :resource_collection_id collection-id}]
        (is (some #(str/includes? % "already exists and is another data app's collection") (messages (shop (question-resources)))))))
    (testing "a collection outside the data-apps namespace, which a load would move into it"
      (mt/with-temp [:model/Collection _ {:entity_id collection-eid :name "Finance"}]
        (is (some #(str/includes? % "already exists outside the data-apps namespace") (messages (shop (question-resources)))))))
    (testing "the app's own collection and card"
      (mt/with-temp [:model/Collection {collection-id :id} {:entity_id collection-eid :name "Mine" :namespace :data-apps}
                     :model/DataApp    _ {:name "shop" :display_name "Shop" :bundle_path "index.js"
                                          :entity_id (data-apps.tu/app-entity-id "shop")
                                          :resource_collection_id collection-id}
                     :model/Card       _ {:name "Mine" :entity_id question-eid :collection_id collection-id}]
        (is (= [] (messages (shop (question-resources)))))))))

(deftest warns-of-a-field-that-doesnt-exist-test
  (testing "a field a query names that doesn't exist loads as a placeholder and is logged, on a database without schemas too"
    (mt/with-temp [:model/Database {db-id :id} {:engine :h2 :name "no-schemas"}
                   :model/Table    {table-id :id} {:db_id db-id :name "T" :schema nil :active true}
                   :model/Field    _ {:table_id table-id :name "ID" :base_type :type/Integer}]
      (let [filtering-on (fn [db schema table field]
                           (edit-file (shop (question-resources)) question-path
                                      #(assoc % :database_id db
                                              :dataset_query {:database db
                                                              :lib/type "mbql/query"
                                                              :stages   [{:lib/type     "mbql.stage/mbql"
                                                                          :source-table [db schema table]
                                                                          :filters      [["=" {} ["field" {} [db schema table field]] 1]]}]})))]
        (is (= [] (messages (filtering-on "no-schemas" nil "T" "NOPE"))))
        (is (some #(str/includes? % "NOPE") (warnings (filtering-on "no-schemas" nil "T" "NOPE"))))
        (is (= [] (warnings (filtering-on "no-schemas" nil "T" "ID"))))
        (is (some #(str/includes? % "NOPE") (warnings (filtering-on (:name (mt/db)) "PUBLIC" "VENUES" "NOPE"))))))))

(deftest warns-of-a-table-or-field-named-in-any-reference-test
  (testing "serialization makes a placeholder for a missing table or field wherever a file references one, and the pull
            logs it"
    (let [db      (:name (mt/db))
          refused (fn [missing f]
                    (let [tree (edit-file (shop (question-resources)) question-path f)]
                      (is (= [] (messages tree)) missing)
                      (is (some #(str/includes? % missing) (warnings tree)) missing)))]
      (testing "result metadata"
        (refused "NOPE_META" #(assoc % :result_metadata [{:name      "NOPE"
                                                          :base_type "type/Text"
                                                          :id        [db "PUBLIC" "VENUES" "NOPE_META"]}])))
      (testing "the source field of a field reference"
        (refused "NOPE_SOURCE" #(assoc-in % [:dataset_query :stages 0 :fields]
                                          [["field" {:source-field [db "PUBLIC" "VENUES" "NOPE_SOURCE"]}
                                            [db "PUBLIC" "VENUES" "ID"]]])))
      (testing "a field reference in the older form"
        (refused "NOPE_LEGACY" #(assoc-in % [:dataset_query :stages 0 :filters]
                                          [["=" {} ["field" [db "PUBLIC" "VENUES" "NOPE_LEGACY"] nil] 1]])))
      (testing "a table template tag"
        (refused "NOPE_TAG_TABLE" #(assoc % :dataset_query
                                          {:database db
                                           :lib/type "mbql/query"
                                           :stages   [{:lib/type      "mbql.stage/native"
                                                       :native        "SELECT * FROM {{t}}"
                                                       :template-tags {"t" {:type         "table"
                                                                            :name         "t"
                                                                            :display-name "T"
                                                                            :id           "7f2c2a0e-6c1e-4b53-9d0a-0d5a3a1d1c12"
                                                                            :table-id     [db "PUBLIC" "NOPE_TAG_TABLE"]}}}]})))
      (testing "a list of strings that isn't a reference is left alone, even when it starts with a database's name"
        (is (= [] (warnings (edit-file (shop (question-resources)) question-path
                                       #(assoc % :visualization_settings {:some.custom/labels [db "Alpha" "Beta"]}))))))
      (testing "and a file that names only what exists has nothing to log"
        (is (= [] (warnings (shop (question-resources)))))))))

(deftest accepts-a-database-the-instance-does-not-have-yet-test
  (testing "a query on a database that isn't connected yet loads as a card's does, against a stub database that a
            later connection and sync fill in"
    (let [tree (edit-file (shop (question-resources)) question-path
                          #(-> %
                               (assoc :database_id "Not connected yet")
                               (assoc-in [:dataset_query :database] "Not connected yet")
                               (assoc-in [:dataset_query :stages 0 :source-table] ["Not connected yet" "analytics" "accounts"])))]
      (is (= [] (messages tree)))
      (is (some #(str/includes? % "references table [\"Not connected yet\" \"analytics\" \"accounts\"], which does not exist")
                (warnings tree))))))

(deftest refuses-more-of-what-a-resource-may-not-hold-test
  (let [refused (fn [tree message]
                  (is (some #(str/includes? % message) (messages tree)) message))
        tree    (fn [] (shop (question-resources)))]
    (testing "a collection file that isn't a root collection of the data-apps namespace"
      (doseq [change [{:parent_id "someOtherCollection01"} {:archived true} {:is_remote_synced true}
                      {:authority_level "official"} {:type "instance-analytics"}]]
        (refused (edit-file (tree) collection-path #(merge % change))
                 "must be a root collection that is not remote-synced or archived"))
      (doseq [change [{:namespace "snippets"} {:namespace nil}]]
        (refused (edit-file (tree) collection-path #(merge % change))
                 "must be in the data-apps collection namespace")))
    (testing "a card that belongs to a dashboard or a document"
      (refused (edit-file (tree) question-path #(assoc % :dashboard_id "someDashboardEntity01"))
               "must not belong to a dashboard or document")
      (refused (edit-file (tree) question-path #(assoc % :document_id "someDocumentEntityI01"))
               "must not belong to a dashboard or document"))
    (testing "an embedded card"
      (refused (edit-file (tree) question-path #(assoc % :enable_embedding true))
               "must not be public or embedded"))
    (testing "a snippet that the instance doesn't have"
      (refused (edit-file (tree) question-path
                          #(assoc % :dataset_query
                                  {:database (:database (:dataset_query %))
                                   :lib/type "mbql/query"
                                   :stages   [{:lib/type      "mbql.stage/native"
                                               :native        "SELECT 1 {{snippet: s}}"
                                               :template-tags {"snippet: s" {:type         "snippet"
                                                                             :name         "snippet: s"
                                                                             :display-name "Snippet: s"
                                                                             :id           "7f2c2a0e-6c1e-4b53-9d0a-0d5a3a1d1c13"
                                                                             :snippet-name "s"
                                                                             :snippet-id   "nowhereSnippetEid0000"}}}]}))
               "references NativeQuerySnippet nowhereSnippetEid0000, which does not exist on this instance"))
    (testing "one card defined by two files"
      (let [resources (question-resources)
            path      (some #(when (str/includes? % question-eid) %) (keys resources))]
        (refused (shop (assoc resources (str collection-dir "copy.yaml") (get resources path)))
                 "is defined by more than one file")))))

(deftest refuses-an-action-that-takes-its-parameter-values-from-a-card-test
  (data-apps.tu/do-with-sources!
   (fn [{:keys [action-id]}]
     (let [resources (data-apps.tu/build-resources
                      collection-name collection-eid
                      [{:entity_id question-eid :name "VenuesList" :query (venues-query)}]
                      [action-id])
           tree      (edit-file (shop resources) action-path
                                #(assoc % :parameters [{:id "name" :slug "name" :type "string/="
                                                        :values_source_config {:card_id question-eid}}]))]
       (is (some #(str/includes? % "must not take parameter values from a card") (messages tree)))))))

(deftest refuses-a-reference-by-numeric-id-test
  (testing "a numeric ID names a row on one instance, and slips past the checks that read entity IDs"
    (mt/with-temp [:model/Card {other-id :id} {:dataset_query {:database (mt/id)
                                                               :type     :query
                                                               :query    {:source-table (mt/id :venues)}}}]
      (let [refused (fn [f]
                      (is (some #(str/includes? % "numeric ID")
                                (messages (edit-file (shop (question-resources)) question-path f)))))
            native  (fn [tag]
                      #(assoc % :dataset_query {:database (:database (:dataset_query %))
                                                :lib/type "mbql/query"
                                                :stages   [{:lib/type      "mbql.stage/native"
                                                            :native        "SELECT * FROM {{t}}"
                                                            :template-tags {"t" (merge {:name "t" :display-name "T"
                                                                                        :id   "7f2c2a0e-6c1e-4b53-9d0a-0d5a3a1d1c12"}
                                                                                       tag)}}]}))]
        (testing "a card"
          (refused #(update % :dataset_query assoc :stages [{:lib/type "mbql.stage/mbql" :source-card other-id}])))
        (testing "a table"
          (refused #(assoc-in % [:dataset_query :stages 0 :source-table] (mt/id :venues))))
        (testing "a field"
          (refused #(assoc-in % [:dataset_query :stages 0 :filters] [["=" {} ["field" {} (mt/id :venues :id)] 1]])))
        (testing "a field in the older form"
          (refused #(assoc-in % [:dataset_query :stages 0 :filters] [["=" {} ["field" (mt/id :venues :id) nil] 1]])))
        (testing "a card template tag"
          (refused (native {:type "card" :card-id other-id})))
        (testing "a snippet template tag"
          (refused (native {:type "snippet" :snippet-name "s" :snippet-id 1})))
        (testing "a table template tag"
          (refused (native {:type "table" :table-id (mt/id :venues)})))))))

(deftest refuses-more-references-by-numeric-id-test
  (testing "a card as the source table in the older form, the source field of a field reference, and a database"
    (mt/with-temp [:model/Card {other-id :id} {:dataset_query {:database (mt/id)
                                                               :type     :query
                                                               :query    {:source-table (mt/id :venues)}}}]
      (let [refused (fn [f]
                      (is (some #(str/includes? % "numeric ID")
                                (messages (edit-file (shop (question-resources)) question-path f)))))]
        (refused #(assoc-in % [:dataset_query :stages 0 :source-table] (str "card__" other-id)))
        (refused #(assoc-in % [:dataset_query :stages 0 :fields]
                            [["field" {:source-field (mt/id :venues :category_id)} "NAME"]]))
        (refused #(assoc-in % [:dataset_query :database] (mt/id)))))))

(deftest refuses-a-change-of-the-apps-collection-test
  (testing "the app's hooks refuse a change of collection, but only after the load has moved what it reached first"
    (mt/with-temp [:model/Collection {collection-id :id} {:entity_id collection-eid :name "Mine" :namespace :data-apps}
                   :model/DataApp    _ {:name "shop" :display_name "Shop" :bundle_path "index.js"
                                        :entity_id (data-apps.tu/app-entity-id "shop")
                                        :resource_collection_id collection-id}]
      (let [other-eid (data-apps.tu/collection-entity-id "other")
            resources (data-apps.tu/build-resources collection-name other-eid
                                                    [{:entity_id question-eid :name "VenuesList" :query (venues-query)}]
                                                    [])]
        (is (some #(str/includes? % "a data app's collection cannot be changed")
                  (messages (shop resources :collection other-eid))))
        (testing "the collection the app has is fine"
          (is (= [] (messages (shop (question-resources))))))))))

(deftest refuses-a-manifest-that-doesnt-say-what-it-is-test
  (testing "a data_app.yaml without serdes/meta would be skipped by the load, and the app deleted as no longer in the
            repository"
    (is (some #(str/includes? % "must hold a single DataApp whose serdes/meta ID is its entity_id")
              (messages (edit-file (shop nil) "data_apps/shop/data_app.yaml" #(dissoc % :serdes/meta)))))))

(deftest refuses-two-manifests-with-one-entity-id-test
  (testing "a load keeps one app, and the other's collection is left with no owner"
    (let [tree (merge (shop (question-resources))
                      (data-apps.tu/app-files "shop2" {:name "Shop 2" :path "index.js" :bundle "B"
                                                       :entity_id (data-apps.tu/app-entity-id "shop")}))]
      (is (= 2 (count (filter #(str/includes? % "which another data app also has") (messages tree))))))))

(deftest refuses-a-manifest-whose-slug-an-app-made-here-has-test
  (testing "an app made on the instance keeps its slug, and a load would refuse the repository's app only after its
            collection and cards had loaded"
    (mt/with-temp [:model/DataApp _ {:name "shop" :display_name "Shop" :bundle_path "index.js"
                                     :entity_id "madeHereAppEntity0001"}]
      (is (some #(str/includes? % "a data app made on this instance already has")
                (messages (shop (question-resources))))))))

(deftest refuses-two-manifests-with-one-slug-test
  (testing "a load keeps the first app and refuses the second after it has started"
    (let [tree (merge (shop (question-resources))
                      (edit-file (data-apps.tu/app-files "shop2" {:name "Shop 2" :path "index.js" :bundle "B"})
                                 "data_apps/shop2/data_app.yaml" #(assoc % :slug "shop")))]
      (is (= 2 (count (filter #(str/includes? % "has the slug") (messages tree))))))))

(deftest refuses-other-content-in-the-apps-collection-test
  (testing "a data app's collection holds cards and actions only, and a load would refuse anything else only after it
            had started"
    (let [tree (assoc (shop (question-resources))
                      (str collection-dir "launches.yaml")
                      (yaml/generate-string {:name          "Launches"
                                             :entity_id     "shopTimelineLaunches0"
                                             :collection_id collection-eid
                                             :serdes/meta   [{:model "Timeline" :id "shopTimelineLaunches0"}]}))]
      (is (some #(str/includes? % "holds only questions, metrics and query actions") (messages tree))))))

(deftest accepts-what-a-failed-pull-left-in-the-collection-the-app-claims-test
  (testing "a card loaded into the app's collection before the app itself failed to load is the app's to claim"
    (mt/with-temp [:model/Collection {collection-id :id} {:entity_id collection-eid :name "Mine" :namespace :data-apps}
                   :model/Card       _ {:name "Left behind" :entity_id question-eid :collection_id collection-id}]
      (is (= [] (messages (shop (question-resources)))))
      (testing "but not one in another collection of the namespace"
        (mt/with-temp [:model/Collection {other-id :id} {:name "Other" :namespace :data-apps}]
          (t2/update! :model/Card :entity_id question-eid {:collection_id other-id})
          (is (some #(str/includes? % "already exists outside this data app's collection")
                    (messages (shop (question-resources))))))))))

(deftest warns-of-a-table-that-is-inactive-test
  (testing "an inactive table is one that sync no longer finds, or a placeholder a load made, so the pull logs it"
    (let [resources (question-resources)]
      (mt/with-temp-vals-in-db :model/Table (mt/id :venues) {:active false}
        (is (= [] (messages (shop resources))))
        (is (some #(str/includes? % "references table [") (warnings (shop resources))))))))

(deftest warns-of-a-field-that-is-inactive-test
  (testing "an inactive field is one that sync no longer finds: one column isn't the app, so the file loads and the
            pull logs the field rather than refusing the repository until the file changes"
    (let [resources (data-apps.tu/build-resources
                     collection-name collection-eid
                     [{:entity_id question-eid :name "VenuePrices"
                       :query {:stages [{:source {:type "table" :id (mt/id :venues)}
                                         :fields [{:type "column" :name "PRICE"}]}]}}]
                     [])]
      (mt/with-temp-vals-in-db :model/Field (mt/id :venues :price) {:active false}
        (is (= [] (messages (shop resources))))
        (is (some #(str/includes? % "references field") (warnings (shop resources)))))
      (testing "an active field is nothing to log"
        (is (= [] (warnings (shop resources))))))))

(deftest refuses-a-collection-inside-the-apps-collection-test
  (testing "a data app's collection holds no collections, and a load would refuse one only after it had started"
    (let [inner "innerCollectionEnt01"
          tree  (assoc (shop (question-resources))
                       (str collection-dir "inner.yaml")
                       (yaml/generate-string {:serdes/meta [{:model "Collection" :id inner :label "inner"}]
                                              :entity_id   inner
                                              :name        "Inner"
                                              :namespace   "data-apps"
                                              :parent_id   collection-eid}))]
      (is (some #(str/includes? % "is a collection inside a data app's collection") (messages tree))))))

(deftest accepts-the-collection-files-of-an-app-the-commit-no-longer-holds-test
  (testing "the files of a collection no manifest names, what a deleted app's directory leaves behind, don't fail the
            pull: it deletes the app, whose hook deletes the collection, and the next export removes the files"
    (let [tree (dissoc (shop (question-resources)) "data_apps/shop/data_app.yaml" "data_apps/shop/index.js")]
      (is (= [] (messages tree))))))

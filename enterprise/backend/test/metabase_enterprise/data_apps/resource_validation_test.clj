(ns metabase-enterprise.data-apps.resource-validation-test
  "What a data app's resource files may hold, checked on the ingested files before anything loads."
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

(defn- shop
  "The repo files of the `shop` app with `resources`, a map of paths relative to `resources/` to YAML text."
  [resources & {:as options}]
  (data-apps.tu/app-files "shop" (merge {:name "Shop" :path "index.js" :bundle "B"
                                         :collection collection-eid :resources resources}
                                        options)))

(defn- question-resources []
  (data-apps.tu/build-resources collection-eid [{:entity_id question-eid :name "VenuesList" :query (venues-query)}] []))

(defn- edit-file
  "`tree` with the YAML of the first file whose path starts with `prefix` changed by `f`."
  [tree prefix f]
  (let [path (some #(when (str/starts-with? % prefix) %) (sort (keys tree)))]
    (update tree path #(yaml/generate-string (f (yaml/parse-string %))))))

(def ^:private question-path "data_apps/shop/resources/cards/")

(defn- messages [tree]
  (mapv :message (data-apps/problems (files tree))))

(defn- first-problem [tree]
  (first (data-apps/problems (files tree))))

(deftest valid-resources-have-no-problems-test
  (data-apps.tu/do-with-sources!
   (fn [{:keys [metric-id action-id]}]
     (let [resources (data-apps.tu/build-resources
                      collection-eid
                      [{:entity_id question-eid :name "VenuesList" :query (venues-query)}
                       {:entity_id "shopQuestionMetricVen" :name "VenueCount"
                        :query {:stages [{:source       {:type "table" :id (mt/id :venues)}
                                          :aggregations [{:type "metric" :id metric-id}]}]}}]
                      [action-id])]
       (is (= [] (messages (shop resources))))))))

(deftest an-app-without-resources-has-no-problems-test
  (is (= [] (messages (shop nil :collection nil)))))

(deftest a-file-is-named-with-its-problem-test
  (let [tree (edit-file (shop (question-resources)) question-path #(assoc % :archived true))]
    (is (=? {:file #"data_apps/shop/resources/cards/.*\.yaml" :message #".*must not be archived\."}
            (first-problem tree)))))

(deftest refuses-what-a-resource-may-not-hold-test
  (let [refused (fn [tree message]
                  (is (some #(str/includes? % message) (messages tree)) message))]
    (testing "a collection other than the one data_app.yaml names"
      (refused (shop (question-resources) :collection (data-apps.tu/collection-entity-id "other"))
               "must hold the collection"))
    (testing "a card outside the app's collection"
      (refused (edit-file (shop (question-resources)) question-path #(assoc % :collection_id "someOtherCollection01"))
               "must be in the collection"))
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
    (testing "a file whose model doesn't match its directory"
      (refused (edit-file (shop (question-resources)) question-path #(assoc % :serdes/meta [{:model "Dashboard" :id question-eid}]))
               "must hold a single Card"))
    (testing "a setting smuggled in as a resource"
      (refused (shop (assoc (question-resources) "cards/setting.yaml"
                            (yaml/generate-string {:key "site-name" :value "Pwned"
                                                   :serdes/meta [{:model "Setting" :id "site-name"}]})))
               "cards/setting.yaml must hold a single Card"))
    (testing "a file outside the resource layout"
      (refused (shop (assoc (question-resources) "extra.yaml" "name: x")) "extra.yaml is not a data app resource."))
    (testing "a table that doesn't exist"
      (refused (edit-file (shop (question-resources)) question-path
                          #(assoc-in % [:dataset_query :stages 0 :source-table] [(:name (mt/db)) "PUBLIC" "NO_SUCH_TABLE"]))
               "NO_SUCH_TABLE"))
    (testing "resources without a manifest"
      (refused (dissoc (shop (question-resources)) "data_apps/shop/data_app.yaml") "needs a data_app.yaml"))
    (testing "a manifest that doesn't identify the app, which ingestion would pass over"
      (refused (edit-file (shop (question-resources)) "data_apps/shop/data_app.yaml" #(dissoc % :serdes/meta))
               "must hold a single DataApp whose serdes/meta ID is its entity_id")
      (refused (edit-file (shop nil :collection nil) "data_apps/shop/data_app.yaml" #(dissoc % :entity_id))
               "must hold a single DataApp whose serdes/meta ID is its entity_id"))
    (testing "a manifest naming no collection beside resources"
      (refused (shop (question-resources) :collection nil) "must name the app's resource collection"))
    (testing "resources without the collection file"
      (refused (shop (dissoc (question-resources) "collection.yaml")) "resource collection is missing"))))

(deftest refuses-an-action-the-app-cannot-run-test
  (data-apps.tu/do-with-sources!
   (fn [{:keys [model-id action-id]}]
     (let [model-eid   (t2/select-one-fn :entity_id :model/Card :id model-id)
           resources   (data-apps.tu/build-resources collection-eid
                                                     [{:entity_id question-eid :name "VenuesList" :query (venues-query)}]
                                                     [action-id])
           action-path "data_apps/shop/resources/actions/"]
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
       (testing "an action is in the app's collection, like a card"
         (is (some #(str/includes? % (str "must be in the collection " collection-eid))
                   (messages (edit-file (shop resources) action-path #(assoc % :collection_id "elsewhere0000000000a"))))))))))

(deftest refuses-what-this-app-does-not-own-test
  (testing "serialization would update any row carrying an entity ID a file names, so a file may only name the app's own"
    (testing "a card whose entity ID belongs to a card elsewhere"
      (mt/with-temp [:model/Card _ {:name "Someone else's" :entity_id question-eid}]
        (is (some #(str/includes? % (str "Card " question-eid " already exists outside")) (messages (shop (question-resources)))))))
    (testing "a collection that is another app's"
      (mt/with-temp [:model/Collection {collection-id :id} {:entity_id collection-eid :name "Theirs"}
                     :model/DataApp    _ {:name "theirs" :display_name "Theirs" :bundle_path "index.js"
                                          :resource_collection_id collection-id}]
        (is (some #(str/includes? % "already exists and isn't this data app's collection") (messages (shop (question-resources)))))))
    (testing "the app's own collection and card"
      (mt/with-temp [:model/Collection {collection-id :id} {:entity_id collection-eid :name "Mine"}
                     :model/DataApp    _ {:name "shop" :display_name "Shop" :bundle_path "index.js"
                                          :entity_id (data-apps.tu/app-entity-id "shop")
                                          :resource_collection_id collection-id}
                     :model/Card       _ {:name "Mine" :entity_id question-eid :collection_id collection-id}]
        (is (= [] (messages (shop (question-resources)))))))))

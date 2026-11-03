(ns metabase-enterprise.data-apps.invariants-test
  "What a data app's collection may hold, enforced by the model hooks, so a write through Toucan, which is what a
  remote-sync pull does, is refused like an API call."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.test-util :as data-apps.tu]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- do-with-app-collection
  "Call `f` with the id of a data app's resource collection; deleting the app afterwards deletes what it holds."
  [f]
  (mt/with-premium-features #{:data-apps}
    (mt/with-temp [:model/DataApp {collection-id :resource_collection_id}
                   {:name "birds" :display_name "Birds" :bundle_path "birds.js"}]
      (f collection-id))))

(defn- reading-card
  "A native query of the action kind that reads the card with `card-id` through a card template tag."
  [card-id]
  (let [tag (str "#" card-id)]
    (lib/query (mt/metadata-provider)
               {:database (mt/id)
                :type     :native
                :native   {:query         (str "SELECT * FROM {{" tag "}}")
                           :template-tags {tag {:type         :card
                                                :card-id      card-id
                                                :name         tag
                                                :display-name tag
                                                :id           (str (random-uuid))}}}})))

(defn- insert-query-action!
  "Insert a query action named `action-name` running `query` in the collection with `collection-id`, as a load does,
  with `action-columns` merged into its Action row."
  [collection-id action-name query & [action-columns]]
  (let [action-id (t2/insert-returning-pk! :model/Action (merge {:name          action-name
                                                                 :type          :query
                                                                 :collection_id collection-id
                                                                 :creator_id    (mt/user->id :crowberto)}
                                                                action-columns))]
    (t2/insert! :model/QueryAction {:action_id action-id :database_id (mt/id) :dataset_query query})
    action-id))

(deftest card-in-apps-collection-holds-query-test
  (testing "a card in an app's collection holds a query on a database"
    (do-with-app-collection
     (fn [collection-id]
       (is (thrown-with-msg? clojure.lang.ExceptionInfo #"must hold a query on a database"
                             (t2/insert! :model/Card {:name                   "Empty"
                                                      :display                "table"
                                                      :visualization_settings {}
                                                      :creator_id             (mt/user->id :crowberto)
                                                      :collection_id          collection-id
                                                      :dataset_query          {}})))))))

(deftest action-in-apps-collection-is-neither-archived-nor-public-test
  (testing "an action is refused archived or public on insert, not only on update"
    (do-with-app-collection
     (fn [collection-id]
       (let [query (lib/native-query (mt/metadata-provider) "UPDATE venues SET name = 'x'")]
         (is (thrown-with-msg? clojure.lang.ExceptionInfo #"can't be archived"
                               (insert-query-action! collection-id "Archived" query {:archived true})))
         (is (thrown-with-msg? clojure.lang.ExceptionInfo #"can't be made public"
                               (insert-query-action! collection-id "Public" query
                                                     {:public_uuid       (str (random-uuid))
                                                      :made_public_by_id (mt/user->id :crowberto)})))
         (testing "elsewhere both are fine"
           (mt/with-temp [:model/Collection {other-id :id} {:namespace :data-actions}]
             (is (pos-int? (insert-query-action! other-id "Archived elsewhere" query {:archived true})))
             (is (pos-int? (insert-query-action! other-id "Public elsewhere" query
                                                 {:public_uuid       (str (random-uuid))
                                                  :made_public_by_id (mt/user->id :crowberto)}))))))))))

(deftest action-in-apps-collection-takes-no-values-from-card-test
  (testing "a parameter of an action in an app's collection takes no values from a card"
    (do-with-app-collection
     (fn [collection-id]
       (mt/with-temp [:model/Card {card-id :id} {:name "Elsewhere"}]
         (is (thrown-with-msg? clojure.lang.ExceptionInfo #"can't take a parameter's values from a card"
                               (insert-query-action!
                                collection-id "Rename" (lib/native-query (mt/metadata-provider) "UPDATE venues SET name = {{name}}")
                                {:parameters [{:id                   "name"
                                               :slug                 "name"
                                               :type                 :string/=
                                               :values_source_type   "card"
                                               :values_source_config {:card_id card-id}}]}))))))))

(deftest action-in-apps-collection-reads-only-apps-cards-test
  (testing "a query action in an app's collection reads no card outside it, when it is written as a load writes it"
    (do-with-app-collection
     (fn [collection-id]
       (data-apps.tu/with-published-tables! [(mt/id :venues)]
         (mt/with-temp [:model/Card {outside-id :id} {:name "Elsewhere"}
                        :model/Card {own-id :id}     {:name          "Own"
                                                      :collection_id collection-id
                                                      :dataset_query (data-apps.tu/venues-query)}]
           (is (thrown-with-msg? clojure.lang.ExceptionInfo #"can read only the app's own cards"
                                 (insert-query-action! collection-id "Reads outside" (reading-card outside-id))))
           (let [action-id (insert-query-action! collection-id "Reads own" (reading-card own-id))]
             (testing "changing its query to read a card outside is refused"
               (is (thrown-with-msg? clojure.lang.ExceptionInfo #"can read only the app's own cards"
                                     (t2/update! :model/QueryAction action-id {:dataset_query (reading-card outside-id)})))))
           (testing "moving an action that reads a card outside into the collection is refused"
             (mt/with-temp [:model/Collection {other-id :id} {:namespace :data-actions}]
               (let [action-id (insert-query-action! other-id "Moved in" (reading-card outside-id))]
                 (is (thrown-with-msg? clojure.lang.ExceptionInfo #"can read only the app's own cards"
                                       (t2/update! :model/Action action-id {:collection_id collection-id})))
                 (is (= other-id (t2/select-one-fn :collection_id :model/Action :id action-id))))))))))))

(defn- insert-implicit-action!
  "Insert an implicit action of no model named `action-name` that inserts into the Table with `table-id`, in the
  collection with `collection-id`, as a load does."
  [collection-id action-name table-id]
  (let [action-id (t2/insert-returning-pk! :model/Action {:name          action-name
                                                          :type          :implicit
                                                          :collection_id collection-id
                                                          :creator_id    (mt/user->id :crowberto)})]
    (t2/insert! :model/ImplicitAction {:action_id action-id :kind "row/create" :table_id table-id})
    action-id))

(deftest implicit-action-in-apps-collection-writes-to-published-table-test
  (testing "an implicit action of no model in an app's collection writes only to a table published to the Library"
    (do-with-app-collection
     (fn [collection-id]
       (testing "an unpublished table is refused"
         (is (thrown-with-msg? clojure.lang.ExceptionInfo #"published to the Library"
                               (t2/with-transaction [_conn]
                                 (insert-implicit-action! collection-id "Unpublished" (mt/id :venues)))))
         (is (not (t2/exists? :model/Action :collection_id collection-id :name "Unpublished"))))
       (data-apps.tu/with-published-tables! [(mt/id :venues)]
         (testing "a published table goes in"
           (let [action-id (insert-implicit-action! collection-id "Published" (mt/id :venues))]
             (is (= (mt/id :venues) (t2/select-one-fn :table_id :model/ImplicitAction :action_id action-id)))
             (testing "and the action can't move to an unpublished table"
               (is (thrown-with-msg? clojure.lang.ExceptionInfo #"published to the Library"
                                     (t2/update! :model/ImplicitAction {:action_id action-id} {:table_id (mt/id :categories)})))
               (is (= (mt/id :venues) (t2/select-one-fn :table_id :model/ImplicitAction :action_id action-id)))))))))))

(deftest create-implicit-action-in-apps-collection-api-test
  (testing "POST /api/action creates an implicit action of no model in an app's collection on a published table"
    (mt/with-actions-enabled
      (do-with-app-collection
       (fn [collection-id]
         (data-apps.tu/with-published-tables! [(mt/id :venues)]
           (let [{action-id :id} (mt/user-http-request :crowberto :post 200 "action"
                                                       {:name          "Add venue"
                                                        :type          "implicit"
                                                        :kind          "row/create"
                                                        :table_id      (mt/id :venues)
                                                        :collection_id collection-id})]
             (is (=? {:type          :implicit
                      :model_id      nil
                      :collection_id collection-id}
                     (t2/select-one :model/Action :id action-id)))
             (is (= (mt/id :venues) (t2/select-one-fn :table_id :model/ImplicitAction :action_id action-id))))))))))

(deftest moving-implicit-action-into-apps-collection-is-checked-test
  (testing "an implicit action moved into an app's collection, as a pull may move one, needs a published table too"
    (do-with-app-collection
     (fn [collection-id]
       (mt/with-model-cleanup [:model/Action]
         (mt/with-temp [:model/Collection {other-id :id} {:namespace :data-actions}]
           (let [action-id (insert-implicit-action! other-id "Elsewhere" (mt/id :venues))]
             (is (thrown-with-msg? clojure.lang.ExceptionInfo #"published to the Library"
                                   (t2/update! :model/Action action-id {:collection_id collection-id})))
             (is (= other-id (t2/select-one-fn :collection_id :model/Action :id action-id)))
             (data-apps.tu/with-published-tables! [(mt/id :venues)]
               (t2/update! :model/Action action-id {:collection_id collection-id})
               (is (= collection-id (t2/select-one-fn :collection_id :model/Action :id action-id)))))))))))

(deftest two-data-apps-cannot-share-collection-test
  (testing "the database refuses a second app on a collection another app already owns"
    (mt/with-model-cleanup [:model/DataApp]
      (do-with-app-collection
       (fn [collection-id]
         (let [insert! (fn [slug collection-id]
                         (t2/query-one {:insert-into :data_app
                                        :values      [{:name                   slug
                                                       :display_name           slug
                                                       :bundle_path            "index.js"
                                                       :entity_id              (data-apps.tu/app-entity-id slug)
                                                       :resource_collection_id collection-id
                                                       :created_at             :%now
                                                       :updated_at             :%now}]}))]
           (mt/with-temp [:model/Collection {free-id :id} {:namespace :data-apps}]
             (testing "the same row on a collection no app owns goes in"
               (insert! "sparrows" free-id)
               (is (t2/exists? :model/DataApp :name "sparrows")))
             (is (thrown? Exception (t2/with-transaction [_conn]
                                      (insert! "finches" collection-id))))
             (is (not (t2/exists? :model/DataApp :name "finches"))))))))))

(deftest data-apps-collection-is-root-collection-of-its-namespace-test
  (testing "an app given an existing collection gets it only when it is a plain top-level collection of data apps that
            no other app has"
    (mt/with-premium-features #{:data-apps}
      (mt/with-model-cleanup [:model/DataApp]
        (mt/with-temp [:model/Collection {default-id :id}  {:name "Finance"}
                       :model/Collection {root-id :id}     {:name "Root" :namespace :data-apps}
                       :model/Collection {archived-id :id} {:name "Archived" :namespace :data-apps :archived true}
                       :model/Collection {official-id :id} {:name "Official" :namespace :data-apps :authority_level "official"}
                       :model/Collection {synced-id :id}   {:name "Synced" :namespace :data-apps :is_remote_synced true}]
          (let [app! (fn [slug collection-id]
                       (t2/insert-returning-pk! :model/DataApp {:name                   slug
                                                                :display_name           slug
                                                                :bundle_path            "index.js"
                                                                :resource_collection_id collection-id}))]
            (doseq [[label collection-id] [["a default-namespace collection" default-id]
                                           ["an archived collection" archived-id]
                                           ["an official collection" official-id]]]
              (testing label
                (is (thrown-with-msg? clojure.lang.ExceptionInfo #"must be a top-level collection of data apps"
                                      (app! "refused" collection-id)))))
            (testing "a remote-synced one is fine, as remote sync marks an app's collection"
              (is (pos-int? (app! "synced" synced-id))))
            (testing "a top-level collection of data apps is fine"
              (let [app-id (app! "accepted" root-id)]
                (testing "but not for a second app"
                  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"already belongs to another data app"
                                        (app! "second" root-id))))
                (testing "an app whose collection is gone is given one the same way"
                  (t2/query-one {:update :data_app :set {:resource_collection_id nil} :where [:= :id app-id]})
                  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"must be a top-level collection of data apps"
                                        (t2/update! :model/DataApp app-id {:resource_collection_id default-id})))
                  (t2/update! :model/DataApp app-id {:resource_collection_id root-id})
                  (is (= root-id (t2/select-one-fn :resource_collection_id :model/DataApp :id app-id))))))))))))

(deftest content-of-data-apps-namespace-is-checked-before-its-app-loads-test
  (testing "a load may write a collection's content before the app that owns it, so the namespace decides"
    (mt/with-premium-features #{:data-apps}
      (mt/with-temp [:model/Collection {collection-id :id} {:name "Not yet an app's" :namespace :data-apps}]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"must be built with the query builder"
                              (mt/with-temp [:model/Card _ {:collection_id collection-id
                                                            :dataset_query (lib/native-query (mt/metadata-provider) "SELECT 1")}])))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"can't be archived"
                              (insert-query-action! collection-id "Archived" (lib/native-query (mt/metadata-provider) "SELECT 1")
                                                    {:archived true})))))))

(deftest apps-collection-stays-what-it-was-given-as-test
  (testing "an app's collection can't later be moved, typed or made a sample, but remote sync may sync it and a restore may clear its
            archive marker"
    (do-with-app-collection
     (fn [collection-id]
       (mt/with-temp [:model/Collection {other-id :id} {:name "Other" :namespace :data-apps}]
         (doseq [changes [{:type "library-metrics"} {:is_sample true}
                          {:location (str "/" other-id "/")}]]
           (testing (pr-str changes)
             (is (thrown-with-msg? clojure.lang.ExceptionInfo #"stays a top-level collection of data apps"
                                   (t2/update! :model/Collection collection-id changes)))))
         (t2/update! :model/Collection collection-id {:archive_operation_id nil :is_remote_synced true :description "Birds"})
         (is (true? (t2/select-one-fn :is_remote_synced :model/Collection :id collection-id)))
         (is (= "Birds" (t2/select-one-fn :description :model/Collection :id collection-id))))))))

(deftest moving-action-into-apps-collection-is-checked-test
  (testing "an action moved into an app's collection, as a pull may move one, meets the same rules as one created there"
    (do-with-app-collection
     (fn [collection-id]
       (mt/with-temp [:model/Collection {other-id :id} {:namespace :data-actions}
                      :model/Card       {card-id :id}  {:name "Elsewhere"}]
         (let [query (lib/native-query (mt/metadata-provider) "UPDATE venues SET name = {{name}}")]
           (doseq [[label columns message] [["archived" {:archived true} #"can't be archived"]
                                            ["public" {:public_uuid (str (random-uuid)) :made_public_by_id (mt/user->id :crowberto)}
                                             #"can't be made public"]
                                            ["taking parameter values from a card"
                                             {:parameters [{:id "name" :slug "name" :type :string/=
                                                            :values_source_type "card"
                                                            :values_source_config {:card_id card-id}}]}
                                             #"can't take a parameter's values from a card"]]]
             (testing label
               (let [action-id (insert-query-action! other-id (str "Moved " label) query columns)]
                 (is (thrown-with-msg? clojure.lang.ExceptionInfo message
                                       (t2/update! :model/Action action-id {:collection_id collection-id})))
                 (is (= other-id (t2/select-one-fn :collection_id :model/Action :id action-id))))))))
       (testing "an action of a model"
         (mt/with-actions-enabled
           (mt/with-temp [:model/Collection {model-coll :id} {:name "Models"}
                          :model/Card       {model-id :id}   {:type :model :collection_id model-coll
                                                              :dataset_query (data-apps.tu/venues-query)}]
             (let [action-id (t2/insert-returning-pk! :model/Action {:name "Of a model" :type :query :model_id model-id
                                                                     :creator_id (mt/user->id :crowberto)})]
               (t2/insert! :model/QueryAction {:action_id action-id :database_id (mt/id)
                                               :dataset_query (lib/native-query (mt/metadata-provider) "SELECT 1")})
               (is (thrown-with-msg? clojure.lang.ExceptionInfo #"goes in the model's collection"
                                     (t2/update! :model/Action action-id {:collection_id collection-id})))
               (is (= model-coll (t2/select-one-fn :collection_id :model/Action :id action-id)))))))))))

(deftest card-in-apps-collection-reads-only-published-tables-through-its-macros-test
  (testing "segments, measures and remapped columns count as reads of the tables they reach"
    (do-with-app-collection
     (fn [collection-id]
       (data-apps.tu/with-published-tables! [(mt/id :venues)]
         (let [mp           (mt/metadata-provider)
               venues       (lib/query mp (lib.metadata/table mp (mt/id :venues)))
               category     (some #(when (= (mt/id :categories :name) (:id %)) %) (lib/filterable-columns venues))
               save!        (fn [query]
                              (mt/with-temp [:model/Card _ {:name "Saved" :collection_id collection-id :dataset_query query}]))]
           (mt/with-temp [:model/Segment {segment-id :id} {:name       "Bars"
                                                           :table_id   (mt/id :venues)
                                                           :definition (lib/filter venues (lib/= category "Bar"))}
                          :model/Measure {measure-id :id} {:name       "Categories"
                                                           :table_id   (mt/id :venues)
                                                           :definition (lib/aggregate venues (lib/distinct category))}]
             (let [mp (mt/metadata-provider)]
               (testing "a segment that filters on an unpublished table"
                 (is (thrown-with-msg? clojure.lang.ExceptionInfo #"not CATEGORIES"
                                       (save! (lib/filter venues (lib.metadata/segment mp segment-id))))))
               (testing "a measure that aggregates one"
                 (is (thrown-with-msg? clojure.lang.ExceptionInfo #"not CATEGORIES"
                                       (save! (lib/aggregate venues (lib.metadata/measure mp measure-id))))))))
           (testing "a column remapped to an unpublished table's column"
             (mt/with-temp [:model/Dimension _ {:field_id                (mt/id :venues :category_id)
                                                :name                    "Category"
                                                :type                    :external
                                                :human_readable_field_id (mt/id :categories :name)}]
               (is (thrown-with-msg? clojure.lang.ExceptionInfo #"not CATEGORIES"
                                     (save! (lib/query (mt/metadata-provider)
                                                       (lib.metadata/table (mt/metadata-provider) (mt/id :venues))))))))))))))

(deftest card-in-apps-collection-stays-editable-after-its-table-is-unpublished-test
  (testing "a later change that leaves the query alone keeps working; one that changes it is checked again"
    (do-with-app-collection
     (fn [collection-id]
       (let [card-id (data-apps.tu/with-published-tables! [(mt/id :venues)]
                       (t2/insert-returning-pk! :model/Card {:name                   "Venues"
                                                             :display                "table"
                                                             :visualization_settings {}
                                                             :creator_id             (mt/user->id :crowberto)
                                                             :collection_id          collection-id
                                                             :dataset_query          (data-apps.tu/venues-query)}))]
         (t2/update! :model/Card card-id {:name "Renamed" :description "Still venues"})
         (is (= "Renamed" (t2/select-one-fn :name :model/Card :id card-id)))
         (is (thrown-with-msg? clojure.lang.ExceptionInfo #"not VENUES"
                               (t2/update! :model/Card card-id {:dataset_query (lib/limit (data-apps.tu/venues-query) 10)}))))))))

(deftest card-in-apps-collection-is-in-no-document-test
  (testing "a card that belongs to a document elsewhere can't be in an app's collection"
    (do-with-app-collection
     (fn [collection-id]
       (data-apps.tu/with-published-tables! [(mt/id :venues)]
         (mt/with-temp [:model/Document {document-id :id} {:name "Notes"}]
           (is (thrown-with-msg? clojure.lang.ExceptionInfo #"in no dashboard or document"
                                 (t2/insert! :model/Card {:name                   "In a document"
                                                          :display                "table"
                                                          :visualization_settings {}
                                                          :creator_id             (mt/user->id :crowberto)
                                                          :collection_id          collection-id
                                                          :document_id            document-id
                                                          :dataset_query          (data-apps.tu/venues-query)})))))))))

(deftest refusals-name-cards-test
  (testing "a refusal names a card by its name, not only by its id on this instance"
    (do-with-app-collection
     (fn [collection-id]
       (data-apps.tu/with-published-tables! [(mt/id :venues)]
         (mt/with-temp [:model/Card {card-id :id} {:name "Venues elsewhere" :dataset_query (data-apps.tu/venues-query)}]
           (let [message (try (mt/with-temp [:model/Card _ {:collection_id collection-id
                                                            :dataset_query (lib/query (mt/metadata-provider)
                                                                                      (lib.metadata/card (mt/metadata-provider) card-id))}])
                              nil
                              (catch clojure.lang.ExceptionInfo e (ex-message e)))]
             (is (str/includes? message (format "\"Venues elsewhere\" (%d)" card-id))))))))))

(ns metabase-enterprise.data-apps.invariants-test
  "What a data app's collection may hold, enforced by the model hooks, so a write through Toucan, which is what a
  remote-sync pull does, is refused like an API call."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.test-util :as data-apps.tu]
   [metabase.lib.core :as lib]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- do-with-app-collection
  "Call `f` with the id of a data app's resource collection."
  [f]
  ;; deleting the app deletes its collection with what it holds
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

(deftest a-card-in-an-apps-collection-holds-a-query-test
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

(deftest an-action-in-an-apps-collection-is-neither-archived-nor-public-test
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
             (is (pos-int? (insert-query-action! other-id "Archived elsewhere" query {:archived true}))))))))))

(deftest an-action-in-an-apps-collection-takes-no-values-from-a-card-test
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

(deftest an-action-in-an-apps-collection-reads-only-the-apps-cards-test
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

(deftest an-action-in-an-apps-collection-has-no-implicit-row-test
  (testing "an action in an app's collection is a query action, so it gets no implicit action row"
    (do-with-app-collection
     (fn [collection-id]
       (let [action-id (insert-query-action! collection-id "Query" (lib/native-query (mt/metadata-provider) "SELECT 1"))]
         (is (thrown-with-msg? clojure.lang.ExceptionInfo #"must be a query action"
                               (t2/insert! :model/ImplicitAction {:action_id action-id :kind "row/create"}))))))))

(deftest two-data-apps-cannot-share-a-collection-test
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
             (is (thrown? Exception (insert! "finches" collection-id)))
             (is (not (t2/exists? :model/DataApp :name "finches"))))))))))

(deftest a-data-apps-collection-is-a-root-collection-of-its-namespace-test
  (testing "an app given an existing collection gets it only when it is a plain root collection of the data-apps namespace"
    (mt/with-premium-features #{:data-apps}
      (mt/with-model-cleanup [:model/DataApp]
        (mt/with-temp [:model/Collection {default-id :id}  {:name "Finance"}
                       :model/Collection {root-id :id}     {:name "Root" :namespace :data-apps}
                       :model/Collection {nested-id :id}   {:name     "Nested"
                                                            :namespace :data-apps
                                                            :location (str "/" root-id "/")}
                       :model/Collection {archived-id :id} {:name "Archived" :namespace :data-apps :archived true}]
          (doseq [[label collection-id] [["a default-namespace collection" default-id]
                                         ["a collection inside another" nested-id]
                                         ["an archived collection" archived-id]]]
            (testing label
              (is (thrown-with-msg? clojure.lang.ExceptionInfo #"must be a root collection of the data-apps namespace"
                                    (t2/insert! :model/DataApp {:name                   "refused"
                                                                :display_name           "Refused"
                                                                :bundle_path            "index.js"
                                                                :resource_collection_id collection-id})))))
          (testing "a root collection of the namespace is fine"
            (is (pos-int? (t2/insert-returning-pk! :model/DataApp {:name                   "accepted"
                                                                   :display_name           "Accepted"
                                                                   :bundle_path            "index.js"
                                                                   :resource_collection_id root-id})))))))))

(ns metabase-enterprise.library-branching.gates-test
  "The edit gates of a consumption instance. With library branching on, a read-only instance (a repository URL and
  `remote-sync-type` read-only) refuses an edit, a create and a trash of each item that it syncs, as the scope
  function says. A creation instance, an instance with no repository URL and an instance with library branching off
  refuse nothing for that reason. Reads are never refused."
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase-enterprise.library-branching.gates-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   ;; loads the settings of remote sync, which library branching reuses
   [metabase-enterprise.core.init]
   [metabase-enterprise.library-branching.repository-test-util :refer [with-settings]]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.permissions.models.permissions :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(def ^:private url "https://git.example.com/library.git")

(defmacro ^:private as
  "Runs `body` on an instance of `role`: `:consumption` (library branching on, read-only), `:creation` (library
  branching on, read-write), `:no-url` (library branching on, read-only, no repository URL) or `:off` (library
  branching off, read-only with a URL)."
  [role & body]
  `(let [role# ~role]
     (mt/with-temporary-setting-values [~'library-branching-enabled (not= :off role#)]
       (with-settings {:remote-sync-url    (when-not (= :no-url role#) url)
                       :remote-sync-branch "main"
                       :remote-sync-type   (if (= :creation role#) :read-write :read-only)}
         ~@body))))

(def ^:private roles [:consumption :creation :no-url :off])

(defn- prose [text]
  {:type "doc" :content [{:type "paragraph" :content [{:type "text" :text text}]}]})

(defn- do-with-library-content
  "Calls `(f m)` with temporary content: `m` holds the Library tree (`:library`, `:data`, `:metrics`), a Library
  sub-collection `:inner` with a collection `:nested` in it, a card, a dashboard and a document in each, a regular
  collection `:regular` with a card, a dashboard and a document, and a card `:root-card` at the root level."
  [f]
  (collections.tu/with-library [{:keys [library] :as tree}]
    (mt/with-temp [:model/Collection inner      {:name "Dashboards" :type "library-dashboards"
                                                 :location (str (:location library) (:id library) "/")}
                   :model/Collection nested     {:name "Nested" :type "library-dashboards"
                                                 :location (str (:location inner) (:id inner) "/")}
                   :model/Collection regular    {:name "Regular"}
                   :model/Card       inner-card {:name "Inner card" :collection_id (:id inner)
                                                 :dataset_query (mt/native-query {:query "SELECT 1"})}
                   :model/Card       nested-card {:name "Nested card" :collection_id (:id nested)
                                                  :dataset_query (mt/native-query {:query "SELECT 1"})}
                   :model/Card       regular-card {:name "Regular card" :collection_id (:id regular)
                                                   :dataset_query (mt/native-query {:query "SELECT 1"})}
                   :model/Card       root-card  {:name "Root card" :collection_id nil
                                                 :dataset_query (mt/native-query {:query "SELECT 1"})}
                   :model/Dashboard  inner-dash {:name "Inner dashboard" :collection_id (:id inner)}
                   :model/Dashboard  nested-dash {:name "Nested dashboard" :collection_id (:id nested)}
                   :model/Dashboard  regular-dash {:name "Regular dashboard" :collection_id (:id regular)}
                   :model/Document   inner-doc  {:name "Inner document" :document (prose "inner")
                                                 :collection_id (:id inner)}
                   :model/Document   nested-doc {:name "Nested document" :document (prose "nested")
                                                 :collection_id (:id nested)}
                   :model/Document   regular-doc {:name "Regular document" :document (prose "regular")
                                                  :collection_id (:id regular)}]
      (f (assoc tree
                :inner inner :nested nested :regular regular
                :synced  {:inner-card inner-card :nested-card nested-card :inner-dash inner-dash
                          :nested-dash nested-dash :inner-doc inner-doc :nested-doc nested-doc}
                :outside {:regular-card regular-card :root-card root-card :regular-dash regular-dash
                          :regular-doc regular-doc})))))

(defn- writable? [model row]
  (mi/can-write? (t2/select-one model :id (:id row))))

(def ^:private models
  {:inner-card :model/Card :nested-card :model/Card :regular-card :model/Card :root-card :model/Card
   :inner-dash :model/Dashboard :nested-dash :model/Dashboard :regular-dash :model/Dashboard
   :inner-doc :model/Document :nested-doc :model/Document :regular-doc :model/Document})

;;; ----------------------------------------------- Collections and items ----------------------------------------------

(deftest library-content-is-read-only-on-a-consumption-instance-test
  (do-with-library-content
   (fn [{:keys [library inner nested regular synced outside]}]
     (doseq [user [:crowberto :rasta]
             role roles]
       (testing (str user " on an instance of the role " role)
         (as role
             (mt/with-current-user (mt/user->id user)
               (let [gated? (= :consumption role)]
                 (testing "the cards, dashboards and documents of the Library tree, nested ones too"
                   (doseq [[k row] synced]
                     (testing k
                       (is (= (not gated?) (writable? (models k) row))))))
                 (testing "the collections of the Library tree, the Library itself too"
                   (doseq [c [library inner nested]]
                     (testing (:name c)
                       (is (= (not gated?) (writable? :model/Collection c))))))
                 (testing "content outside the Library, and at the root level, stays writable"
                   (doseq [[k row] outside]
                     (testing k
                       (is (true? (writable? (models k) row)))))
                   (is (true? (writable? :model/Collection regular))))
                 (testing "reads are not gated"
                   (is (true? (mi/can-read? (t2/select-one :model/Card :id (:id (:inner-card synced)))))))))))))))

(deftest library-card-edit-through-the-api-test
  (do-with-library-content
   (fn [{:keys [synced outside]}]
     (let [card-id (:id (:inner-card synced))]
       (testing "a consumption instance refuses an edit of a Library card, and the card stays"
         (as :consumption
             (is (= "You don't have permissions to do that."
                    (mt/user-http-request :crowberto :put 403 (str "card/" card-id) {:description "edited"})))
             (is (nil? (t2/select-one-fn :description :model/Card card-id)))
             (testing "a card at the root level can be edited"
               (mt/user-http-request :crowberto :put 200 (str "card/" (:id (:root-card outside))) {:description "root"}))))
       (testing "with library branching off, the edit goes through"
         (as :off
             (mt/user-http-request :crowberto :put 200 (str "card/" card-id) {:description "edited"})))))))

(deftest data-app-question-is-read-only-on-a-consumption-instance-test
  (mt/with-temp [:model/Collection app  {:name "App" :namespace "data-apps" :location "/"}
                 :model/Card       card {:name "App question" :collection_id (:id app)
                                         :dataset_query (mt/native-query {:query "SELECT 1"})}]
    (testing "a question of a data app's collection: refused on a consumption instance, allowed with the module off"
      (as :consumption
          (mt/user-http-request :crowberto :put 403 (str "card/" (:id card)) {:description "edited here"}))
      (as :off
          (mt/user-http-request :crowberto :put 200 (str "card/" (:id card)) {:description "edited without sync"})))))

(deftest cache-policy-of-a-library-dashboard-test
  (do-with-library-content
   (fn [{:keys [synced]}]
     (let [dash-id (:id (:inner-dash synced))]
       (as :consumption
           (testing "a cache policy is instance state, not content: a consumption instance takes it"
             (mt/with-model-cleanup [:model/CacheConfig]
               (mt/with-premium-features #{:cache-granular-controls}
                 (is (=? {:id pos-int?}
                         (mt/user-http-request :crowberto :put 200 "cache/"
                                               {:model "dashboard" :model_id dash-id :strategy {:type "nocache"}}))))))
           (testing "the dashboard is not writable, and its cache policy can be set"
             (let [response (mt/user-http-request :crowberto :get 200 (format "dashboard/%d" dash-id))]
               (is (false? (:can_write response)))
               (is (true? (:can_set_cache_policy response))))))))))

;;; ------------------------------------------ Published tables and their parts ----------------------------------------

(defn- do-with-published-venues
  "Calls `f` while the table venues is published in collection `collection-id` (nil: not published)."
  [collection-id f]
  (let [table-id (mt/id :venues)]
    (t2/update! :model/Table table-id {:is_published (some? collection-id) :collection_id collection-id})
    (try
      (f table-id)
      (finally
        (t2/update! :model/Table table-id {:is_published false :collection_id nil})))))

(deftest published-table-is-read-only-on-a-consumption-instance-test
  (collections.tu/with-library [{:keys [data]}]
    (mt/with-temp [:model/Collection regular {:name "Regular"}]
      (mt/with-current-user (mt/user->id :crowberto)
        (doseq [role roles]
          (testing (str "an instance of the role " role)
            (as role
                (let [gated? (= :consumption role)]
                  (testing "a table published in the Library, its fields, its segments, and a new segment on it"
                    (do-with-published-venues
                     (:id data)
                     (fn [table-id]
                       (is (= (not gated?) (mi/can-write? (t2/select-one :model/Table :id table-id))))
                       (is (= (not gated?) (mi/can-write? (t2/select-one :model/Field :id (mt/id :venues :name)))))
                       (mt/with-temp [:model/Segment segment {:name "Cheap" :table_id table-id :definition {}}]
                         (is (= (not gated?) (mi/can-write? (t2/select-one :model/Segment :id (:id segment))))))
                       (is (= (not gated?) (mi/can-create? :model/Segment {:table_id   table-id
                                                                           :table      (t2/select-one :model/Table :id table-id)
                                                                           :name       "New segment"
                                                                           :definition {}}))))))
                  (testing "a table published in a regular collection stays writable"
                    (do-with-published-venues
                     (:id regular)
                     (fn [table-id]
                       (is (true? (mi/can-write? (t2/select-one :model/Table :id table-id)))))))))))))))

;;; ---------------------------------------------------- Transforms ----------------------------------------------------

(defn- transform-row [collection-id]
  {:name          "Transform"
   :collection_id collection-id
   :source        {:type "query" :query (lib/native-query (mt/metadata-provider) "SELECT 1")}
   :target        {:database (mt/id) :type "table" :schema "public" :name "lb_gates_target"}})

(deftest transforms-are-read-only-on-a-consumption-instance-test
  (mt/with-premium-features #{:transforms-basic}
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Transforms" :namespace :transforms}
                   :model/Transform  {transform-id :id} (transform-row coll-id)]
      (mt/with-current-user (mt/user->id :crowberto)
        (doseq [role roles]
          (testing (str "an instance of the role " role)
            (as role
                (let [gated? (= :consumption role)]
                  (is (= (not gated?) (mi/can-write? (t2/select-one :model/Transform :id transform-id))))
                  (is (= (not gated?) (mi/can-create? :model/Transform (transform-row coll-id))))
                  (is (true? (mi/can-read? (t2/select-one :model/Transform :id transform-id))))))))))
    (testing "PUT and DELETE of a transform give 403 on a consumption instance, and the transform stays"
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Transforms" :namespace :transforms}
                     :model/Transform  {transform-id :id} (assoc (transform-row coll-id) :name "Read-only")]
        (as :consumption
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :crowberto :put 403 (str "transform/" transform-id) {:name "renamed"})))
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :crowberto :delete 403 (str "transform/" transform-id))))
            (is (= "Read-only" (t2/select-one-fn :name :model/Transform :id transform-id))))))))

;;; ----------------------------------------------------- Glossary -----------------------------------------------------

(deftest glossary-is-read-only-on-a-consumption-instance-test
  (mt/with-model-cleanup [:model/Glossary]
    (mt/with-temp [:model/Glossary {id :id} {:term "ARR" :definition "Annual recurring revenue"}]
      (testing "a consumption instance refuses POST, PUT and DELETE, and changes nothing"
        (as :consumption
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :crowberto :post 403 "glossary" {:term "MRR" :definition "Monthly recurring revenue"})))
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :crowberto :put 403 (str "glossary/" id) {:term "ARR" :definition "changed"})))
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :crowberto :delete 403 (str "glossary/" id))))
            (is (= "Annual recurring revenue" (t2/select-one-fn :definition :model/Glossary :id id)))
            (testing "GET works and says that the glossary is not writable"
              (let [response (mt/user-http-request :crowberto :get 200 "glossary")]
                (is (some #(= id (:id %)) (:data response)))
                (is (false? (:can_write response)))))))
      (testing "a creation instance takes the edit"
        (as :creation
            (is (true? (:can_write (mt/user-http-request :crowberto :get 200 "glossary"))))
            (is (= "edited" (:definition (mt/user-http-request :crowberto :put 200 (str "glossary/" id)
                                                               {:term "ARR" :definition "edited"})))))))))

;;; ----------------------------------------------------- Snippets -----------------------------------------------------

(defn- do-with-snippet-collection
  "Calls `(f collection snippet)` with a snippets collection that all users can read and write, a snippet in it, and
  native query permissions for all users."
  [f]
  (mt/with-premium-features #{:snippet-collections}
    (mt/with-non-admin-groups-no-root-collection-for-namespace-perms "snippets"
      (mt/with-temp [:model/Collection collection {:name "Snippets" :namespace "snippets"}
                     :model/NativeQuerySnippet snippet {:name "Original" :content "SELECT 1"
                                                        :collection_id (:id collection)}]
        (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder-and-native)
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
        (f collection snippet)))))

(deftest snippets-are-read-only-on-a-consumption-instance-test
  (do-with-snippet-collection
   (fn [collection snippet]
     (let [path (format "native-query-snippet/%d" (:id snippet))]
       (testing "a consumption instance refuses a create, a rename and a trash"
         (as :consumption
             (let [snippet-name (mt/random-name)]
               (is (= "You don't have permissions to do that."
                      (mt/user-http-request :rasta :post 403 "native-query-snippet"
                                            {:name snippet-name :content "SELECT 1" :collection_id (:id collection)})))
               (is (not (t2/exists? :model/NativeQuerySnippet :name snippet-name))))
             (is (= "You don't have permissions to do that."
                    (mt/user-http-request :rasta :put 403 path {:name "Renamed"})))
             (is (= "You don't have permissions to do that."
                    (mt/user-http-request :rasta :put 403 path {:archived true})))
             (is (=? {:name "Original" :archived false} (t2/select-one :model/NativeQuerySnippet :id (:id snippet))))
             (testing "a read and a list work"
               (is (= "Original" (:name (mt/user-http-request :rasta :get 200 path))))
               (is (some #(= (u/the-id snippet) (:id %)) (mt/user-http-request :rasta :get 200 "native-query-snippet"))))))
       (doseq [role [:creation :off]]
         (testing (str "an instance of the role " role " takes a create and a rename")
           (as role
               (let [snippet-name (mt/random-name)]
                 (try
                   (is (= snippet-name (:name (mt/user-http-request :rasta :post 200 "native-query-snippet"
                                                                    {:name snippet-name :content "SELECT 1"
                                                                     :collection_id (:id collection)}))))
                   (finally
                     (t2/delete! :model/NativeQuerySnippet :name snippet-name))))
               (is (= "Renamed" (:name (mt/user-http-request :rasta :put 200 path {:name "Renamed"}))))
               (t2/update! :model/NativeQuerySnippet (:id snippet) {:name "Original"}))))))))

;;; --------------------------------------------- Data actions and data apps -------------------------------------------

(deftest data-actions-are-read-only-on-a-consumption-instance-test
  (mt/with-temp [:model/Collection {app-coll :id}    {:name "App" :namespace "data-apps" :location "/"}
                 :model/Action     {root-action :id} {:type :query :name "At root"}
                 :model/Action     {app-action :id}  {:type :query :name "App copy" :collection_id app-coll}]
    (mt/with-current-user (mt/user->id :crowberto)
      (testing "a consumption instance: neither a data action at the root nor a data app's action is writable"
        (as :consumption
            (is (false? (mi/can-write? (t2/select-one :model/Action :id root-action))))
            (is (false? (mi/can-write? (t2/select-one :model/Action :id app-action))))))
      (testing "a creation instance: a data action at the root is writable"
        (as :creation
            (is (true? (mi/can-write? (t2/select-one :model/Action :id root-action)))))))))

;;; ---------------------------------------------- The hooks, one by one -----------------------------------------------

(deftest model-editable-hooks-test
  (testing "a data app: not editable on a consumption instance; editable with no URL and on a creation instance"
    (as :consumption
        (is (false? (remote-sync/model-editable? :model/DataApp {})))
        (is (= {1 false} (remote-sync/batch-model-editable? :model/DataApp [{:id 1}]))))
    (doseq [role [:no-url :creation :off]]
      (as role
          (is (true? (remote-sync/model-editable? :model/DataApp {})))
          (is (= {1 true} (remote-sync/batch-model-editable? :model/DataApp [{:id 1}]))))))
  (testing "a new transform and a new snippet at the root level are in scope: not editable on a consumption instance"
    (as :consumption
        (is (false? (remote-sync/model-editable? :model/Transform nil)))
        (is (false? (remote-sync/model-editable? :model/NativeQuerySnippet nil)))
        (is (false? (remote-sync/transforms-editable?)))
        (is (false? (remote-sync/model-editable? :model/Glossary nil)))))
  (testing "a model with no kind is editable"
    (as :consumption
        (is (true? (remote-sync/model-editable? :model/UnknownModel {})))
        (is (= {1 true} (remote-sync/batch-model-editable? :model/UnknownModel [{:id 1}])))))
  (testing "a card by its collection: in the Library, not editable; in a regular collection, editable"
    (collections.tu/with-library [{:keys [metrics]}]
      (mt/with-temp [:model/Collection regular {:name "Regular"}]
        (as :consumption
            (is (false? (remote-sync/model-editable? :model/Card {:collection_id (:id metrics)})))
            (is (true? (remote-sync/model-editable? :model/Card {:collection_id (:id regular)})))
            (is (true? (remote-sync/collection-editable? nil))))))))

(deftest batch-of-snippets-test
  (mt/with-temp [:model/Collection outside {:name "Outside" :namespace "snippets"}
                 :model/NativeQuerySnippet a {:name "lb gates a" :content "1"}
                 :model/NativeQuerySnippet b {:name "lb gates b" :content "2" :collection_id (:id outside)}
                 :model/NativeQuerySnippet c {:name "lb gates c" :content "3" :archived true}]
    (testing "a consumption instance: every snippet in scope is not editable; a trashed one is out of scope"
      (as :consumption
          (is (= {(:id a) false (:id b) false (:id c) true}
                 (remote-sync/batch-model-editable? :model/NativeQuerySnippet [a b c])))))
    (testing "a creation instance: every snippet is editable"
      (as :creation
          (is (= {(:id a) true (:id b) true (:id c) true}
                 (remote-sync/batch-model-editable? :model/NativeQuerySnippet [a b c])))))))

(ns metabase-enterprise.library-branching.scope-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase-enterprise.library-branching.snapshot :as snapshot]
   [metabase.collections.core :as collections]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- membership
  "`{label in-scope?}` for `items`, `{label [kind identity]}`, at one read of scope."
  [items]
  (let [ids (scope/scope-ids)]
    (update-vals items (fn [[kind id]] (contains? (get ids kind) id)))))

(defn- children-location
  [{:keys [id location]}]
  (str location id "/"))

(defn- table-identity
  [table]
  [(t2/select-one-fn :name :model/Database (:db_id table)) (:schema table) (:name table)])

(defn- venues-query []
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id :venues)))))

(defn- metric-query []
  (lib/aggregate (venues-query) (lib/count)))

(defn- card-query
  [card-id]
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/card mp card-id))))

(defn- archive-collection!
  [collection]
  (mt/with-current-user (mt/user->id :crowberto)
    (collections/archive-or-unarchive-collection! (t2/select-one :model/Collection (:id collection)) {:archived true})))

(deftest kinds-test
  (testing "every kind of the snapshot is a kind of scope"
    (is (set/subset? snapshot/kinds scope/kinds)))
  (testing "each kind of scope has its query"
    (is (= scope/kinds (set (keys (methods scope/kind-query))))))
  (testing "each kind at a namespace root is a kind of scope, and each such namespace is a root"
    (is (set/subset? (set (keys (:root-level scope/roots))) scope/kinds))
    (is (set/subset? (set (vals (:root-level scope/roots))) (:namespaces scope/roots)))))

(deftest library-tree-test
  (testing "the Library, its collections at every depth and their items are in scope"
    (collections.tu/with-library [{:keys [library data metrics]}]
      (mt/with-temp [:model/Collection revenue    {:name     "Revenue"
                                                   :type     collections/library-metrics-collection-type
                                                   :location (children-location metrics)}
                     :model/Collection quarterly  {:name     "Quarterly"
                                                   :type     collections/library-metrics-collection-type
                                                   :location (children-location revenue)}
                     :model/Card       metric     {:name          "Total revenue"
                                                   :type          :metric
                                                   :collection_id (:id quarterly)
                                                   :dataset_query (metric-query)}
                     :model/Collection dashboards {:name     "Dashboards"
                                                   :type     collections/library-dashboards-collection-type
                                                   :location (children-location library)}
                     :model/Dashboard  dashboard  {:name "Overview" :collection_id (:id dashboards)}
                     :model/Card       question   {:name          "Orders by day"
                                                   :collection_id (:id dashboards)
                                                   :dashboard_id  (:id dashboard)}
                     :model/Table      table      {:db_id         (mt/id)
                                                   :schema        "PUBLIC"
                                                   :name          "lb_scope_orders"
                                                   :is_published  true
                                                   :collection_id (:id data)}]
        (is (= {:library    true
                :data       true
                :metrics    true
                :revenue    true
                :quarterly  true
                :dashboards true
                :metric     true
                :dashboard  true
                :question   true
                :table      true}
               (membership {:library    [:collection (:entity_id library)]
                            :data       [:collection (:entity_id data)]
                            :metrics    [:collection (:entity_id metrics)]
                            :revenue    [:collection (:entity_id revenue)]
                            :quarterly  [:collection (:entity_id quarterly)]
                            :dashboards [:collection (:entity_id dashboards)]
                            :metric     [:metric (:entity_id metric)]
                            :dashboard  [:dashboard (:entity_id dashboard)]
                            :question   [:question (:entity_id question)]
                            :table      [:published-table (table-identity table)]})))))))

(deftest trash-test
  (testing "a trashed collection, its children and their items are out of scope, and so is a trashed item"
    (collections.tu/with-library [{:keys [metrics]}]
      (mt/with-temp [:model/Collection trashed {:name     "Old"
                                                :type     collections/library-metrics-collection-type
                                                :location (children-location metrics)}
                     :model/Collection child   {:name     "Older"
                                                :type     collections/library-metrics-collection-type
                                                :location (children-location trashed)}
                     :model/Card       inside  {:name          "Old revenue"
                                                :type          :metric
                                                :collection_id (:id child)
                                                :dataset_query (metric-query)}
                     :model/Card       direct  {:name          "Trashed revenue"
                                                :type          :metric
                                                :collection_id (:id metrics)
                                                :archived      true
                                                :dataset_query (metric-query)}
                     :model/Card       live    {:name          "Live revenue"
                                                :type          :metric
                                                :collection_id (:id metrics)
                                                :dataset_query (metric-query)}]
        (archive-collection! trashed)
        (is (= {:trashed false :child false :inside false :direct false :live true}
               (membership {:trashed [:collection (:entity_id trashed)]
                            :child   [:collection (:entity_id child)]
                            :inside  [:metric (:entity_id inside)]
                            :direct  [:metric (:entity_id direct)]
                            :live    [:metric (:entity_id live)]})))))))

(deftest outside-library-test
  (testing "content outside the Library is out of scope, also when it uses a Library item"
    (collections.tu/with-library [{:keys [data metrics]}]
      (mt/with-temp [:model/Card       metric      {:name          "Total revenue"
                                                    :type          :metric
                                                    :collection_id (:id metrics)
                                                    :dataset_query (metric-query)}
                     :model/Collection other       {:name "Team"}
                     :model/Collection other-child {:name "Team child" :location (children-location other)}
                     :model/Card       user        {:name          "Revenue by month"
                                                    :collection_id (:id other)
                                                    :dataset_query (card-query (:id metric))}
                     :model/Dashboard  dashboard   {:name "Team overview" :collection_id (:id other)}
                     :model/Card       personal    {:name          "Rasta's revenue"
                                                    :type          :metric
                                                    :collection_id (collections.tu/personal-collection-id
                                                                    (mt/user->id :rasta))
                                                    :dataset_query (metric-query)}
                     :model/Card       root-card   {:name "At the root" :collection_id nil}
                     :model/Table      unpublished {:db_id         (mt/id)
                                                    :schema        "PUBLIC"
                                                    :name          "lb_scope_unpublished"
                                                    :is_published  false
                                                    :collection_id (:id data)}]
        (is (= {:metric      true
                :other       false
                :other-child false
                :user        false
                :dashboard   false
                :personal    false
                :personal-c  false
                :root-card   false
                :unpublished false}
               (membership {:metric      [:metric (:entity_id metric)]
                            :other       [:collection (:entity_id other)]
                            :other-child [:collection (:entity_id other-child)]
                            :user        [:question (:entity_id user)]
                            :dashboard   [:dashboard (:entity_id dashboard)]
                            :personal    [:metric (:entity_id personal)]
                            :personal-c  [:collection (:entity_id (collections.tu/personal-collection
                                                                   (mt/user->id :rasta)))]
                            :root-card   [:question (:entity_id root-card)]
                            :unpublished [:published-table (table-identity unpublished)]})))))))

(deftest moved-out-of-library-test
  (testing "a collection that leaves the Library leaves scope with its subtree"
    (collections.tu/with-library [{:keys [metrics]}]
      (mt/with-temp [:model/Collection moved {:name     "Moved"
                                              :type     collections/library-metrics-collection-type
                                              :location (children-location metrics)}
                     :model/Collection child {:name     "Moved child"
                                              :type     collections/library-metrics-collection-type
                                              :location (children-location moved)}]
        (is (= {:moved true :child true}
               (membership {:moved [:collection (:entity_id moved)]
                            :child [:collection (:entity_id child)]})))
        ;; The Library refuses this move through the API; the update of the table rows gives the moved state.
        (t2/update! :collection (:id moved) {:location "/"})
        (t2/update! :collection (:id child) {:location (str "/" (:id moved) "/")})
        (is (= {:moved false :child false}
               (membership {:moved [:collection (:entity_id moved)]
                            :child [:collection (:entity_id child)]})))))))

(deftest namespace-roots-test
  (testing "the collections of the namespace roots and the items at those roots are in scope"
    (mt/with-temp [:model/Collection transforms     {:name "Finance" :namespace "transforms"}
                   :model/Transform  in-folder      {:name "Daily orders" :collection_id (:id transforms)}
                   :model/Transform  at-root        {:name "Weekly orders" :collection_id nil}
                   :model/Collection old-transforms {:name "Old finance" :namespace "transforms"}
                   :model/Transform  in-old         {:name "Old orders" :collection_id (:id old-transforms)}
                   :model/Collection snippets       {:name "Filters" :namespace "snippets"}
                   :model/NativeQuerySnippet snippet-in {:name "lb active filter" :collection_id (:id snippets)}
                   :model/NativeQuerySnippet snippet-root {:name "lb root filter" :collection_id nil}
                   :model/NativeQuerySnippet snippet-trash {:name "lb old filter" :collection_id nil :archived true}
                   :model/Collection actions        {:name "Refunds" :namespace "data-actions"}
                   :model/Action     action-root    {:name "Refund" :type :http :collection_id nil}
                   :model/Action     action-in      {:name "Refund all" :type :http :collection_id (:id actions)}
                   :model/Collection app-collection {:name "Sales portal" :namespace "data-apps"}
                   :model/Action     action-app     {:name "Approve" :type :http :collection_id (:id app-collection)}
                   :model/Card       model          {:name "Orders model" :type :model :dataset_query (venues-query)}
                   :model/Action     model-action   {:name "Model refund" :type :http :model_id (:id model)}
                   :model/DataApp    app            {}
                   :model/TransformTag tag          {:name "lb custom tag"}
                   :model/TransformJob job          {:name "lb custom job"}
                   :model/PythonLibrary library     {:path "lb_helpers.py" :source "x = 1"}]
      (archive-collection! old-transforms)
      (let [built-in-tag (t2/select-one :model/TransformTag :built_in_type [:not= nil])
            built-in-job (t2/select-one :model/TransformJob :built_in_type [:not= nil])
            common       (t2/select-one :model/PythonLibrary :path "common.py")]
        (is (= (cond-> {:transforms     true
                        :in-folder      true
                        :at-root        true
                        :old-transforms false
                        :in-old         false
                        :snippets       true
                        :snippet-in     true
                        :snippet-root   true
                        :snippet-trash  false
                        :actions        true
                        :action-root    true
                        :action-in      true
                        :app-collection true
                        :action-app     true
                        :model-action   false
                        :app            true
                        :tag            true
                        :job            true
                        :library        true}
                 built-in-tag (assoc :built-in-tag false)
                 built-in-job (assoc :built-in-job false)
                 common       (assoc :common true))
               (membership (cond-> {:transforms     [:collection (:entity_id transforms)]
                                    :in-folder      [:transform (:entity_id in-folder)]
                                    :at-root        [:transform (:entity_id at-root)]
                                    :old-transforms [:collection (:entity_id old-transforms)]
                                    :in-old         [:transform (:entity_id in-old)]
                                    :snippets       [:collection (:entity_id snippets)]
                                    :snippet-in     [:snippet (:entity_id snippet-in)]
                                    :snippet-root   [:snippet (:entity_id snippet-root)]
                                    :snippet-trash  [:snippet (:entity_id snippet-trash)]
                                    :actions        [:collection (:entity_id actions)]
                                    :action-root    [:action (:entity_id action-root)]
                                    :action-in      [:action (:entity_id action-in)]
                                    :app-collection [:collection (:entity_id app-collection)]
                                    :action-app     [:action (:entity_id action-app)]
                                    :model-action   [:action (:entity_id model-action)]
                                    :app            [:data-app (:entity_id app)]
                                    :tag            [:transform-tag (:entity_id tag)]
                                    :job            [:transform-job (:entity_id job)]
                                    :library        [:python-library (:entity_id library)]}
                             built-in-tag (assoc :built-in-tag [:transform-tag (:entity_id built-in-tag)])
                             built-in-job (assoc :built-in-job [:transform-job (:entity_id built-in-job)])
                             common       (assoc :common [:python-library (:entity_id common)])))))))))

(deftest exploration-document-test
  (testing "a document in the Library is in scope; the summary document of an exploration is not"
    (collections.tu/with-library [{:keys [metrics]}]
      (mt/with-temp [:model/Exploration exploration {}
                     :model/Document    document    {:name "Q3 review"}
                     :model/Document    summary     {:name "Summary" :exploration_id (:id exploration)}]
        ;; The Library's own sections refuse documents through the model; the update gives the state.
        (t2/update! :document :id [:in [(:id document) (:id summary)]] {:collection_id (:id metrics)})
        (is (= {:document true :summary false}
               (membership {:document [:document (:entity_id document)]
                            :summary  [:document (:entity_id summary)]})))))))

(deftest count-test
  (testing "the count of each kind is the size of the scope of that kind"
    (collections.tu/with-library [{:keys [metrics]}]
      (mt/with-temp [:model/Collection transforms {:name "Finance" :namespace "transforms"}
                     :model/Transform  _          {:name "Daily orders" :collection_id (:id transforms)}
                     :model/Card       _          {:name          "Total revenue"
                                                   :type          :metric
                                                   :collection_id (:id metrics)
                                                   :dataset_query (metric-query)}
                     :model/NativeQuerySnippet _  {:name "lb count filter" :collection_id nil}]
        (let [counts (scope/scope-count)]
          (is (= scope/kinds (set (keys counts))))
          (is (= (update-vals (scope/scope-ids) count) counts))
          (is (<= 1 (:transform counts)))
          (is (<= 1 (:metric counts)))
          (is (<= 1 (:snippet counts)))))))
  (testing "a read of scope sends one statement per kind"
    (t2/with-call-count [call-count]
      (scope/scope-ids)
      (is (= (count scope/kinds) (call-count))))
    (t2/with-call-count [call-count]
      (scope/scope-count)
      (is (= (count scope/kinds) (call-count))))))

(deftest roots-test
  (testing "scope follows the roots value: without the snippets namespace, its collections and root items leave scope"
    (mt/with-temp [:model/Collection snippets {:name "Filters" :namespace "snippets"}
                   :model/NativeQuerySnippet in-folder {:name "lb roots filter" :collection_id (:id snippets)}
                   :model/NativeQuerySnippet at-root {:name "lb roots root filter" :collection_id nil}]
      (let [in? (fn [roots kind id] (contains? (get (scope/scope-ids roots) kind) id))
            less (update scope/roots :namespaces disj :snippets)]
        (is (= [true true true] [(in? scope/roots :collection (:entity_id snippets))
                                 (in? scope/roots :snippet (:entity_id in-folder))
                                 (in? scope/roots :snippet (:entity_id at-root))]))
        (is (= [false false false] [(in? less :collection (:entity_id snippets))
                                    (in? less :snippet (:entity_id in-folder))
                                    (in? less :snippet (:entity_id at-root))]))
        (is (= (update-vals (scope/scope-ids less) count) (scope/scope-count less))))))
  (testing "without the Library type, the Library leaves scope"
    (collections.tu/with-library [{:keys [library]}]
      (is (not (contains? (:collection (scope/scope-ids (assoc scope/roots :collection-types #{})))
                          (:entity_id library)))))))

(ns metabase-enterprise.remote-sync.core-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase-enterprise.remote-sync.core-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.core :as core]
   [metabase-enterprise.remote-sync.guards :as guards]
   [metabase-enterprise.remote-sync.models.remote-sync-object :as remote-sync.object]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.collections.test-utils :refer [with-library with-library-synced with-library-not-synced]]
   [metabase.events.core :as events]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))
;; Disabling a collection now marks its RemoteSyncObject rows rather than deleting them, so rows seeded by
;; a test outlive it without this — leaking dirty state into every later test.
(use-fixtures :each rs.test/clean-object)

;; bulk-set-remote-sync tests

(deftest bulk-set-remote-sync-enables-single-collection-test
  (testing "bulk-set-remote-sync enables remote sync on a single collection"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :location "/" :is_remote_synced false}]
      (core/bulk-set-remote-sync {coll-id true})
      (is (true? (:is_remote_synced (t2/select-one :model/Collection :id coll-id)))))))

(deftest bulk-set-remote-sync-disables-single-collection-test
  (testing "bulk-set-remote-sync disables remote sync on a single collection"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :location "/" :is_remote_synced true}]
      (core/bulk-set-remote-sync {coll-id false})
      (is (false? (:is_remote_synced (t2/select-one :model/Collection :id coll-id)))))))

(deftest bulk-set-remote-sync-enables-multiple-collections-test
  (testing "bulk-set-remote-sync enables remote sync on multiple collections"
    (mt/with-temp [:model/Collection {coll1-id :id} {:name "Collection 1" :location "/" :is_remote_synced false}
                   :model/Collection {coll2-id :id} {:name "Collection 2" :location "/" :is_remote_synced false}]
      (core/bulk-set-remote-sync {coll1-id true coll2-id true})
      (is (true? (:is_remote_synced (t2/select-one :model/Collection :id coll1-id))))
      (is (true? (:is_remote_synced (t2/select-one :model/Collection :id coll2-id)))))))

(deftest bulk-set-remote-sync-mixed-operations-test
  (testing "bulk-set-remote-sync handles mixed enable/disable operations"
    (mt/with-temp [:model/Collection {coll1-id :id} {:name "Collection 1" :location "/" :is_remote_synced false}
                   :model/Collection {coll2-id :id} {:name "Collection 2" :location "/" :is_remote_synced true}]
      (core/bulk-set-remote-sync {coll1-id true coll2-id false})
      (is (true? (:is_remote_synced (t2/select-one :model/Collection :id coll1-id))))
      (is (false? (:is_remote_synced (t2/select-one :model/Collection :id coll2-id)))))))

(deftest bulk-set-remote-sync-cascades-to-descendants-test
  (testing "bulk-set-remote-sync cascades remote sync to descendant collections when enabling"
    (mt/with-temp [:model/Collection {parent-id :id} {:name "Parent" :location "/" :is_remote_synced false}
                   :model/Collection {child-id :id} {:name "Child" :location (format "/%d/" parent-id) :is_remote_synced false}
                   :model/Collection {grandchild-id :id} {:name "Grandchild" :location (format "/%d/%d/" parent-id child-id) :is_remote_synced false}]
      (core/bulk-set-remote-sync {parent-id true})
      (is (true? (:is_remote_synced (t2/select-one :model/Collection :id parent-id))))
      (is (true? (:is_remote_synced (t2/select-one :model/Collection :id child-id))))
      (is (true? (:is_remote_synced (t2/select-one :model/Collection :id grandchild-id)))))))

(deftest bulk-set-remote-sync-cascades-disable-to-descendants-test
  (testing "bulk-set-remote-sync cascades disable to descendant collections"
    (mt/with-temp [:model/Collection {parent-id :id} {:name "Parent" :location "/" :is_remote_synced true}
                   :model/Collection {child-id :id} {:name "Child" :location (format "/%d/" parent-id) :is_remote_synced true}
                   :model/Collection {grandchild-id :id} {:name "Grandchild" :location (format "/%d/%d/" parent-id child-id) :is_remote_synced true}]
      (core/bulk-set-remote-sync {parent-id false})
      (is (false? (:is_remote_synced (t2/select-one :model/Collection :id parent-id))))
      (is (false? (:is_remote_synced (t2/select-one :model/Collection :id child-id))))
      (is (false? (:is_remote_synced (t2/select-one :model/Collection :id grandchild-id)))))))

(deftest bulk-set-remote-sync-throws-on-non-remote-synced-dependencies-test
  (testing "bulk-set-remote-sync throws when enabling a collection with non-remote-synced dependencies"
    (mt/with-temp [:model/Collection {remote-synced-coll-id :id} {:name "Remote Synced" :location "/" :is_remote_synced false}
                   :model/Collection {regular-coll-id :id} {:name "Regular" :location "/" :is_remote_synced false}
                   :model/Card {source-card-id :id} {:name "Source Card"
                                                     :collection_id regular-coll-id
                                                     :database_id (mt/id)
                                                     :dataset_query (mt/mbql-query venues)}
                   :model/Card _ {:name "Dependent Card"
                                  :collection_id remote-synced-coll-id
                                  :database_id (mt/id)
                                  :dataset_query (mt/mbql-query nil {:source-table (str "card__" source-card-id)})}]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Uses content that is not remote synced"
           (core/bulk-set-remote-sync {remote-synced-coll-id true}))))))

(deftest bulk-set-remote-sync-dependency-failure-names-both-collections-test
  (testing "the failure names the collection we tried to sync and the collection that must be synced too"
    (mt/with-temp [:model/Collection {synced-id :id} {:name "Synced" :location "/" :is_remote_synced false}
                   :model/Collection {regular-id :id} {:name "Regular" :location "/" :is_remote_synced false}
                   :model/Card {source-card-id :id} {:name "Source Card"
                                                     :collection_id regular-id
                                                     :database_id (mt/id)
                                                     :dataset_query (mt/mbql-query venues)}
                   :model/Card _ {:name "Dependent Card"
                                  :collection_id synced-id
                                  :database_id (mt/id)
                                  :dataset_query (mt/mbql-query nil {:source-table (str "card__" source-card-id)})}]
      (let [ex (is (thrown? clojure.lang.ExceptionInfo
                            (core/bulk-set-remote-sync {synced-id true})))]
        (is (=? {:status-code 400
                 :errors      {:required [{:remedy       {:type       :collection
                                                          :collection {:id       regular-id
                                                                       :name     "Regular"
                                                                       :personal false}}
                                           :syncable     true
                                           :blocks       [{:id synced-id :name "Synced"}]
                                           :dependencies [{:model      "card"
                                                           :id         source-card-id
                                                           :name       "Source Card"
                                                           :collection {:id regular-id :name "Regular"}}]}]}}
                (ex-data ex)))
        (testing "the remedy is the entry's own, not repeated on every dependency under it"
          (is (not (contains? (get-in (ex-data ex) [:errors :required 0 :dependencies 0])
                              :remedy))))))))

(deftest bulk-set-remote-sync-dependency-names-what-uses-it-test
  (testing "each dependency names the entity that references it, not only the collection it lives in"
    (mt/with-temp [:model/Collection {synced-id :id} {:name "Synced" :location "/" :is_remote_synced false}
                   :model/Collection {regular-id :id} {:name "Regular" :location "/" :is_remote_synced false}
                   :model/Card {source-card-id :id} {:name "Source Card"
                                                     :collection_id regular-id
                                                     :database_id (mt/id)
                                                     :dataset_query (mt/mbql-query venues)}
                   :model/Card {dependent-card-id :id} {:name "Dependent Card"
                                                        :collection_id synced-id
                                                        :database_id (mt/id)
                                                        :dataset_query (mt/mbql-query nil {:source-table (str "card__" source-card-id)})}]
      (let [ex (is (thrown? clojure.lang.ExceptionInfo
                            (core/bulk-set-remote-sync {synced-id true})))]
        (is (=? {:errors {:required [{:dependencies [{:id      source-card-id
                                                      :used_by [{:model "card"
                                                                 :id    dependent-card-id
                                                                 :name  "Dependent Card"}]}]}]}}
                (ex-data ex)))))))

(deftest bulk-set-remote-sync-dependency-used-by-drops-nested-models-test
  (testing "a dashboard dependent is reported as the dashboard — the dashcard in the same path has no name to show"
    (mt/with-temp [:model/Collection {synced-id :id} {:name "Synced" :location "/" :is_remote_synced false}
                   :model/Collection {regular-id :id} {:name "Regular" :location "/" :is_remote_synced false}
                   :model/Card {source-card-id :id} {:name "Source Card"
                                                     :collection_id regular-id
                                                     :database_id (mt/id)
                                                     :dataset_query (mt/mbql-query venues)}
                   :model/Dashboard {dashboard-id :id} {:name "Revenue" :collection_id synced-id}
                   :model/DashboardCard _ {:dashboard_id dashboard-id :card_id source-card-id}]
      (let [ex    (is (thrown? clojure.lang.ExceptionInfo
                               (core/bulk-set-remote-sync {synced-id true})))
            [dep] (get-in (ex-data ex) [:errors :required 0 :dependencies])]
        (is (= source-card-id (:id dep)))
        (is (= [{:model "dashboard" :id dashboard-id :name "Revenue"}] (:used_by dep)))))))

(deftest bulk-set-remote-sync-dependency-model-follows-card-type-test
  (testing "a Card dependency reports the collection-item model its type implies, not the Toucan name"
    (doseq [[card-type expected] {:model  "dataset"
                                  :metric "metric"}]
      (testing (str "a " card-type " reports as " expected)
        (mt/with-temp [:model/Collection {synced-id :id} {:name "Synced" :location "/" :is_remote_synced false}
                       :model/Collection {regular-id :id} {:name "Regular" :location "/" :is_remote_synced false}
                       :model/Card {source-card-id :id} {:name "Source"
                                                         :type card-type
                                                         :collection_id regular-id
                                                         :database_id (mt/id)
                                                         :dataset_query (mt/mbql-query venues)}
                       :model/Card _ {:name "Dependent Card"
                                      :collection_id synced-id
                                      :database_id (mt/id)
                                      :dataset_query (mt/mbql-query nil {:source-table (str "card__" source-card-id)})}]
          (let [ex (is (thrown? clojure.lang.ExceptionInfo
                                (core/bulk-set-remote-sync {synced-id true})))]
            (is (=? {:errors {:required [{:dependencies [{:model expected
                                                          :id    source-card-id}]}]}}
                    (ex-data ex)))))))))

(deftest bulk-set-remote-sync-dependency-remedy-is-top-level-ancestor-test
  (testing "the remedy names the top-level collection settings can toggle, not the dependency's sub-collection"
    (mt/with-temp [:model/Collection {synced-id :id} {:name "Synced" :location "/" :is_remote_synced false}
                   :model/Collection {root-id :id} {:name "Root Regular" :location "/" :is_remote_synced false}
                   :model/Collection {child-id :id} {:name "Nested"
                                                     :location (format "/%d/" root-id)
                                                     :is_remote_synced false}
                   :model/Card {source-card-id :id} {:name "Source Card"
                                                     :collection_id child-id
                                                     :database_id (mt/id)
                                                     :dataset_query (mt/mbql-query venues)}
                   :model/Card _ {:name "Dependent Card"
                                  :collection_id synced-id
                                  :database_id (mt/id)
                                  :dataset_query (mt/mbql-query nil {:source-table (str "card__" source-card-id)})}]
      (let [ex (is (thrown? clojure.lang.ExceptionInfo
                            (core/bulk-set-remote-sync {synced-id true})))]
        (is (=? {:errors {:required [{:remedy       {:type       :collection
                                                     :collection {:id root-id :name "Root Regular"}}
                                      ;; The dependency keeps the sub-collection it actually lives in.
                                      :dependencies [{:id         source-card-id
                                                      :collection {:id child-id :name "Nested"}}]}]}}
                (ex-data ex)))))))

(deftest bulk-set-remote-sync-root-dependency-collection-is-explicit-nil-test
  (testing "a dependency in the root collection reports `:collection nil` — the root is a place, not a missing value"
    (mt/with-temp [:model/Collection {synced-id :id} {:name "Synced" :location "/" :is_remote_synced false}
                   :model/Card {source-card-id :id} {:name "Root Card"
                                                     :collection_id nil
                                                     :database_id (mt/id)
                                                     :dataset_query (mt/mbql-query venues)}
                   :model/Card _ {:name "Dependent Card"
                                  :collection_id synced-id
                                  :database_id (mt/id)
                                  :dataset_query (mt/mbql-query nil {:source-table (str "card__" source-card-id)})}]
      (let [ex         (is (thrown? clojure.lang.ExceptionInfo
                                    (core/bulk-set-remote-sync {synced-id true})))
            [required] (get-in (ex-data ex) [:errors :required])]
        (is (= [source-card-id] (map :id (:dependencies required))))
        (is (false? (:syncable required)))
        (testing "the entry is keyed on where the content lives, since there is no remedy to name"
          (is (= {:type :none :collection nil} (:remedy required))))
        (testing "the key is present and nil, so clients can tell root from unresolvable"
          (is (contains? (:remedy required) :collection)))))))

(deftest bulk-set-remote-sync-snippet-dependency-remedy-is-library-test
  (testing "a snippet dependency names the Library collection, which an admin switches on like any other"
    (with-library [{:keys [library]}]
      (with-library-not-synced
        (mt/with-temp [:model/Collection {synced-id :id} {:name "Synced" :location "/" :is_remote_synced false}
                       :model/NativeQuerySnippet {snippet-id :id} {:name "active_users" :content "1 = 1"}
                       :model/Card _ {:name "Snippet Card"
                                      :collection_id synced-id
                                      :database_id (mt/id)
                                      :dataset_query (mt/native-query
                                                      {:query         "SELECT 1 WHERE {{snippet: active_users}}"
                                                       :template-tags {"snippet: active_users"
                                                                       {:snippet-id   snippet-id
                                                                        :snippet-name "active_users"
                                                                        :type         :snippet
                                                                        :name         "snippet: active_users"
                                                                        :display-name "Snippet: Active Users"
                                                                        :id           (str (random-uuid))}}})}]
          (let [ex (is (thrown? clojure.lang.ExceptionInfo
                                (core/bulk-set-remote-sync {synced-id true})))]
            ;; The collection `type` is what lets clients give the Library its own icon.
            (is (=? {:errors {:required [{:remedy       {:type       :collection
                                                         :collection {:id       (:id library)
                                                                      :name     (:name library)
                                                                      :type     "library"
                                                                      :personal false}}
                                          :syncable     true
                                          :dependencies [{:model "snippet"
                                                          :id    snippet-id
                                                          :name  "active_users"}]}]}}
                    (ex-data ex)))))))))

(deftest bulk-set-remote-sync-dependency-remedy-carries-collection-type-test
  (testing "a remedy resolved through the top-level-ancestor lookup still reports the collection's type"
    ;; Distinct from the snippet case above, whose Library is loaded whole. This one goes through
    ;; `collections-by-id`, so it is what proves that select carries `:type`.
    (with-library [{:keys [library]}]
      (with-library-not-synced
        (mt/with-temp [:model/Collection {synced-id :id} {:name "Synced" :location "/" :is_remote_synced false}
                       :model/Card {source-card-id :id} {:name "Library Card"
                                                         :collection_id (:id library)
                                                         :database_id (mt/id)
                                                         :dataset_query (mt/mbql-query venues)}
                       :model/Card _ {:name "Dependent Card"
                                      :collection_id synced-id
                                      :database_id (mt/id)
                                      :dataset_query (mt/mbql-query nil {:source-table (str "card__" source-card-id)})}]
          (let [ex (is (thrown? clojure.lang.ExceptionInfo
                                (core/bulk-set-remote-sync {synced-id true})))]
            (is (=? {:errors {:required [{:remedy       {:type       :collection
                                                         :collection {:id   (:id library)
                                                                      :type "library"}}
                                          :dependencies [{:id source-card-id}]}]}}
                    (ex-data ex)))))))))

(defn- link-to-dashboard-dashcard
  "A dashcard on `dashboard-id` that holds no card of its own and links to `target-id` via click behaviour."
  [dashboard-id target-id]
  {:dashboard_id           dashboard-id
   :card_id                nil
   :visualization_settings {:click_behavior {:type     "link"
                                             :linkType "dashboard"
                                             :targetId target-id}}})

(defn- reported-dependencies
  "The `[model id]` pairs a refused sync reports, across every required sync it names."
  [ex]
  (set (for [required (get-in (ex-data ex) [:errors :required])
             dep      (:dependencies required)]
         [(:model dep) (:id dep)])))

(deftest bulk-set-remote-sync-dependency-prunes-the-contents-of-a-linked-dashboard-test
  (testing "a dashboard reached by click behaviour is reported alone — syncing its collection covers the cards it holds"
    (mt/with-temp [:model/Collection {synced-id :id} {:name "Synced" :location "/" :is_remote_synced false}
                   :model/Collection {regular-id :id} {:name "Regular" :location "/" :is_remote_synced false}
                   :model/Card {held-card-id :id} {:name "Held Card"
                                                   :collection_id regular-id
                                                   :database_id (mt/id)
                                                   :dataset_query (mt/mbql-query venues)}
                   :model/Dashboard {linked-id :id} {:name "Linked" :collection_id regular-id}
                   :model/DashboardCard _ {:dashboard_id linked-id :card_id held-card-id}
                   :model/Dashboard {hub-id :id} {:name "Hub" :collection_id synced-id}
                   :model/DashboardCard _ (link-to-dashboard-dashcard hub-id linked-id)]
      (let [ex (is (thrown? clojure.lang.ExceptionInfo
                            (core/bulk-set-remote-sync {synced-id true})))]
        (is (= #{["dashboard" linked-id]} (reported-dependencies ex)))
        (testing "the card the linked dashboard holds is not reported in its own right"
          (is (not (contains? (reported-dependencies ex) ["card" held-card-id]))))))))

(deftest bulk-set-remote-sync-dependency-keeps-linked-content-needing-its-own-remedy-test
  (testing "a card inside a linked dashboard survives when syncing that dashboard's collection wouldn't cover it"
    (mt/with-temp [:model/Collection {synced-id :id} {:name "Synced" :location "/" :is_remote_synced false}
                   :model/Collection {regular-id :id} {:name "Regular" :location "/" :is_remote_synced false}
                   :model/Collection {other-id :id} {:name "Other" :location "/" :is_remote_synced false}
                   :model/Card {held-card-id :id} {:name "Held Card"
                                                   :collection_id other-id
                                                   :database_id (mt/id)
                                                   :dataset_query (mt/mbql-query venues)}
                   :model/Dashboard {linked-id :id} {:name "Linked" :collection_id regular-id}
                   :model/DashboardCard _ {:dashboard_id linked-id :card_id held-card-id}
                   :model/Dashboard {hub-id :id} {:name "Hub" :collection_id synced-id}
                   :model/DashboardCard _ (link-to-dashboard-dashcard hub-id linked-id)]
      (let [ex (is (thrown? clojure.lang.ExceptionInfo
                            (core/bulk-set-remote-sync {synced-id true})))]
        (is (= #{["dashboard" linked-id] ["card" held-card-id]} (reported-dependencies ex)))
        (testing "each gets its own entry, naming the collection that actually covers it"
          (is (= {"Regular" ["dashboard" linked-id]
                  "Other"   ["card" held-card-id]}
                 (into {} (for [{:keys [remedy dependencies]} (get-in (ex-data ex) [:errors :required])]
                            [(get-in remedy [:collection :name])
                             (first (map (juxt :model :id) dependencies))])))))))))

(deftest bulk-set-remote-sync-dependency-pruning-keeps-a-mutually-linked-pair-reachable-test
  (testing "dashboards that link to each other don't prune each other away, leaving nothing to report"
    (mt/with-temp [:model/Collection {synced-id :id} {:name "Synced" :location "/" :is_remote_synced false}
                   :model/Collection {regular-id :id} {:name "Regular" :location "/" :is_remote_synced false}
                   :model/Dashboard {first-id :id} {:name "First" :collection_id regular-id}
                   :model/Dashboard {second-id :id} {:name "Second" :collection_id regular-id}
                   :model/DashboardCard _ (link-to-dashboard-dashcard first-id second-id)
                   :model/DashboardCard _ (link-to-dashboard-dashcard second-id first-id)
                   :model/Dashboard {hub-id :id} {:name "Hub" :collection_id synced-id}
                   :model/DashboardCard _ (link-to-dashboard-dashcard hub-id first-id)]
      (let [ex (is (thrown? clojure.lang.ExceptionInfo
                            (core/bulk-set-remote-sync {synced-id true})))]
        ;; Only `First` is reached from the synced collection, so only it survives — but something must.
        (is (= #{["dashboard" first-id]} (reported-dependencies ex)))))))

(deftest bulk-set-remote-sync-reports-every-blocked-collection-test
  (testing "one entry covers both selected collections it unblocks, rather than repeating per selection"
    (mt/with-temp [:model/Collection {synced-a-id :id} {:name "Synced A" :location "/" :is_remote_synced false}
                   :model/Collection {synced-b-id :id} {:name "Synced B" :location "/" :is_remote_synced false}
                   :model/Collection {regular-id :id} {:name "Regular" :location "/" :is_remote_synced false}
                   :model/Card {source-card-id :id} {:name "Source Card"
                                                     :collection_id regular-id
                                                     :database_id (mt/id)
                                                     :dataset_query (mt/mbql-query venues)}
                   :model/Card _ {:name "Dependent A"
                                  :collection_id synced-a-id
                                  :database_id (mt/id)
                                  :dataset_query (mt/mbql-query nil {:source-table (str "card__" source-card-id)})}
                   :model/Card _ {:name "Dependent B"
                                  :collection_id synced-b-id
                                  :database_id (mt/id)
                                  :dataset_query (mt/mbql-query nil {:source-table (str "card__" source-card-id)})}]
      (let [ex         (is (thrown? clojure.lang.ExceptionInfo
                                    (core/bulk-set-remote-sync {synced-a-id true synced-b-id true})))
            [required] (get-in (ex-data ex) [:errors :required])]
        ;; Both selections resolve to the same remedy, so it is offered once and names what it unblocks.
        (is (= 1 (count (get-in (ex-data ex) [:errors :required]))))
        (is (= #{"Synced A" "Synced B"} (into #{} (map :name) (:blocks required))))
        (testing "the shared dependency is listed once, not once per selection"
          (is (= [source-card-id] (map :id (:dependencies required)))))))))

(deftest bulk-set-remote-sync-dependent-failure-is-structured-test
  (testing "disabling a collection something still depends on fails with a structured payload, not a bare message"
    (mt/with-temp [:model/Collection {coll1-id :id} {:name "Collection 1" :location "/" :is_remote_synced true}
                   :model/Collection {coll2-id :id} {:name "Collection 2" :location "/" :is_remote_synced true}
                   :model/Card {source-card-id :id} {:name "Source Card"
                                                     :collection_id coll1-id
                                                     :database_id (mt/id)
                                                     :dataset_query (mt/mbql-query venues)}
                   :model/Card {dependent-card-id :id} {:name "Dependent Card"
                                                        :collection_id coll2-id
                                                        :database_id (mt/id)
                                                        :dataset_query (mt/mbql-query nil {:source-table (str "card__" source-card-id)})}]
      (let [ex (is (thrown? clojure.lang.ExceptionInfo
                            (core/bulk-set-remote-sync {coll1-id false})))]
        (is (=? {:status-code 400
                 :error_code  "remote-synced-dependents"
                 :errors      {:collections [{:collection {:id coll1-id :name "Collection 1"}}]}}
                (ex-data ex)))
        (testing "the dependents are named, and nested models resolve to something an admin can open"
          ;; Only the identifying keys — dependents also carry display hints this assertion isn't about.
          (is (contains? (into #{}
                               (map #(select-keys % [:model :id :name]))
                               (get-in (ex-data ex) [:errors :collections 0 :dependents]))
                         {:model "card" :id dependent-card-id :name "Dependent Card"})))))))

(deftest dependency-item-model-never-nil-test
  (testing "a model with no collections-API name degrades to its lowercased Toucan name, never nil"
    (is (= "dashboard" (#'core/dependency-item-model "Dashboard")))
    (is (= "snippet" (#'core/dependency-item-model "NativeQuerySnippet")))
    (is (= "pulse" (#'core/dependency-item-model "Pulse")))
    (is (= "exploration" (#'core/dependency-item-model "Exploration")))))

(deftest bulk-set-remote-sync-throws-on-remote-synced-dependents-test
  (testing "bulk-set-remote-sync throws when disabling a collection that has remote-synced dependents"
    (mt/with-temp [:model/Collection {coll1-id :id} {:name "Collection 1" :location "/" :is_remote_synced true}
                   :model/Collection {coll2-id :id} {:name "Collection 2" :location "/" :is_remote_synced true}
                   :model/Card {source-card-id :id} {:name "Source Card"
                                                     :collection_id coll1-id
                                                     :database_id (mt/id)
                                                     :dataset_query (mt/mbql-query venues)}
                   :model/Card _ {:name "Dependent Card"
                                  :collection_id coll2-id
                                  :database_id (mt/id)
                                  :dataset_query (mt/mbql-query nil {:source-table (str "card__" source-card-id)})}]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Used by remote synced content"
           (core/bulk-set-remote-sync {coll1-id false}))))))

(deftest bulk-set-remote-sync-empty-map-no-op-test
  (testing "bulk-set-remote-sync with empty map is a no-op"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :location "/" :is_remote_synced false}]
      (core/bulk-set-remote-sync {})
      (is (false? (:is_remote_synced (t2/select-one :model/Collection :id coll-id)))))))

(deftest bulk-set-remote-sync-transaction-rollback-on-error-test
  (testing "bulk-set-remote-sync rolls back all changes on error"
    (mt/with-temp [:model/Collection {coll1-id :id} {:name "Collection 1" :location "/" :is_remote_synced true}
                   :model/Collection {coll2-id :id} {:name "Collection 2" :location "/" :is_remote_synced true}
                   :model/Card {source-card-id :id} {:name "Source Card"
                                                     :collection_id coll1-id
                                                     :database_id (mt/id)
                                                     :dataset_query (mt/mbql-query venues)}
                   :model/Card _ {:name "Dependent Card"
                                  :collection_id coll2-id
                                  :database_id (mt/id)
                                  :dataset_query (mt/mbql-query nil {:source-table (str "card__" source-card-id)})}]
      ;; Try to disable one - should fail because coll1 has dependents in coll2
      (is (thrown? clojure.lang.ExceptionInfo
                   (core/bulk-set-remote-sync {coll1-id false})))
      (is (true? (:is_remote_synced (t2/select-one :model/Collection :id coll1-id))))
      (is (true? (:is_remote_synced (t2/select-one :model/Collection :id coll2-id)))))))

(deftest bulk-set-remote-sync-allows-disabling-when-no-dependents-test
  (testing "bulk-set-remote-sync allows disabling when there are no external remote-synced dependents"
    (mt/with-temp [:model/Collection {coll1-id :id} {:name "Collection 1" :location "/" :is_remote_synced true}
                   :model/Collection {coll2-id :id} {:name "Collection 2" :location "/" :is_remote_synced false}
                   :model/Card {source-card-id :id} {:name "Source Card"
                                                     :collection_id coll1-id
                                                     :database_id (mt/id)
                                                     :dataset_query (mt/mbql-query venues)}
                   :model/Card _ {:name "Dependent Card"
                                  :collection_id coll2-id
                                  :database_id (mt/id)
                                  :dataset_query (mt/mbql-query nil {:source-table (str "card__" source-card-id)})}]
      ;; Should succeed because dependents are not in a remote-synced collection
      (core/bulk-set-remote-sync {coll1-id false})
      (is (false? (:is_remote_synced (t2/select-one :model/Collection :id coll1-id)))))))

;;; ------------------------------------------- Event Publishing Tests -------------------------------------------

(deftest bulk-set-remote-sync-publishes-event-when-enabling-test
  (testing "bulk-set-remote-sync publishes :event/collection-update when enabling remote sync"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :location "/" :is_remote_synced false}]
      (let [published-events (atom [])]
        (mt/with-dynamic-fn-redefs [events/publish-event! (fn [topic event]
                                                            (swap! published-events conj [topic event])
                                                            event)]
          (core/bulk-set-remote-sync {coll-id true})
          (is (= 1 (count @published-events)))
          (is (= :event/collection-update (ffirst @published-events)))
          (is (true? (get-in (first @published-events) [1 :object :is_remote_synced])))
          (is (= coll-id (get-in (first @published-events) [1 :object :id]))))))))

(deftest bulk-set-remote-sync-publishes-event-when-disabling-test
  (testing "bulk-set-remote-sync publishes :event/collection-update when disabling remote sync"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :location "/" :is_remote_synced true}]
      (let [published-events (atom [])]
        (mt/with-dynamic-fn-redefs [events/publish-event! (fn [topic event]
                                                            (swap! published-events conj [topic event])
                                                            event)]
          (core/bulk-set-remote-sync {coll-id false})
          (is (= 1 (count @published-events)))
          (is (= :event/collection-update (ffirst @published-events)))
          (is (false? (get-in (first @published-events) [1 :object :is_remote_synced])))
          (is (= coll-id (get-in (first @published-events) [1 :object :id]))))))))

(deftest bulk-set-remote-sync-no-event-when-already-enabled-test
  (testing "bulk-set-remote-sync does not publish event when collection is already remote-synced"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :location "/" :is_remote_synced true}]
      (let [published-events (atom [])]
        (mt/with-dynamic-fn-redefs [events/publish-event! (fn [topic event]
                                                            (swap! published-events conj [topic event])
                                                            event)]
          (core/bulk-set-remote-sync {coll-id true})
          (is (= 0 (count @published-events))))))))

(deftest bulk-set-remote-sync-no-event-when-already-disabled-test
  (testing "bulk-set-remote-sync does not publish event when collection is already not remote-synced"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :location "/" :is_remote_synced false}]
      (let [published-events (atom [])]
        (mt/with-dynamic-fn-redefs [events/publish-event! (fn [topic event]
                                                            (swap! published-events conj [topic event])
                                                            event)]
          (core/bulk-set-remote-sync {coll-id false})
          (is (= 0 (count @published-events))))))))

(deftest bulk-set-remote-sync-events-only-for-changed-collections-test
  (testing "bulk-set-remote-sync only publishes events for collections whose status actually changed"
    (mt/with-temp [:model/Collection {coll1-id :id} {:name "Collection 1" :location "/" :is_remote_synced false}
                   :model/Collection {coll2-id :id} {:name "Collection 2" :location "/" :is_remote_synced true}
                   :model/Collection {coll3-id :id} {:name "Collection 3" :location "/" :is_remote_synced true}
                   :model/Collection {coll4-id :id} {:name "Collection 4" :location "/" :is_remote_synced false}]
      (let [published-events (atom [])]
        (mt/with-dynamic-fn-redefs [events/publish-event! (fn [topic event]
                                                            (swap! published-events conj [topic event])
                                                            event)]
          ;; coll1: false -> true (should publish)
          ;; coll2: true -> true (should NOT publish)
          ;; coll3: true -> false (should publish)
          ;; coll4: false -> false (should NOT publish)
          (core/bulk-set-remote-sync {coll1-id true coll2-id true coll3-id false coll4-id false})
          (is (= 2 (count @published-events)))
          (let [event-collection-ids (set (map #(get-in % [1 :object :id]) @published-events))]
            (is (contains? event-collection-ids coll1-id))
            (is (contains? event-collection-ids coll3-id))
            (is (not (contains? event-collection-ids coll2-id)))
            (is (not (contains? event-collection-ids coll4-id)))))))))

;;; ------------------------------------------- No-Op Optimization Tests -------------------------------------------

(deftest bulk-set-remote-sync-skips-already-enabled-collections-test
  (testing "bulk-set-remote-sync does not update collections that are already in the target state (enable)"
    (mt/with-temp [:model/Collection {parent-id :id} {:name "Parent" :location "/" :is_remote_synced true}
                   :model/Collection {child-id :id} {:name "Child" :location (format "/%d/" parent-id) :is_remote_synced true}]
      ;; Both collections already have is_remote_synced = true
      ;; The UPDATE should affect 0 rows because of the WHERE is_remote_synced = false clause
      (core/bulk-set-remote-sync {parent-id true})
      ;; Verify collections remain unchanged (the UPDATE was a no-op)
      (is (true? (:is_remote_synced (t2/select-one :model/Collection :id parent-id))))
      (is (true? (:is_remote_synced (t2/select-one :model/Collection :id child-id)))))))

(deftest bulk-set-remote-sync-skips-already-disabled-collections-test
  (testing "bulk-set-remote-sync does not update collections that are already in the target state (disable)"
    (mt/with-temp [:model/Collection {parent-id :id} {:name "Parent" :location "/" :is_remote_synced false}
                   :model/Collection {child-id :id} {:name "Child" :location (format "/%d/" parent-id) :is_remote_synced false}]
      ;; Both collections already have is_remote_synced = false
      ;; The UPDATE should affect 0 rows because of the WHERE is_remote_synced = true clause
      (core/bulk-set-remote-sync {parent-id false})
      ;; Verify collections remain unchanged (the UPDATE was a no-op)
      (is (false? (:is_remote_synced (t2/select-one :model/Collection :id parent-id))))
      (is (false? (:is_remote_synced (t2/select-one :model/Collection :id child-id)))))))

(deftest bulk-set-remote-sync-only-updates-changed-descendants-test
  (testing "bulk-set-remote-sync only updates descendants that need changing"
    ;; Create all collections with is_remote_synced=false first (valid state),
    ;; then update child2 directly to avoid before-insert validation
    (mt/with-temp [:model/Collection {parent-id :id} {:name "Parent" :location "/" :is_remote_synced false}
                   :model/Collection {child1-id :id} {:name "Child 1" :location (format "/%d/" parent-id) :is_remote_synced false}
                   :model/Collection {child2-id :id} {:name "Child 2" :location (format "/%d/" parent-id) :is_remote_synced false}]
      ;; Set child2 to already be remote-synced directly in DB (bypasses hooks)
      (t2/query-one {:update :collection :set {:is_remote_synced true} :where [:= :id child2-id]})
      ;; Parent and Child 1 are false, Child 2 is already true
      ;; When enabling parent, only parent and child1 should be updated, child2 should be skipped
      (core/bulk-set-remote-sync {parent-id true})
      ;; All should now be true
      (is (true? (:is_remote_synced (t2/select-one :model/Collection :id parent-id))))
      (is (true? (:is_remote_synced (t2/select-one :model/Collection :id child1-id))))
      (is (true? (:is_remote_synced (t2/select-one :model/Collection :id child2-id)))))))

(deftest bulk-set-remote-sync-only-updates-changed-descendants-disable-test
  (testing "bulk-set-remote-sync only updates descendants that need changing (disable)"
    ;; Create all collections with is_remote_synced=true first (valid state),
    ;; then update child2 directly to avoid before-insert validation
    (mt/with-temp [:model/Collection {parent-id :id} {:name "Parent" :location "/" :is_remote_synced true}
                   :model/Collection {child1-id :id} {:name "Child 1" :location (format "/%d/" parent-id) :is_remote_synced true}
                   :model/Collection {child2-id :id} {:name "Child 2" :location (format "/%d/" parent-id) :is_remote_synced true}]
      ;; Set child2 to already be not remote-synced directly in DB (bypasses hooks)
      (t2/query-one {:update :collection :set {:is_remote_synced false} :where [:= :id child2-id]})
      ;; Parent and Child 1 are true, Child 2 is already false
      ;; When disabling parent, only parent and child1 should be updated, child2 should be skipped
      (core/bulk-set-remote-sync {parent-id false})
      ;; All should now be false
      (is (false? (:is_remote_synced (t2/select-one :model/Collection :id parent-id))))
      (is (false? (:is_remote_synced (t2/select-one :model/Collection :id child1-id))))
      (is (false? (:is_remote_synced (t2/select-one :model/Collection :id child2-id)))))))

;;; ------------------------------------------- RSO Cleanup Tests -------------------------------------------

(deftest bulk-set-remote-sync-marks-rsos-removed-on-disable-test
  (testing "bulk-set-remote-sync marks RemoteSyncObject entries for un-synced collections and their
            contents as 'removed' — a pending deletion the next export pushes to the remote — instead of
            silently dropping them, which left nothing to push (GHY-4189)"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :location "/" :is_remote_synced true}]
      (let [now      (t/offset-date-time)
            card-eid 90001]
        ;; Both entities are already on the remote (status 'synced', with a stored file_path).
        (t2/insert! :model/RemoteSyncObject
                    {:model_type "Collection" :model_id coll-id :model_name "Test Collection"
                     :status "synced" :status_changed_at now :file_path "collections/tc/tc.yaml"})
        (t2/insert! :model/RemoteSyncObject
                    {:model_type "Card" :model_id card-eid :model_name "Test Card"
                     :model_collection_id coll-id :status "synced" :status_changed_at now
                     :file_path "collections/tc/cards/card.yaml"})
        (mt/with-dynamic-fn-redefs [events/publish-event! (constantly nil)]
          (core/bulk-set-remote-sync {coll-id false}))
        (is (= "removed" (t2/select-one-fn :status :model/RemoteSyncObject
                                           :model_type "Collection" :model_id coll-id))
            "the collection RSO is marked removed, not deleted")
        (is (= "removed" (t2/select-one-fn :status :model/RemoteSyncObject
                                           :model_type "Card" :model_id card-eid))
            "the collection's contents are marked removed too")
        (is (true? (remote-sync.object/dirty?))
            "disabling leaves a pending change so a subsequent export pushes the removal")))))

(deftest bulk-set-remote-sync-drops-never-pushed-rsos-on-disable-test
  (testing "bulk-set-remote-sync drops RSOs still in 'create' (never pushed to the remote) rather than
            marking them 'removed' — the remote never received them, so there is nothing to delete there"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :location "/" :is_remote_synced true}]
      (let [now      (t/offset-date-time)
            card-eid 90002]
        (t2/insert! :model/RemoteSyncObject
                    {:model_type "Collection" :model_id coll-id :model_name "Test Collection"
                     :status "create" :status_changed_at now})
        (t2/insert! :model/RemoteSyncObject
                    {:model_type "Card" :model_id card-eid :model_name "Test Card"
                     :model_collection_id coll-id :status "create" :status_changed_at now})
        (mt/with-dynamic-fn-redefs [events/publish-event! (constantly nil)]
          (core/bulk-set-remote-sync {coll-id false}))
        (is (false? (t2/exists? :model/RemoteSyncObject :model_type "Collection" :model_id coll-id))
            "a never-pushed collection RSO is dropped outright")
        (is (false? (t2/exists? :model/RemoteSyncObject :model_type "Card" :model_id card-eid))
            "a never-pushed content RSO is dropped outright")))))

(deftest bulk-set-remote-sync-marks-descendant-rsos-removed-test
  (testing "bulk-set-remote-sync marks RSOs for descendant collections and their contents as removed,
            dropping only the never-pushed ('create') ones (GHY-4189)"
    (mt/with-temp [:model/Collection {parent-id :id} {:name "Parent" :location "/" :is_remote_synced true}
                   :model/Collection {child-id :id} {:name "Child" :location (format "/%d/" parent-id)
                                                     :is_remote_synced true}]
      (let [now      (t/offset-date-time)
            card-eid 90003]
        (t2/insert! :model/RemoteSyncObject
                    {:model_type "Collection" :model_id parent-id :model_name "Parent"
                     :status "synced" :status_changed_at now :file_path "collections/parent/parent.yaml"})
        (t2/insert! :model/RemoteSyncObject
                    {:model_type "Collection" :model_id child-id :model_name "Child"
                     :status "update" :status_changed_at now :file_path "collections/parent/child/child.yaml"})
        (t2/insert! :model/RemoteSyncObject
                    {:model_type "Card" :model_id card-eid :model_name "Child Card"
                     :model_collection_id child-id :status "create" :status_changed_at now})
        (mt/with-dynamic-fn-redefs [events/publish-event! (constantly nil)]
          (core/bulk-set-remote-sync {parent-id false}))
        (is (= "removed" (t2/select-one-fn :status :model/RemoteSyncObject
                                           :model_type "Collection" :model_id parent-id))
            "already-pushed parent collection is marked removed")
        (is (= "removed" (t2/select-one-fn :status :model/RemoteSyncObject
                                           :model_type "Collection" :model_id child-id))
            "already-pushed descendant collection is marked removed")
        (is (false? (t2/exists? :model/RemoteSyncObject :model_type "Card" :model_id card-eid))
            "never-pushed content RSO is dropped")))))

;;; ------------------------------------------- batch-model-eligible? Tests -------------------------------------------

(deftest batch-model-eligible-for-remote-sync-cards-in-remote-synced-collection-test
  (testing "returns true for cards in remote-synced collection"
    (mt/with-temp [:model/Collection {coll-id :id} {:is_remote_synced true}
                   :model/Card card1 {:collection_id coll-id}
                   :model/Card card2 {:collection_id coll-id}]
      (is (= {(:id card1) true, (:id card2) true}
             (core/batch-model-eligible? :model/Card [card1 card2]))))))

(deftest batch-model-eligible-for-remote-sync-cards-not-in-remote-synced-collection-test
  (testing "returns false for cards NOT in remote-synced collection"
    (mt/with-temp [:model/Collection {coll-id :id} {:is_remote_synced false}
                   :model/Card card {:collection_id coll-id}]
      (is (= {(:id card) false}
             (core/batch-model-eligible? :model/Card [card]))))))

(deftest batch-model-eligible-for-remote-sync-snippets-library-synced-test
  (testing "snippets eligible when Library is synced"
    (with-library-synced
      (mt/with-temp [:model/Collection {snippet-coll-id :id} {:namespace "snippets"}
                     :model/NativeQuerySnippet snippet {:name "Test Snippet"
                                                        :content "SELECT 1"
                                                        :collection_id snippet-coll-id}]
        (is (= {(:id snippet) true}
               (core/batch-model-eligible? :model/NativeQuerySnippet [snippet])))))))

(deftest batch-model-eligible-for-remote-sync-snippets-library-not-synced-test
  (testing "snippets NOT eligible when Library is not synced"
    (with-library-not-synced
      (mt/with-temp [:model/Collection {snippet-coll-id :id} {:namespace "snippets"}
                     :model/NativeQuerySnippet snippet {:name "Test Snippet"
                                                        :content "SELECT 1"
                                                        :collection_id snippet-coll-id}]
        (is (= {(:id snippet) false}
               (core/batch-model-eligible? :model/NativeQuerySnippet [snippet])))))))

(deftest batch-model-eligible-for-remote-sync-unknown-model-test
  (testing "unknown model returns false for all instances"
    (is (= {1 false, 2 false}
           (core/batch-model-eligible? :model/UnknownModel [{:id 1} {:id 2}])))))

;; ---------- Guard contract for bulk-set-remote-sync ---------------------------------------------
;;
;; bulk-set-remote-sync consults `guards/task-running?` and refuses if a task is in flight.

(deftest bulk-set-remote-sync-refuses-while-task-running-test
  (testing "bulk-set-remote-sync must refuse when guards/task-running? returns true,
            without changing the collection's is_remote_synced flag"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection"
                                                    :location "/"
                                                    :is_remote_synced false}]
      (with-redefs [guards/task-running? (constantly true)]
        (is (thrown-with-msg? Exception #"Remote sync task in progress"
                              (core/bulk-set-remote-sync {coll-id true})))
        (is (false? (:is_remote_synced (t2/select-one :model/Collection :id coll-id)))
            "collection's is_remote_synced flag must remain unchanged when the guard fires")))))

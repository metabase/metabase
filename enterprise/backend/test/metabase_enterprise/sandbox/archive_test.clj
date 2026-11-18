(ns metabase-enterprise.sandbox.archive-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- venues-query
  "A query on VENUES."
  []
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id :venues)))))

(defn- snippet-query
  "A native query on VENUES filtered by `{{snippet: <snippet-name>}}`."
  [snippet-name]
  (lib/native-query (mt/metadata-provider) (format "SELECT * FROM VENUES WHERE {{snippet: %s}}" snippet-name)))

(defn- with-sandboxed-content!
  "Calls `f` with a map of the entities of four sandboxes on VENUES, each built out of something living in a Collection
  every user may curate: a Card (`:coll`), a snippet (`:snippet-coll`), a Dashboard question (`:dashboard`) and a Card
  in a Document (`:document`)."
  [f]
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-non-admin-groups-no-root-collection-for-namespace-perms "snippets"
      (let [snippet-name (mt/random-name)]
        (mt/with-temp [:model/PermissionsGroup   group-1       {}
                       :model/PermissionsGroup   group-2       {}
                       :model/PermissionsGroup   group-3       {}
                       :model/PermissionsGroup   group-4       {}
                       :model/Collection         coll          {}
                       :model/Collection         snippet-coll  {:namespace "snippets"}
                       :model/Collection         dashboard-coll {}
                       :model/Collection         document-coll {}
                       :model/Card               source        {:collection_id (:id coll)
                                                                :dataset_query (venues-query)}
                       :model/NativeQuerySnippet snippet       {:collection_id (:id snippet-coll)
                                                                :name          snippet-name
                                                                :content       "1 = 1"}
                       :model/Card               snippet-card  {:collection_id (:id coll)
                                                                :dataset_query (snippet-query snippet-name)}
                       :model/Dashboard          dashboard     {:collection_id (:id dashboard-coll)}
                       :model/Card               dashboard-question {:collection_id (:id dashboard-coll)
                                                                     :dashboard_id  (:id dashboard)
                                                                     :dataset_query (venues-query)}
                       :model/Document           document      {:collection_id (:id document-coll)}
                       :model/Card               document-card {:collection_id (:id document-coll)
                                                                :document_id   (:id document)
                                                                :dataset_query (venues-query)}
                       :model/Sandbox            _             {:table_id (mt/id :venues), :group_id (:id group-1), :card_id (:id source)}
                       :model/Sandbox            _             {:table_id (mt/id :venues), :group_id (:id group-2), :card_id (:id snippet-card)}
                       :model/Sandbox            _             {:table_id (mt/id :venues), :group_id (:id group-3), :card_id (:id dashboard-question)}
                       :model/Sandbox            _             {:table_id (mt/id :venues), :group_id (:id group-4), :card_id (:id document-card)}]
          (doseq [c [coll snippet-coll dashboard-coll document-coll]]
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) c))
          (f {:coll           coll
              :snippet-coll   snippet-coll
              :dashboard-coll dashboard-coll
              :document-coll  document-coll
              :source         source
              :snippet        snippet
              :snippet-card   snippet-card
              :dashboard      dashboard
              :document       document}))))))

(defn- state
  "What archiving touches, as a snapshot of the `archived` state of the entities of `content`."
  [{:keys [coll snippet-coll dashboard-coll document-coll source snippet snippet-card dashboard document]}]
  (let [flags (fn [model ids]
                (into (sorted-map) (t2/select-fn->fn :id (juxt :archived :archived_directly) model :id [:in ids])))]
    {:collections (flags :model/Collection (map :id [coll snippet-coll dashboard-coll document-coll]))
     :cards       (flags :model/Card (concat (map :id [source snippet-card])
                                             (t2/select-pks-vec :model/Card :collection_id [:in (map :id [dashboard-coll document-coll])])))
     :snippets    (flags :model/NativeQuerySnippet [(:id snippet)])
     :dashboards  (flags :model/Dashboard [(:id dashboard)])
     :documents   (flags :model/Document [(:id document)])}))

(defn- archive-by-admin!
  "Archives the entities of the `ids` Collections as an admin."
  [& colls]
  (mt/with-test-user :crowberto
    (doseq [coll colls]
      (t2/update! :model/Collection :id (:id coll) {:archived true}))))

(def ^:private scenarios
  "The archives and restores that take down something a sandbox is built out of: a name, whether the scenario starts from
  archived content, and a function from the content and the user to the request, which returns its status."
  [["archive a Collection holding a sandbox Card"
    false
    (fn [{:keys [coll]} user status] (mt/user-http-request user :put status (str "collection/" (:id coll)) {:archived true}))]
   ["archive a Collection holding a sandbox snippet"
    false
    (fn [{:keys [snippet-coll]} user status] (mt/user-http-request user :put status (str "collection/" (:id snippet-coll)) {:archived true}))]
   ["restore a Collection holding a sandbox Card"
    true
    (fn [{:keys [coll]} user status] (mt/user-http-request user :put status (str "collection/" (:id coll)) {:archived false}))]
   ["restore a Collection holding a sandbox snippet"
    true
    (fn [{:keys [snippet-coll]} user status] (mt/user-http-request user :put status (str "collection/" (:id snippet-coll)) {:archived false}))]
   ["archive a Dashboard holding a sandbox Card"
    false
    (fn [{:keys [dashboard]} user status] (mt/user-http-request user :put status (str "dashboard/" (:id dashboard)) {:archived true}))]
   ["archive a Document holding a sandbox Card"
    false
    (fn [{:keys [document]} user status] (mt/user-http-request user :put status (str "document/" (:id document)) {:archived true}))]
   ["archive a sandbox Card"
    false
    (fn [{:keys [source]} user status] (mt/user-http-request user :put status (str "card/" (:id source)) {:archived true}))]
   ["archive a sandbox snippet"
    false
    (fn [{:keys [snippet]} user status] (mt/user-http-request user :put status (str "native-query-snippet/" (:id snippet)) {:archived true}))]])

(deftest only-admins-archive-or-restore-sandbox-sources-test
  (mt/with-premium-features #{:sandboxes}
    (doseq [[scenario-name starts-archived? request] scenarios]
      (testing scenario-name
        (testing "a non-admin with write access is refused and nothing is written"
          (with-sandboxed-content!
            (fn [content]
              (when starts-archived?
                (archive-by-admin! (:coll content) (:snippet-coll content)))
              (let [before (state content)]
                (request content :rasta 403)
                (is (= before (state content)))))))
        (testing "an admin may"
          (with-sandboxed-content!
            (fn [content]
              (when starts-archived?
                (archive-by-admin! (:coll content) (:snippet-coll content)))
              (let [before (state content)]
                (request content :crowberto 200)
                (is (not= before (state content)))))))))))

(deftest only-admins-archive-sandbox-summary-cards-test
  (testing "an archive that takes along an Exploration's Summary card a sandbox is built out of is refused to a
            non-admin who writes the Collection, and allowed to an admin"
    (mt/with-premium-features #{:sandboxes}
      (mt/with-non-admin-groups-no-root-collection-perms
        (doseq [[user status] [[:rasta 403] [:crowberto 200]]]
          (mt/with-temp [:model/PermissionsGroup group {}
                         :model/Collection       coll  {}
                         :model/Exploration      expl  {:name "E" :creator_id (mt/user->id :crowberto) :collection_id (:id coll)}
                         :model/Document         doc   {:name           "Summary"
                                                        :collection_id  (:id coll)
                                                        :creator_id     (mt/user->id :crowberto)
                                                        :exploration_id (:id expl)
                                                        :document       {:type "doc" :content []}}
                         :model/Card             card  {:collection_id (:id coll)
                                                        :document_id   (:id doc)
                                                        :dataset_query (venues-query)}
                         :model/Sandbox          _     {:table_id (mt/id :venues), :group_id (:id group), :card_id (:id card)}]
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) coll)
            (testing (str user " archives the Collection")
              (mt/user-http-request user :put status (str "collection/" (:id coll)) {:archived true})
              (is (= (= 200 status) (t2/select-one-fn :archived :model/Card :id (:id card)))))
            (testing (str user " archives the Exploration")
              (when (= 200 status)
                (mt/user-http-request user :put 200 (str "collection/" (:id coll)) {:archived false}))
              (mt/user-http-request user :put status (str "exploration/" (:id expl)) {:archived true})
              (is (= (= 200 status) (t2/select-one-fn :archived :model/Card :id (:id card)))))))))))

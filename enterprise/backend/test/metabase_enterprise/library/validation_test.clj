(ns metabase-enterprise.library.validation-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.dashboards.models.dashboard-card :as dashboard-card]
   [metabase.dashboards.write :as dashboards.write]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.revisions.models.revision :as revision]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest allowed-content-doesnt-block-regular-collections
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/Collection regular-collection {:name "Regular Collection" :type nil}]
      (testing "Regular collections can add anything"
        (is (some? (t2/insert! :model/Collection (merge (mt/with-temp-defaults :model/Collection) {:location (str "/" (:id regular-collection) "/")}))))
        (is (some? (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :model, :collection_id (:id regular-collection)}))))
        (is (some? (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :metric, :collection_id (:id regular-collection)}))))
        (is (some? (t2/insert! :model/Dashboard (merge (mt/with-temp-defaults :model/Dashboard) {:collection_id (:id regular-collection)}))))))))

(deftest library-completely-locked-down
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/Collection no-allowed-content {:name "Test No Content" :type collection/library-collection-type}]
      (testing "Cannot add anything to library collections"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot add anything to the semantic layer"
                              (t2/insert! :model/Collection (merge (mt/with-temp-defaults :model/Collection) {:location (str "/" (:id no-allowed-content) "/")}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot add anything to the semantic layer"
                              (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :model, :collection_id (:id no-allowed-content)}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot add anything to the semantic layer"
                              (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :metric :collection_id (:id no-allowed-content)}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot add anything to the semantic layer"
                              (t2/insert! :model/Dashboard (merge (mt/with-temp-defaults :model/Dashboard) {:collection_id (:id no-allowed-content)}))))))))

(deftest check-allowed-content-table
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/Collection allow-tables {:name "Test Base Library" :type collection/library-data-collection-type}]
      (testing "Can only add allowed content types"
        (mt/with-temp [:model/Table table {:collection_id (:id allow-tables)
                                           :is_published  true}]
          (is (some? table)))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Can only add tables to the 'Data' collection"
                              (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :model :collection_id (:id allow-tables)}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Can only add tables to the 'Data' collection"
                              (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :metric :collection_id (:id allow-tables)}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Can only add tables to the 'Data' collection"
                              (t2/insert! :model/Dashboard (merge (mt/with-temp-defaults :model/Dashboard) {:collection_id (:id allow-tables)})))))
      (testing "Can add collections iff they have the same :type"
        (let [new-coll (merge (mt/with-temp-defaults :model/Collection)
                              {:location (str "/" (:id allow-tables) "/")})]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Can only add tables to the 'Data' collection"
                                (t2/insert! :model/Collection new-coll))
              "basic new collection is rejected")
          (is (= 1 (t2/insert! :model/Collection (assoc new-coll :type collection/library-data-collection-type)))
              "new collection with :type set is allowed"))))))

(deftest check-allowed-content-metric
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/Collection allow-metrics {:name "Test Base Library" :type collection/library-metrics-collection-type}]
      (testing "Can only add allowed content types"
        (mt/with-temp [:model/Card card {:collection_id (:id allow-metrics)
                                         :type          :metric}]
          (is (some? card)))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Can only add metrics to the 'Metrics' collection"
                              (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :model :collection_id (:id allow-metrics)}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Can only add metrics to the 'Metrics' collection"
                              (t2/insert! :model/Dashboard (merge (mt/with-temp-defaults :model/Dashboard) {:collection_id (:id allow-metrics)})))))
      (testing "Can add collections iff they have the same :type"
        (let [new-coll (merge (mt/with-temp-defaults :model/Collection)
                              {:location (str "/" (:id allow-metrics) "/")})]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Can only add metrics to the 'Metrics' collection"
                                (t2/insert! :model/Collection new-coll))
              "basic new collection is rejected")
          (is (= 1 (t2/insert! :model/Collection (assoc new-coll :type collection/library-metrics-collection-type)))
              "new collection with :type set is allowed"))))))

(deftest check-allowed-content-dashboards
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/Collection allow-dashboards {:name "Test Base Library" :type collection/library-dashboards-collection-type}
                   :model/Dashboard  dashboard        {:collection_id (:id allow-dashboards)}
                   :model/Card       dashboard-card   {:collection_id (:id allow-dashboards)
                                                       :dashboard_id  (:id dashboard)
                                                       :type          :question}]
      (testing "Can add dashboards and their questions"
        (is (some? dashboard))
        (is (some? dashboard-card)))
      (testing "Cannot add standalone questions, models, or metrics"
        (doseq [card-type [:question :model :metric]]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Can only add dashboards to the 'Dashboards' collection"
                                (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type card-type :collection_id (:id allow-dashboards)}))))))
      (testing "Cannot turn a dashboard question into a standalone question"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Can only add dashboards to the 'Dashboards' collection"
                              (t2/update! :model/Card (:id dashboard-card) {:dashboard_id nil}))))
      (testing "Can add collections iff they have the same :type"
        (let [new-coll (merge (mt/with-temp-defaults :model/Collection)
                              {:location (str "/" (:id allow-dashboards) "/")})]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Can only add dashboards to the 'Dashboards' collection"
                                (t2/insert! :model/Collection new-coll))
              "basic new collection is rejected")
          (is (= 1 (t2/insert! :model/Collection (assoc new-coll :type collection/library-dashboards-collection-type)))
              "new collection with :type set is allowed"))))))

(deftest library-dashboards-allow-dashboard-companions-test
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/Collection allow-dashboards {:name "Test Base Library" :type collection/library-dashboards-collection-type}
                   :model/Dashboard  dashboard        {:collection_id (:id allow-dashboards)}]
      (testing "Dashboards can have subscriptions"
        (mt/with-temp [:model/Pulse pulse {:dashboard_id (:id dashboard) :collection_id (:id allow-dashboards)}]
          (is (some? pulse))))
      (testing "Dashboard questions can have timelines"
        (mt/with-temp [:model/Timeline timeline {:collection_id (:id allow-dashboards)}]
          (is (some? timeline)))))))

(deftest library-dashboards-dashboard-questions-are-questions-test
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/Collection allow-dashboards {:name "Test Base Library" :type collection/library-dashboards-collection-type}
                   :model/Collection allow-metrics    {:name "Test Metrics" :type collection/library-metrics-collection-type}
                   :model/Dashboard  dashboard        {:collection_id (:id allow-dashboards)}
                   :model/Card       metric           {:collection_id (:id allow-metrics) :type :metric}]
      (testing "A metric can't be moved into the Dashboards collection by giving it a dashboard"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Can only add dashboards to the 'Dashboards' collection"
                              (t2/update! :model/Card (:id metric) {:dashboard_id (:id dashboard)}))))
      (testing "Serdes loads dashboard questions before their dashboard"
        (binding [mi/*deserializing?* true]
          (is (some? (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card)
                                                    {:type :question :collection_id (:id allow-dashboards)}))))
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Can only add dashboards to the 'Dashboards' collection"
                                (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card)
                                                               {:type :metric :collection_id (:id allow-dashboards)})))))))))

(deftest deep-copy-dashboard-into-library-dashboards-test
  (mt/with-premium-features #{:library}
    (let [mp    (mt/metadata-provider)
          query (lib/query mp (lib.metadata/table mp (mt/id :venues)))]
      (mt/with-temp [:model/Collection    allow-dashboards {:name "Test Base Library" :type collection/library-dashboards-collection-type}
                     :model/Collection    regular          {:name "Regular Collection"}
                     :model/Collection    allow-metrics    {:name "Test Metrics" :type collection/library-metrics-collection-type}
                     :model/Collection    sub-metrics      {:name "Sub Metrics" :type collection/library-metrics-collection-type
                                                            :location (str "/" (:id allow-metrics) "/")}
                     :model/Card          question         {:collection_id       (:id regular)
                                                            :collection_position 1
                                                            :type                :question
                                                            :dataset_query       query}
                     :model/Card          metric           {:collection_id (:id sub-metrics) :type :metric :dataset_query query}
                     :model/Dashboard     dashboard        {:collection_id (:id regular)}
                     :model/DashboardCard _                {:dashboard_id (:id dashboard) :card_id (:id question)}
                     :model/DashboardCard _                {:dashboard_id (:id dashboard) :card_id (:id metric)}]
        (doseq [[path copy!] {"API"   #(:id (mt/user-http-request :crowberto :post 200 (str "dashboard/" (:id dashboard) "/copy") %))
                              "write" #(mt/with-current-user (mt/user->id :crowberto)
                                         (:id (dashboards.write/copy-dashboard! (:id dashboard) %)))}]
          (testing (str path ": copied pinned questions become unpinned dashboard questions and metrics stay referenced")
            (let [copy-id (copy! {:collection_id (:id allow-dashboards) :is_deep_copy true})
                  cards   (t2/select :model/Card :id [:in (t2/select-fn-set :card_id :model/DashboardCard :dashboard_id copy-id)])]
              (is (=? [{:type :metric :id (:id metric) :dashboard_id nil}
                       {:type :question :dashboard_id copy-id :collection_id (:id allow-dashboards) :collection_position nil}]
                      (sort-by (comp name :type) cards))))))))))

(deftest move-dashboard-into-library-dashboards-test
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/Collection allow-dashboards {:name "Test Base Library" :type collection/library-dashboards-collection-type}
                   :model/Collection regular          {:name "Regular Collection" :type nil}
                   :model/Dashboard  dashboard        {:collection_id (:id regular)}
                   :model/Card       dashboard-card   {:collection_id (:id regular)
                                                       :dashboard_id  (:id dashboard)
                                                       :type          :question}]
      (testing "Moving a dashboard moves its questions along"
        (mt/user-http-request :crowberto :put 200 (str "dashboard/" (:id dashboard)) {:collection_id (:id allow-dashboards)})
        (is (= (:id allow-dashboards) (t2/select-one-fn :collection_id :model/Card :id (:id dashboard-card))))))))

(deftest tables-cannot-be-moved-to-non-library-data-collections
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/Collection library-data {:name "Library Data" :type collection/library-data-collection-type}
                   :model/Collection regular      {:name "Regular Collection" :type nil}
                   :model/Table      table        {:collection_id (:id library-data)
                                                   :is_published  true}]
      (testing "Cannot insert a published table into a regular collection"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Tables can only be added to"
                              (t2/insert! :model/Table (merge (mt/with-temp-defaults :model/Table)
                                                              {:collection_id (:id regular)
                                                               :is_published  true})))))
      (testing "Cannot move a published table to a regular collection"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Tables can only be added to"
                              (t2/update! :model/Table (:id table) {:collection_id (:id regular)}))))
      (testing "Can move a table out to no collection"
        (is (some? (t2/update! :model/Table (:id table) {:collection_id nil})))))))

(deftest cannot-update-library-collections
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/Collection library {:name "Test Library" :type collection/library-collection-type}
                   :model/Collection models {:name "Test Semantic Model Layer" :type collection/library-data-collection-type}
                   :model/Collection metrics {:name "Test Semantic Metrics Layer" :type collection/library-metrics-collection-type}
                   :model/Collection dashboards {:name "Test Semantic Dashboards Layer" :type collection/library-dashboards-collection-type}]
      (mt/with-dynamic-fn-redefs [collection/library-root-collection? (constantly true)]
        (doseq [col [library models metrics dashboards]]
          (testing (str "Checking type " (:type col))
            (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                  #"Cannot update properties on a semantic layer collection"
                                  (t2/update! :model/Collection (:id col) {:name "New Name"})))))))))

(deftest unpublish-tables-in-archived-collection-test
  (mt/with-premium-features #{:library}
    (mt/as-admin
      (mt/with-temp [:model/Collection archive-me {:name   "To be archived"
                                                   :type   collection/library-data-collection-type}
                     :model/Table      table      {:collection_id (:id archive-me)
                                                   :is_published  true}]
        (collection/archive-collection! archive-me)
        (testing "archiving a Library/Data subcollection unpublishes all the tables it contains"
          (is (=? {:is_published  false
                   :collection_id nil
                   :id            (:id table)}
                  (t2/select-one :model/Table :id (:id table))))
          (is (t2/select-one-fn :archived :model/Collection :id (:id archive-me))))))))

(deftest unpublish-tables-in-archived-collection-recursively-test
  (mt/with-premium-features #{:library}
    (mt/as-admin
      (mt/with-temp [:model/Collection archive-me {:name          "To be archived"
                                                   :type          collection/library-data-collection-type}
                     :model/Table      table1     {:collection_id (:id archive-me)
                                                   :is_published  true
                                                   :name          "Grandparent_Table"}
                     :model/Collection parent     {:name          "Middle collection"
                                                   :type          collection/library-data-collection-type
                                                   :location      (str "/" (:id archive-me) "/")}
                     :model/Table      table2     {:collection_id (:id parent)
                                                   :is_published  true
                                                   :name          "Parent_Table"}
                     :model/Collection child      {:name          "Innermost collection"
                                                   :type          collection/library-data-collection-type
                                                   :location      (str "/" (:id archive-me) "/" (:id parent) "/")}
                     :model/Table      table3     {:collection_id (:id child)
                                                   :is_published  true
                                                   :name          "Child_Table"}]
        (collection/archive-collection! archive-me)
        (testing "archiving a Library/Data subcollection unpublishes all the tables it contains **recursively**"
          (is (t2/select-one-fn :archived :model/Collection :id (:id archive-me)))
          (doseq [table [table1 table2 table3]]
            (is (=? {:is_published  false
                     :collection_id nil
                     :id            (:id table)}
                    (t2/select-one :model/Table :id (:id table))))))))))

(deftest archive-metrics-subcollection-goes-to-trash-test
  (mt/with-premium-features #{:library}
    (mt/as-admin
      (mt/with-temp [:model/Collection archive-me {:name "Metrics subcoll"
                                                   :type collection/library-metrics-collection-type}
                     :model/Card       metric     {:collection_id (:id archive-me)
                                                   :type          :metric}]
        (collection/archive-collection! archive-me)
        (testing "the collection is archived"
          (is (true? (t2/select-one-fn :archived :model/Collection :id (:id archive-me)))))
        (testing "the metric inside is archived"
          (is (true? (t2/select-one-fn :archived :model/Card :id (:id metric)))))
        (testing "the metric stays in its original collection (not unpublished/ejected)"
          (is (= (:id archive-me)
                 (t2/select-one-fn :collection_id :model/Card :id (:id metric)))))))))

(deftest disallow-cross-type-collection-nesting-test
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/Collection data-parent    {:name "Data Parent"    :type collection/library-data-collection-type}
                   :model/Collection metrics-parent {:name "Metrics Parent" :type collection/library-metrics-collection-type}
                   :model/Collection data-child     {:name "Data Child"     :type collection/library-data-collection-type
                                                     :location (str "/" (:id data-parent) "/")}
                   :model/Collection metrics-child  {:name "Metrics Child"  :type collection/library-metrics-collection-type
                                                     :location (str "/" (:id metrics-parent) "/")}]
      (testing "Cannot move a library-data collection into a library-metrics parent"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Can only add metrics"
                              (t2/update! :model/Collection (:id data-child)
                                          {:location (str "/" (:id metrics-parent) "/")}))))
      (testing "Cannot move a library-metrics collection into a library-data parent"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Can only add tables"
                              (t2/update! :model/Collection (:id metrics-child)
                                          {:location (str "/" (:id data-parent) "/")}))))
      (testing "Cannot move a library-data collection via API to a library-metrics parent"
        (is (= "Can only add metrics to the 'Metrics' collection"
               (mt/user-http-request :crowberto :put 400 (str "collection/" (:id data-child))
                                     {:parent_id (:id metrics-parent)}))))
      (testing "Cannot move a library-metrics collection via API to a library-data parent"
        (is (= "Can only add tables to the 'Data' collection"
               (mt/user-http-request :crowberto :put 400 (str "collection/" (:id metrics-child))
                                     {:parent_id (:id data-parent)})))))))

(deftest cannot-move-library-collections-to-vanilla-collection-test
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/Collection library-root   {:name "Library"  :type collection/library-collection-type}
                   :model/Collection data-root      {:name "Data"     :type collection/library-data-collection-type
                                                     :location (str "/" (:id library-root) "/")}
                   :model/Collection metrics-root   {:name "Metrics"  :type collection/library-metrics-collection-type
                                                     :location (str "/" (:id library-root) "/")}
                   :model/Collection data-sub       {:name "Data Sub" :type collection/library-data-collection-type
                                                     :location (str "/" (:id library-root) "/" (:id data-root) "/")}
                   :model/Collection metrics-sub    {:name "Metrics Sub" :type collection/library-metrics-collection-type
                                                     :location (str "/" (:id library-root) "/" (:id metrics-root) "/")}
                   :model/Collection vanilla        {:name "Vanilla Collection" :type nil}]
      (let [vanilla-location (str "/" (:id vanilla) "/")]
        (mt/with-dynamic-fn-redefs [collection/library-root-collection? (fn [coll]
                                                                          (contains? #{(:id library-root) (:id data-root) (:id metrics-root)}
                                                                                     (:id coll)))]
          (testing "Cannot move the Library collection itself into a vanilla collection"
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot update properties on a semantic layer collection"
                                  (t2/update! :model/Collection (:id library-root) {:location vanilla-location}))))
          (testing "Cannot move a top-level Data collection into a vanilla collection"
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot update properties on a semantic layer collection"
                                  (t2/update! :model/Collection (:id data-root) {:location vanilla-location}))))
          (testing "Cannot move a top-level Metrics collection into a vanilla collection"
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot update properties on a semantic layer collection"
                                  (t2/update! :model/Collection (:id metrics-root) {:location vanilla-location})))))
        (testing "Cannot move a Data subcollection into a vanilla collection"
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot move a semantic layer collection outside the semantic layer"
                                (t2/update! :model/Collection (:id data-sub) {:location vanilla-location}))))
        (testing "Cannot move a Metrics subcollection into a vanilla collection"
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot move a semantic layer collection outside the semantic layer"
                                (t2/update! :model/Collection (:id metrics-sub) {:location vanilla-location}))))))))

(defn- dashcard [id card-id & {:as extra}]
  (merge {:id id :card_id card-id :size_x 4 :size_y 4 :row 0 :col 0} extra))

(defn- insert-legacy-dashcard!
  "Insert a dashcard the way a pre-guard dashboard would hold one."
  [dashboard-id card-id]
  (binding [mi/*deserializing?* true]
    (t2/insert-returning-pk! :model/DashboardCard (merge (mt/with-temp-defaults :model/DashboardCard)
                                                         {:dashboard_id dashboard-id :card_id card-id}))))

(defn- insert-legacy-series!
  [dashcard-id card-id]
  (binding [mi/*deserializing?* true]
    (t2/insert-returning-pk! :model/DashboardCardSeries {:dashboardcard_id dashcard-id :card_id card-id :position 0})))

(defn- library-card-msg [& card-ids]
  (str "Only questions from the Library can be added to a Library dashboard. Card IDs not in the Library: "
       (str/join ", " (sort card-ids))
       ". Use a metric from the Library, or create a new question on this dashboard instead."))

(def ^:private library-card-msg-re #"^Only questions from the Library can be added to a Library dashboard\.")

(deftest library-dashboard-only-accepts-library-cards-test
  (let [msg library-card-msg]
    (mt/with-premium-features #{:library}
      (mt/with-temp [:model/Collection allow-dashboards {:name "Test Dashboards" :type collection/library-dashboards-collection-type}
                     :model/Collection allow-metrics    {:name "Test Metrics" :type collection/library-metrics-collection-type}
                     :model/Collection regular          {:name "Regular Collection"}
                     :model/Dashboard  library-dash     {:collection_id (:id allow-dashboards)}
                     :model/Dashboard  regular-dash     {:collection_id (:id regular)}
                     :model/Card       root-card        {:collection_id nil}
                     :model/Card       regular-card     {:collection_id (:id regular)}
                     :model/Card       other-regular    {:collection_id (:id regular)}
                     :model/Card       metric           {:collection_id (:id allow-metrics) :type :metric}
                     :model/Card       dash-question    {:collection_id (:id allow-dashboards)
                                                         :dashboard_id  (:id library-dash)
                                                         :type          :question}]
        (doseq [[path save!] {"API"   (fn [id updates status]
                                        (mt/user-http-request :crowberto :put status (str "dashboard/" id)
                                                              (if (map? updates) updates {:dashcards updates})))
                              "write" (fn [id updates status]
                                        (let [updates (if (map? updates) updates {:dashcards updates})]
                                          (mt/with-current-user (mt/user->id :crowberto)
                                            (if (= status 200)
                                              (dashboards.write/update-dashboard! id updates)
                                              (try (dashboards.write/update-dashboard! id updates)
                                                   (catch clojure.lang.ExceptionInfo e
                                                     (ex-message e)))))))}]
          (testing (str path ": ")
            (testing "library metrics and the dashboard's own questions are accepted"
              (is (some? (save! (:id library-dash) [(dashcard -1 (:id metric)) (dashcard -2 (:id dash-question) :row 4)] 200)))
              (t2/delete! :model/DashboardCard :dashboard_id (:id library-dash)))
            (testing "a non-library card is rejected when added"
              (doseq [card [root-card regular-card]]
                (is (= (msg (:id card)) (save! (:id library-dash) [(dashcard -1 (:id card))] 400)))
                (is (zero? (t2/count :model/DashboardCard :dashboard_id (:id library-dash))))))
            (when (= "API" path)
              (testing "the deprecated cards endpoint is guarded too"
                (is (= (msg (:id regular-card)) (mt/user-http-request :crowberto :put 400 (str "dashboard/" (:id library-dash) "/cards")
                                                                      {:cards [(dashcard -1 (:id regular-card))]})))))
            (testing "a non-library card is rejected as a series card"
              (is (= (msg (:id regular-card)) (save! (:id library-dash) [(dashcard -1 (:id metric) :series [{:id (:id regular-card)}])] 400))))
            (testing "a non-library card is rejected when replacing a library card"
              (mt/with-temp [:model/DashboardCard dc {:dashboard_id (:id library-dash) :card_id (:id metric)}]
                (is (= (msg (:id regular-card)) (save! (:id library-dash) [(dashcard (:id dc) (:id regular-card))] 400)))
                (is (= (:id metric) (t2/select-one-fn :card_id :model/DashboardCard :id (:id dc))))))
            (testing "moving a dashboard out of the library accepts a non-library card in the same save"
              (is (some? (save! (:id library-dash) {:collection_id (:id regular) :dashcards [(dashcard -1 (:id regular-card))]} 200)))
              (t2/delete! :model/DashboardCard :dashboard_id (:id library-dash))
              (binding [mi/*deserializing?* true]
                (t2/update! :model/Dashboard (:id library-dash) {:collection_id (:id allow-dashboards)})
                (t2/update! :model/Card (:id dash-question) {:collection_id (:id allow-dashboards)})))
            (testing "removing a legacy card and re-adding it in the same save is a new reference"
              (let [dc-id (insert-legacy-dashcard! (:id library-dash) (:id regular-card))]
                (try
                  (is (= (msg (:id regular-card)) (save! (:id library-dash) [(dashcard -1 (:id regular-card))] 400)))
                  (is (= [dc-id] (t2/select-pks-vec :model/DashboardCard :dashboard_id (:id library-dash))))
                  (finally
                    (t2/delete! :model/DashboardCard :dashboard_id (:id library-dash))))))
            (testing "references that predate the guard are grandfathered"
              (let [dc-id (insert-legacy-dashcard! (:id library-dash) (:id regular-card))]
                (try
                  (is (some? (save! (:id library-dash) [(dashcard dc-id (:id regular-card) :size_x 6)] 200)))
                  (is (= (msg (:id other-regular)) (save! (:id library-dash) [(dashcard dc-id (:id regular-card) :size_x 6)
                                                                              (dashcard -1 (:id other-regular))] 400)))
                  (finally
                    (t2/delete! :model/DashboardCard :id dc-id)))))))
        (testing "dashboards outside the library are unaffected"
          (is (some? (mt/user-http-request :crowberto :put 200 (str "dashboard/" (:id regular-dash))
                                           {:dashcards [(dashcard -1 (:id root-card))]}))))))
    (testing "without the library feature nothing is checked"
      (mt/with-premium-features #{}
        (mt/with-temp [:model/Collection allow-dashboards {:name "Test Dashboards" :type collection/library-dashboards-collection-type}
                       :model/Dashboard  library-dash     {:collection_id (:id allow-dashboards)}
                       :model/Card       root-card        {:collection_id nil}]
          (is (some? (mt/user-http-request :crowberto :put 200 (str "dashboard/" (:id library-dash))
                                           {:dashcards [(dashcard -1 (:id root-card))]}))))))))

(deftest shallow-copy-dashboard-into-library-dashboards-test
  (mt/with-premium-features #{:library}
    (let [mp    (mt/metadata-provider)
          query (lib/query mp (lib.metadata/table mp (mt/id :venues)))]
      (mt/with-temp [:model/Collection    allow-dashboards {:name "Test Base Library" :type collection/library-dashboards-collection-type}
                     :model/Collection    regular          {:name "Regular Collection"}
                     :model/Collection    allow-metrics    {:name "Test Metrics" :type collection/library-metrics-collection-type}
                     :model/Card          question         {:collection_id (:id regular) :type :question :dataset_query query}
                     :model/Card          series-question  {:collection_id (:id regular) :type :question :dataset_query query}
                     :model/Card          metric           {:collection_id (:id allow-metrics) :type :metric :dataset_query query}
                     :model/Card          regular-metric   {:collection_id (:id regular) :type :metric :dataset_query query}
                     :model/Card          model            {:collection_id (:id regular) :type :model :dataset_query query}
                     :model/Dashboard     dashboard        {:collection_id (:id regular)}
                     :model/DashboardCard dashcard         {:dashboard_id (:id dashboard) :card_id (:id question)}
                     :model/DashboardCardSeries _          {:dashboardcard_id (:id dashcard) :card_id (:id series-question)}
                     :model/DashboardCard _                {:dashboard_id (:id dashboard) :card_id (:id metric)}]
        (doseq [[path copy!] {"API"   #(mt/user-http-request :crowberto :post (:status %) (str "dashboard/" (:id dashboard) "/copy") (:body %))
                              "write" #(mt/with-current-user (mt/user->id :crowberto)
                                         (if (= 200 (:status %))
                                           (dashboards.write/copy-dashboard! (:id dashboard) (:body %))
                                           (try (dashboards.write/copy-dashboard! (:id dashboard) (:body %))
                                                (catch clojure.lang.ExceptionInfo e (ex-message e)))))}]
          (testing (str path ": a shallow copy into the Library copies regular questions and series as dashboard questions")
            (let [copy-id (:id (copy! {:status 200 :body {:collection_id (:id allow-dashboards) :is_deep_copy false}}))
                  dashcards (t2/select :model/DashboardCard :dashboard_id copy-id)
                  card-ids  (into #{} (mapcat #(cons (:card_id %) (t2/select-fn-vec :card_id :model/DashboardCardSeries :dashboardcard_id (:id %)))) dashcards)
                  cards     (t2/select :model/Card :id [:in card-ids])]
              (is (= 3 (count cards)))
              (is (= #{(:id metric)} (set (map :id (remove :dashboard_id cards)))))
              (is (every? #(= copy-id (:dashboard_id %)) (filter #(= :question (:type %)) cards)))
              (is (not-any? #{(:id question) (:id series-question)} card-ids))))
          (testing (str path ": a shallow copy into a regular collection still references the originals")
            (let [copy-id (:id (copy! {:status 200 :body {:collection_id (:id regular) :is_deep_copy false}}))]
              (is (= #{(:id question) (:id metric)}
                     (t2/select-fn-set :card_id :model/DashboardCard :dashboard_id copy-id)))))
          (testing (str path ": models cannot be referenced from a Library dashboard")
            (mt/with-temp [:model/DashboardCard _ {:dashboard_id (:id dashboard) :card_id (:id model)}]
              (is (= (library-card-msg (:id model))
                     (let [r (copy! {:status 400 :body {:collection_id (:id allow-dashboards) :is_deep_copy false}})]
                       (cond-> r (map? r) :message))))))
          (testing (str path ": a non-library metric cannot be referenced from a Library dashboard")
            (mt/with-temp [:model/DashboardCard _ {:dashboard_id (:id dashboard) :card_id (:id regular-metric)}]
              (is (= (library-card-msg (:id regular-metric))
                     (let [r (copy! {:status 400 :body {:collection_id (:id allow-dashboards) :is_deep_copy true}})]
                       (cond-> r (map? r) :message)))))))))))

(deftest copy-into-library-dashboards-series-test
  (mt/with-premium-features #{:library}
    (let [mp    (mt/metadata-provider)
          query (lib/query mp (lib.metadata/table mp (mt/id :venues)))]
      (mt/with-temp [:model/Collection    allow-dashboards {:name "Test Base Library" :type collection/library-dashboards-collection-type}
                     :model/Collection    allow-metrics    {:name "Test Metrics" :type collection/library-metrics-collection-type}
                     :model/Collection    regular          {:name "Regular Collection"}
                     :model/Card          metric           {:collection_id (:id allow-metrics) :type :metric :dataset_query query}
                     :model/Card          metric-series    {:collection_id (:id allow-metrics) :type :metric :dataset_query query}
                     :model/Card          series-question  {:collection_id (:id regular) :type :question :dataset_query query}
                     :model/Card          question         {:collection_id (:id regular) :type :question :dataset_query query}
                     :model/Dashboard     dashboard        {:collection_id (:id regular)}
                     :model/DashboardCard metric-dc        {:dashboard_id (:id dashboard) :card_id (:id metric)}
                     :model/DashboardCardSeries _          {:dashboardcard_id (:id metric-dc) :card_id (:id series-question)}
                     :model/DashboardCard question-dc      {:dashboard_id (:id dashboard) :card_id (:id question)}
                     :model/DashboardCardSeries _          {:dashboardcard_id (:id question-dc) :card_id (:id metric-series)}]
        (doseq [[path copy!] {"API"   #(:id (mt/user-http-request :crowberto :post 200 (str "dashboard/" (:id dashboard) "/copy") %))
                              "write" #(mt/with-current-user (mt/user->id :crowberto)
                                         (:id (dashboards.write/copy-dashboard! (:id dashboard) %)))}]
          (letfn [(series-ids [copy-id card-id]
                    (let [dc (t2/select-one :model/DashboardCard :dashboard_id copy-id :card_id [:in [card-id]])]
                      (t2/select-fn-set :card_id :model/DashboardCardSeries :dashboardcard_id (:id dc))))]
            (testing (str path ": copying into the Library remaps series on referenced and copied dashcards")
              (let [copy-id   (copy! {:collection_id (:id allow-dashboards) :is_deep_copy false})
                    copied-id (fn [card-id]
                                (t2/select-one-pk :model/Card :dashboard_id copy-id :name (t2/select-one-fn :name :model/Card card-id)))
                    new-sq    (copied-id (:id series-question))
                    new-q     (copied-id (:id question))]
                (is (some? new-sq))
                (is (= #{new-sq} (series-ids copy-id (:id metric))))
                (is (= #{(:id metric-series)} (series-ids copy-id new-q)))))
            (testing (str path ": copying into a regular collection keeps referencing the original series")
              (let [copy-id (copy! {:collection_id (:id regular) :is_deep_copy false})]
                (is (= #{(:id series-question)} (series-ids copy-id (:id metric))))
                (is (= #{(:id metric-series)} (series-ids copy-id (:id question))))))))))))

(deftest shallow-copy-dashboard-with-dashboard-questions-into-library-test
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/Collection allow-dashboards {:name "Test Base Library" :type collection/library-dashboards-collection-type}
                   :model/Collection regular          {:name "Regular Collection"}
                   :model/Dashboard  dashboard        {:collection_id (:id regular)}
                   :model/Card       _                {:collection_id (:id regular) :dashboard_id (:id dashboard) :type :question}]
      (testing "a shallow copy into the Library is made deep instead of being rejected"
        (is (some? (mt/user-http-request :crowberto :post 200 (str "dashboard/" (:id dashboard) "/copy")
                                         {:collection_id (:id allow-dashboards) :is_deep_copy false}))))
      (testing "a shallow copy into a regular collection is still rejected"
        (mt/user-http-request :crowberto :post 400 (str "dashboard/" (:id dashboard) "/copy")
                              {:collection_id (:id regular) :is_deep_copy false})))))

(deftest library-dashboard-dashcard-hooks-test
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/Collection allow-dashboards {:name "Test Dashboards" :type collection/library-dashboards-collection-type}
                   :model/Collection allow-metrics    {:name "Test Metrics" :type collection/library-metrics-collection-type}
                   :model/Collection regular          {:name "Regular Collection"}
                   :model/Dashboard  library-dash     {:collection_id (:id allow-dashboards)}
                   :model/Dashboard  regular-dash     {:collection_id (:id regular)}
                   :model/Card       regular-card     {:collection_id (:id regular)}
                   :model/Card       other-regular    {:collection_id (:id regular)}
                   :model/Card       metric           {:collection_id (:id allow-metrics) :type :metric}]
      (let [insert! (fn [dashboard card] (t2/insert! :model/DashboardCard
                                                     (merge (mt/with-temp-defaults :model/DashboardCard)
                                                            {:dashboard_id (:id dashboard) :card_id (:id card)})))]
        (testing "insert"
          (testing "a non-library card is rejected"
            (is (thrown-with-msg? clojure.lang.ExceptionInfo library-card-msg-re
                                  (insert! library-dash regular-card)))
            (is (zero? (t2/count :model/DashboardCard :dashboard_id (:id library-dash)))))
          (testing "a library card and a virtual card are accepted"
            (is (some? (insert! library-dash metric)))
            (is (some? (t2/insert! :model/DashboardCard (merge (mt/with-temp-defaults :model/DashboardCard)
                                                               {:dashboard_id (:id library-dash) :card_id nil})))))
          (testing "a dashboard outside the library is unaffected"
            (is (some? (insert! regular-dash regular-card))))
          (testing "a card the dashboard already references is grandfathered"
            (let [dc-id (insert-legacy-dashcard! (:id library-dash) (:id regular-card))]
              (is (some? (insert! library-dash regular-card)))
              (is (= (library-card-msg (:id other-regular)) (try (insert! library-dash other-regular) (catch clojure.lang.ExceptionInfo e (ex-message e)))))
              (testing "including a card that is only a series of one of its dashcards"
                (let [dc2-id (insert-legacy-dashcard! (:id library-dash) (:id metric))]
                  (insert-legacy-series! dc2-id (:id other-regular))
                  (is (some? (insert! library-dash other-regular)))))
              (t2/delete! :model/DashboardCard :dashboard_id (:id library-dash))
              (is (some? dc-id))))
          (testing "deserializing bypasses the check"
            (is (some? (insert-legacy-dashcard! (:id library-dash) (:id regular-card)))))
          (t2/delete! :model/DashboardCard :dashboard_id (:id library-dash))
          (testing "without the library feature nothing is checked"
            (mt/with-premium-features #{}
              (is (some? (insert! library-dash regular-card))))))
        (t2/delete! :model/DashboardCard :dashboard_id (:id library-dash))
        (testing "update"
          (let [dc-id (insert-legacy-dashcard! (:id library-dash) (:id regular-card))]
            (testing "changing the card to a non-library card is rejected"
              (is (thrown-with-msg? clojure.lang.ExceptionInfo library-card-msg-re
                                    (t2/update! :model/DashboardCard dc-id {:card_id (:id other-regular)})))
              (is (= (:id regular-card) (t2/select-one-fn :card_id :model/DashboardCard :id dc-id))))
            (testing "changes that leave the card alone are not checked, so a legacy reference still saves"
              (is (= 1 (t2/update! :model/DashboardCard dc-id {:size_x 7})))
              (is (= 1 (t2/update! :model/DashboardCard dc-id {:card_id (:id regular-card) :size_x 8}))))
            (testing "changing the card to a library card is accepted"
              (is (= 1 (t2/update! :model/DashboardCard dc-id {:card_id (:id metric)}))))
            (testing "the instance form is checked too"
              (is (thrown-with-msg? clojure.lang.ExceptionInfo library-card-msg-re
                                    (t2/update! :model/DashboardCard (assoc (t2/select-one :model/DashboardCard :id dc-id)
                                                                            :card_id (:id other-regular))))))
            (testing "deserializing bypasses the check"
              (binding [mi/*deserializing?* true]
                (is (= 1 (t2/update! :model/DashboardCard dc-id {:card_id (:id other-regular)})))))
            (testing "without the library feature nothing is checked"
              (mt/with-premium-features #{}
                (is (= 1 (t2/update! :model/DashboardCard dc-id {:card_id (:id regular-card)})))))
            (testing "a dashboard outside the library is unaffected"
              (let [rdc-id (insert-legacy-dashcard! (:id regular-dash) (:id metric))]
                (is (= 1 (t2/update! :model/DashboardCard rdc-id {:card_id (:id other-regular)}))))))
          (t2/delete! :model/DashboardCard :dashboard_id (:id library-dash)))))))

(deftest library-dashboard-series-hooks-test
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/Collection allow-dashboards {:name "Test Dashboards" :type collection/library-dashboards-collection-type}
                   :model/Collection allow-metrics    {:name "Test Metrics" :type collection/library-metrics-collection-type}
                   :model/Collection regular          {:name "Regular Collection"}
                   :model/Dashboard  library-dash     {:collection_id (:id allow-dashboards)}
                   :model/Dashboard  regular-dash     {:collection_id (:id regular)}
                   :model/Card       regular-card     {:collection_id (:id regular)}
                   :model/Card       other-regular    {:collection_id (:id regular)}
                   :model/Card       metric           {:collection_id (:id allow-metrics) :type :metric}
                   :model/Card       metric-2         {:collection_id (:id allow-metrics) :type :metric}]
      (let [library-dc (insert-legacy-dashcard! (:id library-dash) (:id metric))
            regular-dc (insert-legacy-dashcard! (:id regular-dash) (:id regular-card))
            insert!    (fn [dc-id card] (t2/insert! :model/DashboardCardSeries {:dashboardcard_id dc-id :card_id (:id card) :position 0}))
            series     (fn [dc-id] (t2/select-fn-vec :card_id :model/DashboardCardSeries :dashboardcard_id dc-id {:order-by [:position]}))]
        (testing "a non-library series card is rejected"
          (is (thrown-with-msg? clojure.lang.ExceptionInfo library-card-msg-re
                                (insert! library-dc regular-card)))
          (is (empty? (series library-dc))))
        (testing "a library series card is accepted"
          (is (some? (insert! library-dc metric-2))))
        (testing "a dashboard outside the library is unaffected"
          (is (some? (insert! regular-dc other-regular))))
        (testing "deserializing bypasses the check"
          (is (some? (insert-legacy-series! library-dc (:id regular-card)))))
        (testing "without the library feature nothing is checked"
          (mt/with-premium-features #{}
            (is (some? (insert! library-dc other-regular)))))
        (t2/delete! :model/DashboardCardSeries :dashboardcard_id library-dc)
        (testing "update-dashboard-cards-series! keeps a legacy series card and rejects a new non-library one"
          (insert-legacy-series! library-dc (:id regular-card))
          (dashboard-card/update-dashboard-cards-series! {library-dc [(:id regular-card) (:id metric-2)]})
          (is (= [(:id regular-card) (:id metric-2)] (series library-dc)))
          (is (thrown-with-msg? clojure.lang.ExceptionInfo library-card-msg-re
                                (dashboard-card/update-dashboard-cards-series! {library-dc [(:id regular-card) (:id other-regular)]})))
          (testing "and the existing series are left in place"
            (is (= [(:id regular-card) (:id metric-2)] (series library-dc)))))
        (testing "a series card may move between dashcards of the same dashboard"
          (let [dc-2 (t2/insert-returning-pk! :model/DashboardCard (merge (mt/with-temp-defaults :model/DashboardCard)
                                                                          {:dashboard_id (:id library-dash) :card_id (:id metric-2)}))]
            (dashboard-card/update-dashboard-cards-series! {library-dc [(:id metric-2)]
                                                            dc-2       [(:id regular-card)]})
            (is (= [(:id regular-card)] (series dc-2)))))))))

(deftest revert-library-dashboard-dashcards-test
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/Collection allow-dashboards {:name "Test Dashboards" :type collection/library-dashboards-collection-type}
                   :model/Collection regular          {:name "Regular Collection"}
                   :model/Dashboard  dash             {:collection_id (:id allow-dashboards)}
                   :model/Card       regular-card     {:collection_id (:id regular)}]
      (let [dc-id      (insert-legacy-dashcard! (:id dash) (:id regular-card))
            user-id    (mt/user->id :crowberto)
            serialized (revision/serialize-instance :model/Dashboard (:id dash) (t2/select-one :model/Dashboard :id (:id dash)))]
        (testing "reverting a dashboard that still holds the legacy card keeps it"
          (revision/revert-to-revision! :model/Dashboard (:id dash) user-id serialized)
          (is (= #{(:id regular-card)} (t2/select-fn-set :card_id :model/DashboardCard :dashboard_id (:id dash)))))
        (testing "reverting to a revision that brings a removed non-library card back is rejected"
          (dashboard-card/delete-dashboard-cards! [dc-id])
          (is (thrown-with-msg? clojure.lang.ExceptionInfo library-card-msg-re
                                (revision/revert-to-revision! :model/Dashboard (:id dash) user-id serialized)))
          (is (zero? (t2/count :model/DashboardCard :dashboard_id (:id dash)))))))))

(deftest save-transient-dashboard-into-library-dashboards-test
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/Collection allow-dashboards {:name "Test Dashboards" :type collection/library-dashboards-collection-type}
                   :model/Collection allow-metrics    {:name "Test Metrics" :type collection/library-metrics-collection-type}
                   :model/Collection regular          {:name "Regular Collection"}
                   :model/Card       regular-card     {:collection_id (:id regular)}
                   :model/Card       metric           {:collection_id (:id allow-metrics) :type :metric}]
      (let [save!  (fn [status card]
                     (mt/user-http-request :crowberto :post status (str "dashboard/save/collection/" (:id allow-dashboards))
                                           {:name "Transient" :dashcards [{:card {:id (:id card)} :row 0 :col 0 :size_x 4 :size_y 4}]}))
            count! #(t2/count :model/Dashboard :collection_id (:id allow-dashboards))]
        (testing "an existing non-library question is rejected and nothing is saved"
          (is (= (library-card-msg (:id regular-card)) (save! 400 regular-card)))
          (is (zero? (count!))))
        (testing "an existing library metric is accepted"
          (is (some? (save! 200 metric)))
          (is (= 1 (count!))))))))

(deftest move-dashboard-question-between-dashboards-test
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/Collection allow-dashboards {:name "Test Dashboards" :type collection/library-dashboards-collection-type}
                   :model/Collection regular          {:name "Regular Collection"}
                   :model/Dashboard  library-dash     {:collection_id (:id allow-dashboards)}
                   :model/Dashboard  library-dash-2   {:collection_id (:id allow-dashboards)}
                   :model/Dashboard  regular-dash     {:collection_id (:id regular)}
                   :model/Card       dash-question    {:dashboard_id (:id library-dash) :type :question}
                   :model/Card       regular-question {:collection_id (:id regular) :type :question}]
      (insert-legacy-dashcard! (:id library-dash) (:id dash-question))
      (testing "a dashboard question moved to a regular dashboard leaves its Library dashboard"
        (mt/user-http-request :crowberto :put 200 (str "card/" (:id dash-question)) {:dashboard_id (:id regular-dash)})
        (is (= (:id regular) (t2/select-one-fn :collection_id :model/Card (:id dash-question))))
        (is (not (t2/exists? :model/DashboardCard :dashboard_id (:id library-dash)))))
      (testing "a regular question moved into a Library dashboard becomes its dashboard question"
        (mt/user-http-request :crowberto :put 200 (str "card/" (:id regular-question)) {:dashboard_id (:id library-dash-2)})
        (is (= (:id allow-dashboards) (t2/select-one-fn :collection_id :model/Card (:id regular-question))))
        (is (t2/exists? :model/DashboardCard :dashboard_id (:id library-dash-2) :card_id (:id regular-question)))))))

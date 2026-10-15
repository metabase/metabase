(ns metabase-enterprise.library-branching.instance.lock-test
  "The row locks of `current`: while a transaction holds the content of an item from `current`, a save of that item by
  another connection waits. The test sees the wait as a lock timeout of the other connection, so it needs no sleep.
  Another connection sees only committed rows, so these tests commit their content and delete it afterwards; they
  are not parallel."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.features-test-util :as features.tu]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.app-db :as app-db]
   [metabase.app-db.core :as mdb]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2])
  (:import
   (java.sql Connection)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db) features.tu/with-features)

(defn- sum-query
  [table field]
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id table)))
        (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id table field)))))))

(defn- children-location
  [{:keys [id location]}]
  (str location id "/"))

(defn- do-uninterrupted
  "Calls `f` with no arguments with the interrupt status of the thread clear, and returns its result; then sets the
  status again iff it was set. So a cancel of the thread, as a mutation run does at its timeout, does not stop `f`."
  [f]
  (let [interrupted? (Thread/interrupted)]
    (try
      (f)
      (finally
        (when interrupted?
          (.interrupt (Thread/currentThread)))))))

(defn- do-with-committed-content
  "Calls `f` with a function `(insert! model row)` that inserts and commits a row and returns it, and with the Library
  collection (made for the call when there is none). Deletes every inserted row afterwards, the last first, also when
  the thread is interrupted."
  [f]
  (let [inserted (atom ())
        insert!  (fn [model row]
                   (let [r (t2/insert-returning-instance! model row)]
                     (swap! inserted conj [model r])
                     r))]
    (try
      (f insert! (or (t2/select-one :model/Collection :type "library" :archived false)
                     (insert! :model/Collection {:name "Library" :type "library" :location "/"})))
      (finally
        (do-uninterrupted
         #(doseq [[model row] @inserted]
            (case model
              :model/TableUserSettings (t2/delete! :model/TableUserSettings :table_id (:table_id row))
              :model/FieldUserSettings (t2/delete! :model/FieldUserSettings :field_id (:field_id row))
              :model/QueryAction       (t2/delete! :model/QueryAction :action_id (:action_id row))
              (t2/delete! model :id (:id row)))))))))

(defn- with-short-lock-wait!
  "Calls `f` in a transaction on a connection of its own whose lock waits end in an error after at most 1 s, and
  returns its result. Restores the connection's setting before the pool gets it back."
  [f]
  (t2/with-connection [^Connection conn]
    (case (mdb/db-type)
      :h2 (let [before (:t (t2/query-one ["SELECT LOCK_TIMEOUT() AS t"]))]
            (t2/query ["SET LOCK_TIMEOUT 100"])
            (try (t2/with-transaction [_ conn] (f))
                 (finally (t2/query [(str "SET LOCK_TIMEOUT " (long before))]))))
      :postgres (t2/with-transaction [_ conn]
                  (t2/query ["SET LOCAL lock_timeout = '100ms'"])
                  (f))
      (:mysql :mariadb) (let [before (:t (t2/query-one ["SELECT @@innodb_lock_wait_timeout AS t"]))]
                          (t2/query ["SET SESSION innodb_lock_wait_timeout = 1"])
                          (try (t2/with-transaction [_ conn] (f))
                               (finally (t2/query [(str "SET SESSION innodb_lock_wait_timeout = " (long before))])))))))

(defn- save-result!
  "`:saved` when `save!` commits on another connection, `:lock-wait` when it fails, as a wait for a row lock does."
  [save!]
  (try
    (with-short-lock-wait! save!)
    :saved
    (catch Exception _
      :lock-wait)))

(defn- while-current-holds!
  "Calls `(current ks id)` in a transaction of another thread, and while that transaction is open, `(save-result!
  save!)`. Returns `[the result of current, the save result while it held, the save result after]`. The transaction of
  the other thread has ended when this returns or throws, also when this thread is interrupted."
  [ks id save!]
  (let [held    (promise)
        release (promise)
        holder  (future
                  (try
                    (t2/with-transaction [_]
                      (deliver held (instance/current ks id))
                      (deref release 60000 nil))
                    (finally
                      ;; When current throws, the wait for `held` ends at once, and `@holder` rethrows.
                      (deliver held ::no-content))))]
    (try
      (let [content (deref held 60000 ::no-content)
            during  (save-result! save!)]
        (deliver release true)
        @holder
        [content during (save-result! save!)])
      (finally
        ;; The row locks of the other transaction would make the deletes of the cleanup wait.
        (deliver release true)
        (do-uninterrupted #(try (deref holder 60000 nil) (catch Exception _ nil)))))))

(deftest current-locks-the-row-test
  (testing (str "while a transaction holds an item from current, another connection waits to save it; app DB "
                (mdb/db-type))
    (do-with-committed-content
     (fn [insert! library]
       (let [user    (mt/user->id :crowberto)
             metrics (insert! :model/Collection {:name     "Lock metrics"
                                                 :type     "library-metrics"
                                                 :location (children-location library)})
             data    (insert! :model/Collection {:name     "Lock data"
                                                 :type     "library-data"
                                                 :location (children-location library)})
             metric  (insert! :model/Card {:name "Locked" :type :metric :collection_id (:id metrics) :creator_id user
                                           :display :scalar :visualization_settings {}
                                           :dataset_query (sum-query :venues :price)})
             snippet (insert! :model/NativeQuerySnippet {:name       (str "Locked snippet " (random-uuid))
                                                         :content    "1 = 1"
                                                         :creator_id user})
             _       (insert! :model/TableUserSettings {:table_id      (mt/id :venues)
                                                        :is_published  true
                                                        :collection_id (:id data)})
             _       (insert! :model/FieldUserSettings {:field_id (mt/id :venues :price) :display_name "Locked price"})
             term    (insert! :model/Glossary {:term       (str "Locked term " (random-uuid))
                                               :definition "Held."
                                               :creator_id user})
             segment (insert! :model/Segment {:name       "Locked segment"
                                              :table_id   (mt/id :venues)
                                              :creator_id user
                                              :definition (let [mp (mt/metadata-provider)]
                                                            (lib/filter (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                                                        (lib/< (lib.metadata/field mp (mt/id :venues :price)) 2)))})
             measure (insert! :model/Measure {:name       "Locked measure"
                                              :table_id   (mt/id :venues)
                                              :creator_id user
                                              :definition (sum-query :venues :price)})
             dashes  (insert! :model/Collection {:name     "Lock dashboards"
                                                 :type     "library-dashboards"
                                                 :location (children-location library)})
             tl      (insert! :model/Timeline {:name "Locked timeline" :collection_id (:id dashes) :icon "star"
                                               :creator_id user})
             event   (insert! :model/TimelineEvent {:timeline_id (:id tl) :name "Locked event" :timezone "UTC"
                                                    :timestamp (java.time.OffsetDateTime/parse "2024-01-01T00:00:00Z")
                                                    :time_matters false :icon "star" :creator_id user})
             dash    (insert! :model/Dashboard {:name "Locked dashboard" :collection_id (:id dashes) :creator_id user
                                                :parameters []})
             tab     (insert! :model/DashboardTab {:dashboard_id (:id dash) :name "Locked tab" :position 0})
             dashcard (insert! :model/DashboardCard {:dashboard_id (:id dash) :card_id (:id metric)
                                                     :dashboard_tab_id (:id tab) :row 0 :col 0 :size_x 4 :size_y 4})
             action  (insert! :model/Action {:name "Locked action" :type :query :creator_id user})
             _       (insert! :model/QueryAction {:action_id     (:id action)
                                                  :dataset_query (lib/native-query (mt/metadata-provider)
                                                                                   "UPDATE venues SET name = 'x'")})
             stores  app-db/kind-stores
             table   (let [{:keys [schema name]} (t2/select-one :model/Table (mt/id :venues))]
                       [(t2/select-one-fn :name :model/Database (mt/id)) schema name])]
         (doseq [[label kind id save!]
                 [["a metric" :metric (:entity_id metric)
                   #(t2/query-one {:update :report_card :set {:name "Saved"} :where [:= :id (:id metric)]})]
                  ["a collection" :collection (:entity_id metrics)
                   #(t2/query-one {:update :collection :set {:name "Saved"} :where [:= :id (:id metrics)]})]
                  ["a snippet" :snippet (:entity_id snippet)
                   #(t2/query-one {:update :native_query_snippet :set {:content "2 = 2"} :where [:= :id (:id snippet)]})]
                  ["the settings row of a published table" :published-table table
                   #(t2/query-one {:update :metabase_table_user_settings :set {:description "Saved"}
                                   :where  [:= :table_id (mt/id :venues)]})]
                  ["the settings row of a field of a published table" :published-table table
                   #(t2/query-one {:update :metabase_field_user_settings :set {:description "Saved"}
                                   :where  [:= :field_id (mt/id :venues :price)]})]
                  ["a glossary term" :glossary-term (:entity_id term)
                   #(t2/query-one {:update :glossary :set {:definition "Saved"} :where [:= :id (:id term)]})]
                  ["a segment" :segment (:entity_id segment)
                   #(t2/query-one {:update :segment :set {:name "Saved"} :where [:= :id (:id segment)]})]
                  ["a measure" :measure (:entity_id measure)
                   #(t2/query-one {:update :measure :set {:name "Saved"} :where [:= :id (:id measure)]})]
                  ["a timeline" :timeline (:entity_id tl)
                   #(t2/query-one {:update :timeline :set {:name "Saved"} :where [:= :id (:id tl)]})]
                  ["an event of a timeline" :timeline (:entity_id tl)
                   #(t2/query-one {:update :timeline_event :set {:name "Saved"} :where [:= :id (:id event)]})]
                  ["a dashboard" :dashboard (:entity_id dash)
                   #(t2/query-one {:update :report_dashboard :set {:name "Saved"} :where [:= :id (:id dash)]})]
                  ["a tab of a dashboard" :dashboard (:entity_id dash)
                   #(t2/query-one {:update :dashboard_tab :set {:name "Saved"} :where [:= :id (:id tab)]})]
                  ["a card of a dashboard" :dashboard (:entity_id dash)
                   #(t2/query-one {:update :report_dashboardcard :set {:row 1} :where [:= :id (:id dashcard)]})]
                  ["an action" :action (:entity_id action)
                   #(t2/query-one {:update :action :set {:name "Saved"} :where [:= :id (:id action)]})]
                  ["the query row of an action" :action (:entity_id action)
                   #(t2/query-one {:update :query_action :set {:legacy_query "Saved"}
                                   :where  [:= :action_id (:id action)]})]]]
           (testing label
             (let [[current during after] (while-current-holds! (get stores kind) id save!)]
               (is (= :live (:state current)))
               (is (map? (:content current)))
               (is (= :lock-wait during))
               (is (= :saved after))))))))))

(ns metabase-enterprise.permission-debug.audit-test
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.api.common :as api]
   [metabase.app-db.core :as mdb]
   [metabase.events.core :as events]
   [metabase.permissions.core :as perms]
   [metabase.session.core :as session]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fn [thunk]
                      (mt/with-premium-features #{:advanced-permissions :audit-app}
                        (thunk))))

(def ^:private start-topic "permission-preview-start")

(defn- admin-session-key
  "Insert a login session of the admin and return its key."
  []
  (let [session-key (session/generate-session-key)]
    (t2/insert! :model/Session {:id         (session/generate-session-id)
                                :key_hashed (session/hash-session-key session-key)
                                :user_id    (mt/user->id :crowberto)})
    session-key))

(defn- start-preview!
  "Start a preview with `body` from the admin session `session-key`, expecting `status`, and return the response."
  ([session-key body]
   (start-preview! session-key body 200))
  ([session-key body status]
   (client/client session-key :post status "ee/permission_debug/preview/session" body)))

(defn- as-preview
  "Call `endpoint` with the preview `token` and no other credential, expecting `status`."
  [token method status endpoint & args]
  (apply client/client method status endpoint {:request-options {:headers {"x-metabase-preview-token" token}}} args))

(defn- start-rows []
  (t2/select :model/AuditLog :topic start-topic {:order-by [[:id :asc]]}))

(deftest start-records-one-activity-log-row-test
  (mt/with-temp [:model/PermissionsGroup {group-id :id} {}]
    (let [session-key (admin-session-key)]
      (testing "a user preview records the admin as the user, and the person as the entity"
        (let [rows-before (count (start-rows))]
          (start-preview! session-key {:user_id (mt/user->id :rasta)})
          (is (= rows-before (dec (count (start-rows)))))
          (is (= {:topic    :permission-preview-start
                  :user_id  (mt/user->id :crowberto)
                  :model    "User"
                  :model_id (mt/user->id :rasta)}
                 (select-keys (last (start-rows)) [:topic :user_id :model :model_id])))))
      (testing "a group preview records the admin as the user, and the group as the entity"
        (let [rows-before (count (start-rows))]
          (start-preview! session-key {:group_id group-id})
          (is (= rows-before (dec (count (start-rows)))))
          (is (= {:user_id  (mt/user->id :crowberto)
                  :model    "PermissionsGroup"
                  :model_id group-id}
                 (select-keys (last (start-rows)) [:user_id :model :model_id])))))
      (testing "a start that is refused records nothing"
        (let [rows-before (count (start-rows))]
          (start-preview! session-key {:user_id (mt/user->id :crowberto)} 400)
          (is (= rows-before (count (start-rows)))))))))

(deftest audit-log-names-the-previewing-admin-test
  (mt/with-temp [:model/User {user-id :id} {}]
    (let [rows        #(t2/select :model/AuditLog :topic "user-joined" {:order-by [[:id :asc]]})
          rows-before (count (rows))
          join!       #(events/publish-event! :event/user-joined {:user-id user-id})]
      (testing "guard: outside a preview, the row names the user of the event"
        (join!)
        (is (= (inc rows-before) (count (rows))))
        (is (= user-id (:user_id (last (rows))))))
      (testing "during a preview, the same event is recorded under the admin"
        (binding [api/*previewing-admin-id* (mt/user->id :crowberto)]
          (join!))
        (is (= (+ rows-before 2) (count (rows))))
        (is (= (mt/user->id :crowberto) (:user_id (last (rows)))))))))

(defn- venues-count-query
  "A query counting the venues, with a filter no other query has, so it is saved as a new query."
  []
  {:database (mt/id)
   :type     :query
   :query    {:source-table (mt/id :venues)
              :aggregation  [[:count]]
              :filter       [:!= [:field (mt/id :venues :name) nil] (str (random-uuid))]}})

(defn- last-query-execution []
  (t2/select-one :model/QueryExecution {:order-by [[:id :desc]]}))

(deftest a-tenant-users-preview-logs-the-admins-tenant-test
  (mt/with-additional-premium-features #{:tenants}
    (mt/with-temporary-setting-values [synchronous-batch-updates true
                                       use-tenants               true]
      (mt/with-temp [:model/Tenant {tenant-id :id} {:name "Log tenant" :slug "log-tenant"}
                     :model/User {user-id :id} {:tenant_id tenant-id}
                     :model/Collection {collection-id :id} {}
                     :model/Card {card-id :id} {:collection_id collection-id
                                                :dataset_query (venues-count-query)}]
        (let [{:keys [token]} (start-preview! (admin-session-key) {:user_id user-id})
              admin-row       {:user_id (mt/user->id :crowberto), :tenant_id nil}]
          (testing "the view log row of a refused open"
            (as-preview token :get 403 (str "card/" card-id))
            (is (= admin-row
                   (select-keys (t2/select-one :model/ViewLog :model "card" :model_id card-id) [:user_id :tenant_id]))))
          (testing "the query log row of a refused run"
            (as-preview token :post 403 "dataset" (venues-count-query))
            (is (= {:executor_id (mt/user->id :crowberto), :tenant_id nil}
                   (select-keys (last-query-execution) [:executor_id :tenant_id])))))))))

(deftest a-sandboxed-preview-keeps-how-its-query-ran-test
  (met/with-gtaps! {:gtaps      {:venues {:remappings {:category [:dimension
                                                                  [:field (mt/id :venues :category_id) nil]]}}}
                    :attributes {"category" "50"}}
    (mt/with-temporary-setting-values [synchronous-batch-updates true]
      (let [{:keys [token]} (start-preview! (admin-session-key) {:user_id (mt/user->id :rasta)})]
        (as-preview token :post 202 "dataset" (venues-count-query))
        (is (=? {:executor_id     (mt/user->id :crowberto)
                 :is_sandboxed    true
                 :sandbox_details seq}
                (last-query-execution)))))))

(def ^:private skipped-tables
  "Tables whose rows change with no read involved, or that aren't data of the app."
  #{"databasechangelog" "databasechangeloglock" "task_history"})

(defn- app-db-table-names []
  (t2/with-connection [^java.sql.Connection connection]
    ;; Postgres lists a partitioned table, such as query_execution, only under its own table type.
    (with-open [tables (.getTables (.getMetaData connection) nil (.getSchema connection) nil
                                   (into-array String ["TABLE" "PARTITIONED TABLE"]))]
      (->> (loop [names []]
             (if (.next tables)
               (recur (conj names (.getString tables "TABLE_NAME")))
               names))
           (remove #(or (contains? skipped-tables (u/lower-case-en %))
                        (str/starts-with? (u/lower-case-en %) "qrtz_")
                        (str/starts-with? (u/lower-case-en %) "search_index")))))))

(defn- table-rows
  "Every row of the table `table-name`, as a set of maps that compare by value."
  [table-name]
  (let [quote-mark (if (contains? #{:mysql :mariadb} (mdb/db-type)) "`" "\"")]
    (into #{}
          (map (fn [row] (update-vals row #(if (bytes? %) (vec %) %))))
          (t2/query [(str "SELECT * FROM " quote-mark table-name quote-mark)]))))

(defn- app-db-snapshot
  "Every row of every application database table, by table name."
  []
  (into {} (map (juxt u/lower-case-en table-rows)) (app-db-table-names)))

(defn- changes-since
  "The rows added to and removed from each application database table since `snapshot`, only for the tables that
  changed."
  [snapshot]
  (into {}
        (keep (fn [[table-name rows-after]]
                (let [rows-before (get snapshot table-name #{})
                      added       (set/difference rows-after rows-before)
                      removed     (set/difference rows-before rows-after)]
                  (when (or (seq added) (seq removed))
                    [table-name {:added added, :removed removed}]))))
        (app-db-snapshot)))

(defn- rows-of [changes table-name]
  (let [{:keys [added removed]} (get changes table-name)]
    (set/union added removed)))

(defn- tied-to-user?
  "Whether `row` names `user-id` in a column that says whose activity the row is."
  [user-id row]
  (some (fn [[column value]]
          (and (= value user-id)
               (re-find #"(^|_)(user|executor)_id$" (name column))))
        row))

(def ^:private shared-tables
  "The tables a read may change in a preview, because their view counts and last-used times are shared counters that
  show as nobody's activity (the tech doc, \"5. Audit and logging\")."
  #{"report_card" "report_dashboard" "metabase_table"})

(defn- query-log-table?
  "Whether `table-name` is the query log or one of its partitions, which Postgres lists beside it."
  [table-name]
  (str/starts-with? table-name "query_execution"))

(defn- log-user-column
  "The column that names whose activity a row of the log table `table-name` is, or nil when it is no log table."
  [table-name]
  (cond
    (query-log-table? table-name)          :executor_id
    (#{"view_log" "audit_log"} table-name) :user_id))

(def ^:private shared-counter-lock-names
  "The `metabase_cluster_lock` rows that updating the `shared-tables` counters adds the first time it takes each lock."
  #{;; card view counts (metabase.view-log.events.view-log) and card last-used times
    ;; (metabase.query-processor.middleware.update-used-cards)
    "metabase.app-db.cluster-lock/statistics-lock"
    ;; dashboard view counts and last-viewed times (metabase.view-log.events.view-log)
    "metabase.view-log.events.view-log/dashboard-statistics-lock"
    ;; table view counts (metabase.view-log.events.view-log)
    "metabase.events.view_log/metabase_table-view-count"})

(defn- read-everything!
  "Do the main reads with `request-fn`, which takes the method, the status, the endpoint and a body: open a question
  and a dashboard, open a collection, change a dashboard filter, run a saved question and an ad hoc query, download a
  question's results, open a metric whose dimensions were never synced, which records a card update in the audit log,
  and open a question the person may not read."
  [request-fn {:keys [collection-id card-id dashboard-id dashcard-id metric-id hidden-card-id ad-hoc-query]}]
  (request-fn :get 200 (str "card/" card-id))
  (request-fn :get 200 (str "dashboard/" dashboard-id))
  (request-fn :get 200 (str "collection/" collection-id))
  (request-fn :get 200 (format "collection/%d/items" collection-id))
  (request-fn :post 202 (format "dashboard/%d/dashcard/%d/card/%d/query" dashboard-id dashcard-id card-id)
              {:parameters [{:id "a" :value ["Marcus"]}]})
  (request-fn :post 202 (format "card/%d/query" card-id) {})
  (request-fn :post 202 "dataset" ad-hoc-query)
  (request-fn :post 200 (format "card/%d/query/csv" card-id) {})
  (request-fn :get 200 (str "metric/" metric-id))
  (request-fn :get 403 (str "card/" hidden-card-id)))

(deftest a-preview-logs-its-reads-under-the-admin-test
  (mt/with-temporary-setting-values [synchronous-batch-updates true]
    (mt/with-temp [:model/Collection {collection-id :id :as collection} {}
                   :model/Collection {hidden-collection-id :id} {}
                   :model/Card {card-id :id} {:collection_id   collection-id
                                              :database_id     (mt/id)
                                              :query_type      :native
                                              :dataset_query   {:type     :native
                                                                :database (mt/id)
                                                                :native   {:query "SELECT COUNT(*) FROM people WHERE {{name}}"
                                                                           :template-tags
                                                                           {"name" {:name         "name"
                                                                                    :display-name "Name"
                                                                                    :id           "_name_"
                                                                                    :type         :dimension
                                                                                    :dimension    [:field (mt/id :people :name) nil]
                                                                                    :widget-type  :string/contains}}}}}
                   :model/Card {hidden-card-id :id} {:collection_id hidden-collection-id
                                                     :dataset_query {:database (mt/id)
                                                                     :type     :query
                                                                     :query    {:source-table (mt/id :venues)}}}
                   :model/Card {metric-id :id} {:collection_id collection-id
                                                :type          :metric
                                                :dataset_query (venues-count-query)}
                   :model/Dashboard {dashboard-id :id} {:collection_id collection-id
                                                        :parameters    [{:name "Name" :slug "name" :id "a" :type :string/contains}]}
                   :model/DashboardCard {dashcard-id :id} {:dashboard_id       dashboard-id
                                                           :card_id            card-id
                                                           :parameter_mappings [{:parameter_id "a"
                                                                                 :card_id      card-id
                                                                                 :target       [:dimension [:template-tag "name"]]}]}]
      (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
      (let [person-id     (mt/user->id :rasta)
            admin-id      (mt/user->id :crowberto)
            admin-tenant  (t2/select-one-fn :tenant_id :model/User :id admin-id)
            ids           {:collection-id collection-id, :card-id card-id, :dashboard-id dashboard-id
                           :dashcard-id dashcard-id, :metric-id metric-id, :hidden-card-id hidden-card-id
                           :ad-hoc-query (venues-count-query)}
            {:keys [token]} (start-preview! (admin-session-key) {:user_id person-id})
            snapshot      (app-db-snapshot)]
        (read-everything! (partial as-preview token) ids)
        (let [changes    (changes-since snapshot)
              added-rows #(get-in changes [% :added])]
          (testing "every new log row names the admin, with the admin's tenant, and no log row is removed"
            (is (= [] (for [[table-name {:keys [added]}] changes
                            :let                         [user-column (log-user-column table-name)]
                            :when                        user-column
                            row                          added
                            :when                        (not= [admin-id admin-tenant]
                                                               [(get row user-column) (:tenant_id row)])]
                        [table-name row])))
            (is (= [] (for [[table-name {:keys [removed]}] changes
                            :when                          (log-user-column table-name)
                            row                            removed]
                        [table-name row]))))
          (testing "the view log has each view, and the refused open"
            (is (set/subset? #{["card" card-id true]
                               ["dashboard" dashboard-id true]
                               ["collection" collection-id true]
                               ["card" hidden-card-id false]}
                             (into #{} (map (juxt :model :model_id :has_access)) (added-rows "view_log")))))
          (testing "the query log has each run and the download"
            (is (= ["ad-hoc" "csv-download" "dashboard" "question"]
                   (sort (map :context (added-rows "query_execution"))))))
          (testing "the view log and query log rows show Auth Method preview"
            (is (= #{"preview"}
                   (into #{} (map :auth_method) (concat (added-rows "view_log") (added-rows "query_execution"))))))
          (testing "the metric's first dimension sync is in the audit log"
            (is (= [["card-update" metric-id]]
                   (map (juxt :topic :model_id) (added-rows "audit_log")))))
          (testing "a new query's saved text and average run time are written"
            (let [ad-hoc-hash (->> (added-rows "query_execution")
                                   (some #(when (= "ad-hoc" (:context %)) (:hash %))))
                  saved       (->> (added-rows "query")
                                   (filter #(= ad-hoc-hash (:query_hash %))))]
              (is (=? [{:query                  some?
                        :average_execution_time some?}]
                      saved))))
          (testing "the person's recent views are untouched"
            (is (empty? (rows-of changes "recent_views"))))
          (testing "no saved dashboard filter value is written"
            (is (empty? (rows-of changes "user_parameter_value"))))
          (testing "no row of any table is tied to the person"
            (is (= [] (for [[table-name {:keys [added removed]}] changes
                            row                                  (set/union added removed)
                            :when                                (tied-to-user? person-id row)]
                        [table-name row]))))
          (testing "only the tables of the logs, saved queries, shared counters and cluster locks change"
            (is (= #{} (set/difference (into #{} (remove log-user-column) (keys changes))
                                       shared-tables
                                       #{"metabase_cluster_lock" "query"}))))
          (testing "the only cluster lock rows added are the shared counters', and none is removed"
            (let [{:keys [added removed]} (get changes "metabase_cluster_lock")]
              (is (= #{} (set/difference (set (map :lock_name added)) shared-counter-lock-names)))
              (is (empty? removed)))))
        (testing "guard: the same reads by the person themself write to those logs"
          (let [snapshot (app-db-snapshot)]
            (read-everything! (partial mt/user-http-request :rasta) ids)
            (let [changes (changes-since snapshot)]
              (doseq [table-name ["view_log" "recent_views" "user_parameter_value" "query_execution"]]
                (is (seq (filter #(tied-to-user? person-id %) (rows-of changes table-name)))
                    table-name)))))))))

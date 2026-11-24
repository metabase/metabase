(ns metabase-enterprise.permission-debug.audit-test
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.app-db.core :as mdb]
   [metabase.audit-app.models.audit-log :as audit-log]
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

(deftest audit-log-skips-a-previewers-writes-test
  (mt/with-temp [:model/User {user-id :id} {}]
    (let [rows-before (t2/count :model/AuditLog :topic "user-joined")
          join!       #(events/publish-event! :event/user-joined {:user-id user-id})]
      (testing "guard: outside a preview, an event that the audit log records is recorded"
        (join!)
        (is (= (inc rows-before) (t2/count :model/AuditLog :topic "user-joined"))))
      (testing "during a preview, the same event records nothing"
        (binding [api/*previewing-admin-id* (mt/user->id :crowberto)]
          (join!)
          (is (nil? (audit-log/audit-row :event/user-joined {:user-id user-id :model :model/User :model-id user-id}))))
        (is (= (inc rows-before) (t2/count :model/AuditLog :topic "user-joined")))))))

(def ^:private skipped-tables
  "Tables whose rows change with no read involved, or that aren't data of the app."
  #{"databasechangelog" "databasechangeloglock" "task_history"})

(defn- app-db-table-names []
  (t2/with-connection [^java.sql.Connection connection]
    (with-open [tables (.getTables (.getMetaData connection) nil (.getSchema connection) nil (into-array String ["TABLE"]))]
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

(defn- read-everything!
  "Do the main reads with `request-fn`, which takes the method, the status, the endpoint and a body: open a question
  and a dashboard, open a collection, change a dashboard filter, run a saved question and an ad hoc query, and open a
  question the person may not read."
  [request-fn {:keys [collection-id card-id dashboard-id dashcard-id hidden-card-id]}]
  (request-fn :get 200 (str "card/" card-id))
  (request-fn :get 200 (str "dashboard/" dashboard-id))
  (request-fn :get 200 (str "collection/" collection-id))
  (request-fn :post 202 (format "dashboard/%d/dashcard/%d/card/%d/query" dashboard-id dashcard-id card-id)
              {:parameters [{:id "a" :value ["Marcus"]}]})
  (request-fn :post 202 (format "card/%d/query" card-id) {})
  (request-fn :post 202 "dataset" {:database (mt/id)
                                   :type     :query
                                   :query    {:source-table (mt/id :venues) :aggregation [[:count]]}})
  (request-fn :get 403 (str "card/" hidden-card-id)))

(deftest a-preview-writes-nothing-tied-to-the-person-test
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
                   :model/Dashboard {dashboard-id :id} {:collection_id collection-id
                                                        :parameters    [{:name "Name" :slug "name" :id "a" :type :string/contains}]}
                   :model/DashboardCard {dashcard-id :id} {:dashboard_id       dashboard-id
                                                           :card_id            card-id
                                                           :parameter_mappings [{:parameter_id "a"
                                                                                 :card_id      card-id
                                                                                 :target       [:dimension [:template-tag "name"]]}]}]
      (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
      (let [person-id     (mt/user->id :rasta)
            ids           {:collection-id collection-id, :card-id card-id, :dashboard-id dashboard-id
                           :dashcard-id dashcard-id, :hidden-card-id hidden-card-id}
            {:keys [token]} (start-preview! (admin-session-key) {:user_id person-id})
            snapshot      (app-db-snapshot)]
        (read-everything! (partial as-preview token) ids)
        (let [changes (changes-since snapshot)]
          (testing "the view log has no row of the person, and none for a refused open"
            (is (empty? (rows-of changes "view_log"))))
          (testing "the person's recent views are untouched"
            (is (empty? (rows-of changes "recent_views"))))
          (testing "no saved dashboard filter value is written"
            (is (empty? (rows-of changes "user_parameter_value"))))
          (testing "the query log has no row"
            (is (empty? (rows-of changes "query_execution"))))
          (testing "the audit log has no row"
            (is (empty? (rows-of changes "audit_log"))))
          (testing "no row of any table is tied to the person"
            (is (= [] (for [[table-name {:keys [added removed]}] changes
                            row                                  (set/union added removed)
                            :when                                (tied-to-user? person-id row)]
                        [table-name row]))))
          (testing "only the tables of shared counters change"
            (is (= #{} (set/difference (set (keys changes)) shared-tables)))))
        (testing "guard: the same reads by the person themself write to those logs"
          (let [snapshot (app-db-snapshot)]
            (read-everything! (partial mt/user-http-request :rasta) ids)
            (let [changes (changes-since snapshot)]
              (doseq [table-name ["view_log" "recent_views" "user_parameter_value" "query_execution"]]
                (is (seq (filter #(tied-to-user? person-id %) (rows-of changes table-name)))
                    table-name)))))))))

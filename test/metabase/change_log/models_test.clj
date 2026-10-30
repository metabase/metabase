(ns metabase.change-log.models-test
  (:require
   [clojure.test :refer :all]
   [metabase.change-log.cascade :as change-log.cascade]
   [metabase.change-log.core :as change-log]
   [metabase.change-log.models :as change-log.models]
   [metabase.change-log.settings :as change-log.settings]
   [metabase.metabot.db :as metabot.db]
   [metabase.models.resolution :as models.resolution]
   [metabase.permissions.core :as perms]
   [metabase.permissions.db :as permissions.db]
   [metabase.pulse.db :as pulse.db]
   [metabase.settings.core :as setting]
   [metabase.sync.db :as sync.db]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.sql Connection Types)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- logged-by
  "The `[table_name row_id action]` of the change log rows that `thunk` writes, start markers aside."
  [thunk]
  (let [top (or (:id (t2/query-one ["SELECT MAX(id) AS id FROM change_log"])) 0)]
    (thunk)
    (into []
          (comp (remove #(= "*" (:table_name %)))
                (map (juxt :table_name :row_id :action)))
          (t2/query ["SELECT table_name, row_id, action FROM change_log WHERE id > ? ORDER BY id" top]))))

(defn- markers-written-by
  "The number of start markers that `thunk` writes."
  [thunk]
  (let [top (or (:id (t2/query-one ["SELECT MAX(id) AS id FROM change_log"])) 0)]
    (thunk)
    (t2/count :change_log :id [:> top] :table_name "*")))

(def ^:private licensed #{:audit-app})

(defmacro ^:private with-change-log
  "Runs `body` with Metabase logging its changes."
  [& body]
  `(mt/with-premium-features licensed
     (mt/with-temporary-setting-values [~'change-log-enabled true]
       ~@body)))

(deftest log-test
  (with-change-log
    (mt/with-temp [:model/Database db {}
                   :model/Table    t  {:db_id (:id db)}]
      (testing "an insert, an update and a delete each log the row's table, id and action"
        (let [id   (atom nil)
              rows (logged-by #(do (reset! id (t2/insert-returning-pk! :model/Field {:table_id      (:id t)
                                                                                     :name          "f"
                                                                                     :base_type     :type/Text
                                                                                     :database_type "TEXT"}))
                                   (t2/update! :model/Field @id {:name "g"})
                                   (t2/delete! :model/Field @id)))]
          (is (= [["metabase_field" @id "insert"] ["metabase_field" @id "update"] ["metabase_field" @id "delete"]]
                 rows))))
      (testing "an update logs the rows it matches, also when before-update leaves them as they were and Toucan sends no
                UPDATE: a reader reads them again"
        (is (= [["metabase_table" (:id t) "update"]]
               (logged-by #(t2/update! :model/Table (:id t) {:name (:name t)})))))
      (testing "an update on a model without a before-update logs the rows it matches, also when its UPDATE sets the
                value a row holds: a reader reads it again"
        (mt/with-temp [:model/Pulse     pulse {}
                       :model/Card      card  {:database_id (:id db)}
                       :model/PulseCard pc    {:pulse_id (:id pulse), :card_id (:id card), :include_csv false}]
          (is (= [["pulse_card" (:id pc) "update"]]
                 (logged-by #(t2/update! :model/PulseCard (:id pc) {:include_csv false}))))))
      (testing "an update that matches no row logs nothing"
        (is (= [] (logged-by #(t2/update! :model/Table Integer/MAX_VALUE {:name "none"})))))
      (testing "an insert that returns no keys logs the rows it inserts, and returns its count"
        (let [names #{"f1" "f2"}
              n     (atom nil)
              rows  (logged-by #(reset! n (t2/insert! :model/Field (for [field-name names]
                                                                     {:table_id      (:id t)
                                                                      :name          field-name
                                                                      :base_type     :type/Text
                                                                      :database_type "TEXT"}))))]
          (is (= 2 @n))
          (is (= (set (t2/select-pks-set :model/Field :table_id (:id t) :name [:in names]))
                 (set (map second rows))))
          (is (every? #(= ["metabase_field" "insert"] [(first %) (last %)]) rows))))
      (testing "a model keyed by another column logs that key"
        (mt/with-temp [:model/Field f {:table_id (:id t)}]
          (is (= [["metabase_field_user_settings" (:id f) "insert"]]
                 (logged-by #(t2/insert! :model/FieldUserSettings {:field_id (:id f), :semantic_type :type/Email
                                                                   :semantic_type_set true})))))))))

(deftest other-hooks-test
  (testing "a model with other hooks on the same Toucan methods logs, and runs them too"
    (with-change-log
      (mt/with-temp [:model/Database _ {}]
        (let [card (atom nil)
              rows (logged-by #(do (reset! card (t2/insert-returning-instance! :model/Card
                                                                               (mt/with-temp-defaults :model/Card)))
                                   (t2/update! :model/Card (:id @card) {:name "renamed"})
                                   (t2/delete! :model/Card (:id @card))))]
          (is (= (for [action ["insert" "update" "delete"]] ["report_card" (:id @card) action])
                 rows))
          (testing "timestamped: the update set updated_at"
            (is (some? (:updated_at @card)))))))))

(deftest split-update-test
  (testing "an update that before-update splits into one UPDATE per row logs each row once"
    (with-change-log
      (mt/with-temp [:model/Database db {}
                     :model/Table    t  {:db_id (:id db)}
                     :model/Field    f1 {:table_id (:id t), :base_type :type/Text, :effective_type :type/Text}
                     :model/Field    f2 {:table_id (:id t), :base_type :type/Text, :effective_type :type/Text}]
        ;; before-update moves f2's effective_type back to its base_type, so the two rows get different changes
        (t2/update! :metabase_field (:id f2) {:effective_type "type/Integer"})
        (is (= [["metabase_field" (:id f1) "update"] ["metabase_field" (:id f2) "update"]]
               (sort (logged-by #(t2/update! :model/Field {:table_id (:id t)} {:description "x"})))))))))

(deftest transaction-test
  (with-change-log
    (mt/with-temp [:model/PermissionsGroup group {}]
      (testing "a write rolled back takes its log row with it"
        (is (= [] (logged-by #(try
                                (t2/with-transaction [_conn]
                                  (t2/update! :model/PermissionsGroup (:id group) {:name "rolled back"})
                                  (throw (ex-info "boom" {})))
                                (catch Exception _))))))
      (testing "a write that bypasses the model is not logged"
        (is (= [] (logged-by #(t2/update! :permissions_group (:id group) {:name "raw"}))))))))

(deftest raw-write-test
  (testing "the writes that bypass the models log their rows themselves"
    (with-change-log
      (mt/with-temp [:model/User             user  {}
                     :model/PermissionsGroup group {}
                     :model/Database         db    {}
                     :model/Table            t     {:db_id (:id db)}
                     :model/Field            f     {:table_id (:id t), :data_sensitivity "PII"}]
        (testing "a group membership added"
          (let [rows (logged-by #(perms/add-user-to-group! user group))]
            (is (= [["permissions_group_membership"
                     (t2/select-one-pk :model/PermissionsGroupMembership :user_id (:id user) :group_id (:id group))
                     "insert"]]
                   rows))))
        (testing "the classifier's sensitivity reset, of a table and of a database"
          (is (= [["metabase_field" (:id f) "update"]]
                 (logged-by #(sync.db/reset-classifier-data-sensitivity-for-table! (:id t)))))
          (t2/update! :metabase_field (:id f) {:data_sensitivity "PII"})
          (is (= [["metabase_field" (:id f) "update"]]
                 (logged-by #(sync.db/reset-classifier-data-sensitivity-for-database! (:id db))))))
        (testing "every tenant deactivated in one update"
          (let [tenant (str (random-uuid))
                id     (t2/insert-returning-pk! :tenant {:name tenant, :slug tenant, :tenant_collection_id 0
                                                         :created_at :%now, :updated_at :%now})]
            (is (contains? (set (logged-by permissions.db/deactivate-all-tenants!)) ["tenant" id "update"]))))
        (testing "a pulse channel's recipients removed in one delete"
          (mt/with-temp [:model/Pulse                 pulse {}
                         :model/PulseChannel          pc    {:pulse_id (:id pulse), :channel_type :email, :details {}}
                         :model/PulseChannelRecipient pcr   {:pulse_channel_id (:id pc), :user_id (:id user)}]
            (is (= [["pulse_channel_recipient" (:id pcr) "delete"]]
                   (logged-by #(pulse.db/delete-pulse-channel-recipients-raw! (:id pc) #{(:id user)}))))))
        (testing "a card linked to the Metabot conversation that saved it"
          (let [conversation-id (str (random-uuid))]
            (mt/with-temp [:model/MetabotConversation _    {:id conversation-id, :user_id (:id user)}
                           :model/Card                card {:database_id (:id db)}]
              (is (= [["report_card" (:id card) "update"]]
                     (logged-by #(metabot.db/link-card-to-conversation! (:id card) conversation-id "chart")))))))))))

(deftest foreign-keys-test
  (testing "the foreign keys into logged tables come from the app DB, the same on every engine"
    (let [[_ fks] (#'change-log.cascade/foreign-keys)
          edge    (fn [parent child column]
                    (some #(when (and (= child (:child %)) (= column (:column %))) (:rule %)) (get fks parent)))]
      (is (= :cascade (edge "metabase_database" "metabase_table" :db_id)))
      (is (= :cascade (edge "metabase_table" "metabase_field" :table_id)))
      (is (= :cascade (edge "metabase_field" "metabase_field_user_settings" :field_id)))
      (is (= :cascade (edge "pulse_channel" "pulse_channel_recipient" :pulse_channel_id)))
      (is (= :set-null (edge "metabase_field" "metabase_field" :fk_target_field_id)))
      (is (= :set-null (edge "report_card" "report_card" :source_card_id)))
      (testing "and from tables that are not logged"
        (is (= :cascade (edge "report_dashboardcard" "pulse_card" :dashboard_card_id)))
        (is (= :set-null (edge "collection" "report_card" :collection_id))))
      (testing "only into logged tables"
        (is (not-any? #(= "collection" (:child %)) (mapcat val fks)))))))

(deftest logged-model-keys-test
  (testing "the key of each logged model is one integer column, which row_id holds"
    ;; A model derives the hook when its namespace loads, and Metabase loads some only when they are first used.
    (run! t2/resolve-model (keys models.resolution/model->namespace))
    (let [column-types (t2/with-connection [^Connection conn]
                         (with-open [rs (.getColumns (.getMetaData conn) (.getCatalog conn) (.getSchema conn) "%" "%")]
                           (into {}
                                 (map (fn [{:keys [table_name column_name data_type]}]
                                        [[(u/lower-case-en table_name) (u/lower-case-en column_name)] data_type]))
                                 (resultset-seq rs))))]
      (doseq [model (descendants :hook/change-log)
              :when (= "model" (namespace model))
              :let  [pks (t2/primary-keys model)]]
        (is (= 1 (count pks))
            (str model " has a key of " (count pks) " columns"))
        (is (contains? #{Types/INTEGER Types/BIGINT Types/SMALLINT}
                       (column-types [(name (t2/table-name model)) (u/lower-case-en (name (first pks)))]))
            (str model "'s key is not an integer column"))))))

(deftest cascade-test
  (with-change-log
    (mt/with-temp [:model/Database          db      {}
                   :model/Table             t       {:db_id (:id db)}
                   :model/Field             f       {:table_id (:id t)}
                   :model/FieldUserSettings _       {:field_id (:id f), :semantic_type :type/Email
                                                     :semantic_type_set true}
                   :model/Card              card    {:database_id (:id db)}
                   :model/Database          other   {}
                   :model/Table             other-t {:db_id (:id other)}
                   :model/Field             fk      {:table_id (:id other-t), :fk_target_field_id (:id f)}]
      (testing "a delete logs the rows the database deletes through ON DELETE CASCADE, at any depth, and the rows it
                updates through ON DELETE SET NULL"
        (let [logged (set (logged-by #(t2/delete! :model/Database (:id db))))]
          (is (contains? logged ["metabase_database" (:id db) "delete"]))
          (is (contains? logged ["metabase_table" (:id t) "delete"]))
          (is (contains? logged ["metabase_field" (:id f) "delete"]))
          (is (contains? logged ["metabase_field_user_settings" (:id f) "delete"]))
          (is (contains? logged ["report_card" (:id card) "delete"]))
          (is (contains? logged ["metabase_field" (:id fk) "update"]))
          (is (not-any? #(= (:id other-t) (second %)) (filter #(= "metabase_table" (first %)) logged)))
          (testing "and the database did as the log says"
            (is (nil? (t2/select-one :model/Field (:id f))))
            (is (nil? (t2/select-one-fn :fk_target_field_id :model/Field (:id fk))))))))))

(deftest cascade-from-unlogged-model-test
  (is (not (isa? :model/DashboardCard :hook/change-log)))
  (with-change-log
    (mt/with-temp [:model/Dashboard     dash  {}
                   :model/Card          card  {}
                   :model/DashboardCard dc    {:dashboard_id (:id dash), :card_id (:id card)}
                   :model/Pulse         pulse {:dashboard_id (:id dash)}
                   :model/PulseCard     pc    {:pulse_id (:id pulse), :card_id (:id card), :dashboard_card_id (:id dc)}]
      (testing "removing a card from a dashboard, a model that is not logged, logs the subscription's card that the
                database deletes with it"
        (is (= [["pulse_card" (:id pc) "delete"]]
               (logged-by #(t2/delete! :model/DashboardCard (:id dc)))))
        (is (nil? (t2/select-one :model/PulseCard (:id pc))))))))

(defn- call-counts
  "The app-DB calls of an insert, an update and a delete of a permissions group."
  []
  (let [id (atom nil)]
    {:insert (t2/with-call-count [calls]
               (reset! id (t2/insert-returning-pk! :model/PermissionsGroup {:name (str (random-uuid))}))
               (calls))
     :update (t2/with-call-count [calls]
               (t2/update! :model/PermissionsGroup @id {:name (str (random-uuid))})
               (calls))
     :delete (t2/with-call-count [calls]
               (t2/delete! :model/PermissionsGroup @id)
               (calls))}))

(deftest call-count-test
  (mt/with-premium-features licensed
    ;; warm the caches a first write fills
    (call-counts)
    (let [unhooked (try
                     (underive :model/PermissionsGroup :hook/change-log)
                     (call-counts)
                     (finally
                       (derive :model/PermissionsGroup :hook/change-log)))
          off      (mt/with-temporary-setting-values [change-log-enabled false]
                     (call-counts))
          on       (mt/with-temporary-setting-values [change-log-enabled true]
                     ;; writes the start marker now, so the counts below leave it out
                     (change-log/enabled?)
                     (call-counts))]
      (testing "while the change log is off, a hooked model runs the queries it ran without the hook"
        (is (= unhooked off)))
      (testing "while the change log is on: an insert adds the log row; an update reads the keys and adds the log rows;
                a delete also reads what it cascades to"
        (is (= (inc (:insert off)) (:insert on)))
        (is (= (+ (:update off) 2) (:update on)))
        (is (< (+ (:delete off) 2) (:delete on))))
      (log/infof "change log call counts: without the hook %s, off %s, on %s" unhooked off on))))

(deftest off-test
  (mt/with-temp [:model/PermissionsGroup group {}]
    (testing "with the setting off, nothing is logged"
      (mt/with-premium-features licensed
        (mt/with-temporary-setting-values [change-log-enabled false]
          (is (false? (change-log/enabled?)))
          (is (= [] (logged-by #(t2/update! :model/PermissionsGroup (:id group) {:name "off"})))))))
    (testing "without the licence's feature, nothing is logged"
      (mt/with-premium-features #{}
        (mt/with-temporary-setting-values [change-log-enabled true]
          (is (false? (change-log/enabled?)))
          (is (= [] (logged-by #(t2/update! :model/PermissionsGroup (:id group) {:name "unlicensed"})))))))))

(defn- new-process!
  "Forgets what this process saw of logging, as a process that just started."
  []
  (reset! @#'change-log.models/logging? nil))

(deftest start-marker-test
  (mt/with-premium-features licensed
    (doseq [[last-check on? active markers active-after]
            ;; this process's last check, the setting now, change-log-active => markers, change-log-active after
            [[nil true true 0 true]      [nil true false 1 true]
             [false true true 1 true]    [false true false 1 true]
             [true true true 0 true]     [true true false 0 false]
             [nil false true 0 false]    [nil false false 0 false]
             [false false true 0 false]  [false false false 0 false]
             [true false true 0 false]   [true false false 0 false]]]
      (testing (pr-str {:last-check last-check, :on? on?, :change-log-active active})
        (reset! @#'change-log.models/logging? last-check)
        (mt/with-temporary-setting-values [change-log-enabled on?
                                           change-log-active  active]
          (is (= markers (markers-written-by change-log/enabled?)))
          (is (= active-after (change-log.settings/change-log-active)))
          (is (= on? @@#'change-log.models/logging?))))))
  (t2/delete! :change_log :table_name "*"))

(deftest start-marker-on-licence-test
  (testing "the licence gaining the feature is a turn-on too"
    (mt/with-temporary-setting-values [change-log-enabled true
                                       change-log-active  true]
      (new-process!)
      (mt/with-premium-features #{}
        (is (false? (change-log/enabled?))))
      (mt/with-premium-features licensed
        (is (= 1 (markers-written-by change-log/enabled?)))
        (is (= {:table_name "*", :row_id 0, :action "start"}
               (t2/select-one [:change_log :table_name :row_id :action] :table_name "*" {:order-by [[:id :desc]]}))))))
  (t2/delete! :change_log :table_name "*"))

(deftest start-in-a-rolled-back-transaction-test
  (testing "a turn-on found in a transaction that rolls back keeps its start marker, which commits on its own
            connection, and loses its `true`, which waits for the commit"
    (mt/with-premium-features licensed
      (mt/with-temporary-setting-values [change-log-enabled true
                                         change-log-active  false]
        (new-process!)
        (is (= 1 (markers-written-by #(try
                                        (t2/with-transaction [_conn]
                                          (change-log/enabled?)
                                          (throw (ex-info "boom" {})))
                                        (catch Exception _)))))
        (is (false? (change-log.settings/change-log-active))))))
  (t2/delete! :change_log :table_name "*"))

(deftest start-in-a-transaction-that-wrote-a-setting-test
  (testing "a check inside a transaction that holds the setting rows does not wait on it, and records the state once
            the transaction commits"
    (mt/with-premium-features licensed
      (mt/with-temporary-setting-values [change-log-enabled        true
                                         change-log-active         false
                                         change-log-retention-days 30]
        (new-process!)
        (let [checked (future
                        (t2/with-transaction [_conn]
                          (change-log.settings/change-log-retention-days! 31)
                          (change-log/enabled?)))]
          (is (true? (deref checked 30000 ::timed-out)))
          (is (true? (u/poll {:thunk      change-log.settings/change-log-active
                              :done?      true?
                              :timeout-ms 5000})))))))
  (t2/delete! :change_log :table_name "*"))

(deftest turn-on-test
  (mt/with-premium-features licensed
    (mt/with-temporary-setting-values [change-log-enabled false]
      (testing "turn-on! turns the setting on, and returns whether Metabase logs its changes"
        (is (true? (change-log/turn-on!)))
        (is (true? (change-log.settings/change-log-enabled)))))
    (mt/with-temporary-setting-values [change-log-enabled false]
      (testing "with MB_CHANGE_LOG_ENABLED=false, it writes no setting, and Metabase does not log"
        (mt/with-temp-env-var-value! [mb-change-log-enabled "false"]
          (is (false? (change-log/turn-on!)))
          (is (= :env (setting/get-raw-value-source :change-log-enabled)))
          (is (= "false" (setting/db-stored-value :change-log-enabled)))))))
  (mt/with-premium-features #{}
    (mt/with-temporary-setting-values [change-log-enabled false]
      (testing "without the licence's feature, it turns the setting on, and Metabase does not log"
        (is (false? (change-log/turn-on!)))
        (is (true? (change-log.settings/change-log-enabled))))))
  (t2/delete! :change_log :table_name "*"))

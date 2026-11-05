(ns metabase.change-log.models-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.change-log.cascade :as change-log.cascade]
   [metabase.change-log.core :as change-log]
   [metabase.config.core :as config]
   [metabase.core.init-test :as init-test]
   [metabase.metabot.db :as metabot.db]
   [metabase.models.resolution :as models.resolution]
   [metabase.permissions.core :as perms]
   [metabase.permissions.db :as permissions.db]
   [metabase.pulse.db :as pulse.db]
   [metabase.sync.db :as sync.db]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (java.sql Connection Types)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- logged-by
  "The `[table_name row_id action]` of the change log rows that `thunk` writes."
  [thunk]
  (let [top (or (:id (t2/query-one ["SELECT MAX(id) AS id FROM change_log"])) 0)]
    (thunk)
    (mapv (juxt :table_name :row_id :action)
          (t2/query ["SELECT table_name, row_id, action FROM change_log WHERE id > ? ORDER BY id" top]))))

(deftest log-test
  (when config/ee-available?
    (mt/with-premium-features #{:change-log}
      (mt/with-temp [:model/Database db {}
                     :model/Table    t  {:db_id (:id db)}]
        (testing "an insert, an update and a delete each log the row's table, id and action"
          (let [id   (atom nil)
                rows (logged-by #(do (reset! id (t2/insert-returning-pk! :model/Field {:table_id      (:id t)
                                                                                       :name          "f"
                                                                                       :base_type     :type/Text
                                                                                       :database_type "TEXT"}))
                                     (t2/update! :model/Field :id @id {:name "g"})
                                     (t2/delete! :model/Field :id @id)))]
            (is (= [["metabase_field" @id "insert"]
                    ["metabase_field" @id "update"]
                    ["metabase_field" @id "delete"]]
                   rows))))
        (testing "an update that changes nothing is still logged"
          (is (= [["metabase_table" (:id t) "update"]]
                 (logged-by #(t2/update! :model/Table :id (:id t) {:name (:name t)})))))
        (testing "an update that changes nothing is still logged, on a model without a before-update"
          (mt/with-temp [:model/Pulse     pulse {}
                         :model/Card      card  {:database_id (:id db)}
                         :model/PulseCard pc    {:pulse_id (:id pulse), :card_id (:id card), :include_csv false}]
            (is (= [["pulse_card" (:id pc) "update"]]
                   (logged-by #(t2/update! :model/PulseCard :id (:id pc) {:include_csv false}))))))
        (testing "an update that matches no row logs nothing"
          (is (= [] (logged-by #(t2/update! :model/Table :id Integer/MAX_VALUE {:name "none"})))))
        (testing "`t2/insert!` logs the rows it inserts, and still returns their count"
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
        (testing "a model keyed by a column other than `id` logs that key"
          (mt/with-temp [:model/Field f {:table_id (:id t)}]
            (is (= [["metabase_field_user_settings" (:id f) "insert"]]
                   (logged-by #(t2/insert! :model/FieldUserSettings {:field_id (:id f), :semantic_type :type/Email
                                                                     :semantic_type_set true}))))))))))

(deftest other-hooks-test
  (testing "a model with other hooks is logged, and its other hooks still run"
    (when config/ee-available?
      (mt/with-premium-features #{:change-log}
        (mt/with-temp [:model/Database _ {}]
          (let [card    (atom nil)
                updated (atom nil)
                rows    (logged-by #(do (reset! card (t2/insert-returning-instance!
                                                      :model/Card
                                                      (-> (mt/with-temp-defaults :model/Card)
                                                          (dissoc :entity_id)
                                                          (assoc :updated_at #t "2023-02-02T01:00:00"))))
                                        (t2/update! :model/Card :id (:id @card) {:name "renamed"})
                                        (reset! updated (t2/select-one-fn :updated_at :model/Card :id (:id @card)))
                                        (t2/delete! :model/Card :id (:id @card))))]
            (is (= (for [action ["insert" "update" "delete"]]
                     ["report_card" (:id @card) action])
                   rows))
            (testing "entity-id: the insert set entity_id"
              (is (some? (:entity_id @card))))
            (testing "timestamped: the update set updated_at"
              (is (not= (:updated_at @card) @updated)))))))))

(deftest split-update-test
  (testing "an update that Toucan runs as one UPDATE per row logs each row once"
    (when config/ee-available?
      (mt/with-premium-features #{:change-log}
        (mt/with-temp [:model/Database db {}
                       :model/Table    t  {:db_id (:id db)}
                       :model/Field    f1 {:table_id (:id t), :base_type :type/Text, :effective_type :type/Text}
                       :model/Field    f2 {:table_id (:id t), :base_type :type/Text, :effective_type :type/Text}]
          ;; before-update moves f2's effective_type back to its base_type, so the two rows get different changes
          (t2/update! :metabase_field :id (:id f2) {:effective_type "type/Integer"})
          (is (= [["metabase_field" (:id f1) "update"]
                  ["metabase_field" (:id f2) "update"]]
                 (sort (logged-by #(t2/update! :model/Field {:table_id (:id t)} {:description "x"}))))))))))

(deftest transaction-test
  (when config/ee-available?
    (mt/with-premium-features #{:change-log}
      (mt/with-temp [:model/PermissionsGroup group {}]
        (testing "a write rolled back takes its log row with it"
          (is (= [] (logged-by #(try
                                  (t2/with-transaction [_conn]
                                    (t2/update! :model/PermissionsGroup :id (:id group) {:name "rolled back"})
                                    (throw (ex-info "boom" {})))
                                  (catch Exception _))))))))))

(deftest raw-write-test
  (testing "writes that bypass their model log their rows with `log-rows!`"
    (when config/ee-available?
      (mt/with-premium-features #{:change-log}
        (mt/with-temp [:model/User             user  {}
                       :model/PermissionsGroup group {}]
          (testing "without `log-rows!`, a write that bypasses the model is not logged"
            (is (= [] (logged-by #(t2/update! :permissions_group :id (:id group) {:name "raw"})))))
          (testing "a group membership added"
            (let [rows (logged-by #(perms/add-user-to-group! user group))]
              (is (= [["permissions_group_membership"
                       (t2/select-one-pk :model/PermissionsGroupMembership :user_id (:id user) :group_id (:id group))
                       "insert"]]
                     rows))))
          (testing "a pulse channel's recipients removed in one delete"
            (mt/with-temp [:model/Pulse                 pulse {}
                           :model/PulseChannel          pc    {:pulse_id (:id pulse), :channel_type :email, :details {}}
                           :model/PulseChannelRecipient pcr   {:pulse_channel_id (:id pc), :user_id (:id user)}]
              (is (= [["pulse_channel_recipient" (:id pcr) "delete"]]
                     (logged-by #(pulse.db/delete-pulse-channel-recipients-raw! (:id pc) #{(:id user)})))))))
        (testing "a card linked to the Metabot conversation it was saved from"
          (mt/with-temp [:model/MetabotConversation {conversation-id :id} {:user_id (mt/user->id :crowberto)}
                         :model/Card                card                 {}]
            (is (= [["report_card" (:id card) "update"]]
                   (logged-by #(metabot.db/link-card-to-conversation! (:id card) conversation-id "chart"))))))
        (testing "the classifier's data sensitivity cleared, for a table and then for its database"
          (mt/with-temp [:model/Database db      {}
                         :model/Table    table-a {:db_id (:id db)}
                         :model/Table    table-b {:db_id (:id db)}
                         :model/Field    field-a {:table_id (:id table-a), :data_sensitivity :PII}
                         :model/Field    field-b {:table_id (:id table-b), :data_sensitivity :PII}]
            (is (= [["metabase_field" (:id field-a) "update"]]
                   (logged-by #(sync.db/reset-classifier-data-sensitivity-for-table! (:id table-a)))))
            (is (= [["metabase_field" (:id field-b) "update"]]
                   (logged-by #(sync.db/reset-classifier-data-sensitivity-for-database! (:id db)))))))
        (testing "every tenant deactivated"
          (mt/with-temp [:model/Tenant tenant {}]
            (t2/with-transaction [_conn nil {:rollback-only true}]
              (is (contains? (set (logged-by permissions.db/deactivate-all-tenants!))
                             ["tenant" (:id tenant) "update"])))))
        (testing "log-rows! takes only a logged model"
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"is not logged"
                                (change-log/log-rows! :model/Collection :update :id 1))))))))

(deftest foreign-keys-test
  (testing "reads the foreign keys of logged tables, with their ON DELETE rule, from the app DB"
    (let [fks  (change-log.cascade/foreign-keys)
          edge (fn [parent child column]
                 (some #(when (and (= child (:child %)) (= column (:column %))) (:rule %)) (get fks parent)))]
      (is (= :cascade (edge "metabase_database" "metabase_table" :db_id)))
      (is (= :cascade (edge "metabase_table" "metabase_field" :table_id)))
      (is (= :cascade (edge "metabase_field" "metabase_field_user_settings" :field_id)))
      (is (= :cascade (edge "pulse_channel" "pulse_channel_recipient" :pulse_channel_id)))
      (is (= :set-null (edge "metabase_field" "metabase_field" :fk_target_field_id)))
      (is (= :set-null (edge "report_card" "report_card" :source_card_id)))
      (testing "including those that reference a table that is not logged"
        (is (= :cascade (edge "report_dashboardcard" "pulse_card" :dashboard_card_id)))
        (is (= :set-null (edge "collection" "report_card" :collection_id))))
      (testing "and none of a table that is not logged"
        (is (not-any? #(= "collection" (:child %)) (mapcat val fks)))))))

(defn- load-models!
  "Loads the namespace of every model. A model derives the hook when its namespace loads, and Metabase loads some only
  when they are first used."
  []
  (doseq [[model nspace] models.resolution/model->namespace
          :when (or config/ee-available? (not (str/starts-with? (str nspace) "metabase-enterprise")))]
    (t2/resolve-model model)))

(deftest logged-model-keys-test
  (testing "each logged model's key is one integer column, so `row_id` can hold it"
    (load-models!)
    (let [column-types (t2/with-connection [^Connection conn]
                         (with-open [rs (.getColumns (.getMetaData conn) (.getCatalog conn) (.getSchema conn) "%" "%")]
                           (into {}
                                 (map (fn [{:keys [table_name column_name data_type]}]
                                        [[(u/lower-case-en table_name) (u/lower-case-en column_name)] data_type]))
                                 (resultset-seq rs))))]
      (doseq [model (vals (change-log.cascade/logged-models))
              :let  [pks (t2/primary-keys model)]]
        (is (= 1 (count pks))
            (str model " has a key of " (count pks) " columns"))
        (is (contains? #{Types/INTEGER Types/BIGINT Types/SMALLINT}
                       (column-types [(name (t2/table-name model)) (u/lower-case-en (name (first pks)))]))
            (str model "'s key is not an integer column"))))))

(defn- startup-namespaces
  "The Metabase namespaces that the startup namespaces require in their `ns` forms, at any depth. EE's startup
  namespaces are those that `metabase.core.init` and `metabase.api-routes.routes` load."
  []
  (loop [todo  (cond-> ['metabase.core.core]
                 config/ee-available? (conj 'metabase-enterprise.core.init 'metabase-enterprise.api-routes.routes))
         found #{}]
    (if-let [[nspace & more] (seq todo)]
      (if (contains? found nspace)
        (recur more found)
        (recur (into more (filter #(re-find #"^metabase(-enterprise)?\." (str %))) (init-test/ns-requires nspace))
               (conj found nspace)))
      found)))

(deftest logged-models-load-at-startup-test
  (testing "each logged model's namespace loads at startup, so a delete that cascades to its rows logs them"
    (load-models!)
    (let [startup (startup-namespaces)]
      (doseq [model (vals (change-log.cascade/logged-models))]
        (is (contains? startup (models.resolution/model->namespace model))
            (str model "'s namespace does not load at startup: require it from a namespace that does"))))))

(deftest cascade-test
  (when config/ee-available?
    (mt/with-premium-features #{:change-log}
      (mt/with-temp [:model/Database          db      {}
                     :model/Table             t       {:db_id (:id db)}
                     :model/Field             f       {:table_id (:id t)}
                     :model/FieldUserSettings _       {:field_id (:id f), :semantic_type :type/Email
                                                       :semantic_type_set true}
                     :model/Card              card    {:database_id (:id db)}
                     :model/Database          other   {}
                     :model/Table             other-t {:db_id (:id other)}
                     :model/Field             fk      {:table_id (:id other-t), :fk_target_field_id (:id f)}]
        (testing "a delete logs the rows ON DELETE CASCADE deletes, at any depth, and those ON DELETE SET NULL updates"
          (let [logged (set (logged-by #(t2/delete! :model/Database :id (:id db))))]
            (is (contains? logged ["metabase_database" (:id db) "delete"]))
            (is (contains? logged ["metabase_table" (:id t) "delete"]))
            (is (contains? logged ["metabase_field" (:id f) "delete"]))
            (is (contains? logged ["metabase_field_user_settings" (:id f) "delete"]))
            (is (contains? logged ["report_card" (:id card) "delete"]))
            (is (contains? logged ["metabase_field" (:id fk) "update"]))
            (is (not-any? #(= (:id other-t) (second %)) (filter #(= "metabase_table" (first %)) logged)))
            (testing "and the database deleted and updated those rows"
              (is (nil? (t2/select-one :model/Field :id (:id f))))
              (is (nil? (t2/select-one-fn :fk_target_field_id :model/Field :id (:id fk)))))))))))

(deftest cascade-from-unlogged-model-test
  (is (not (isa? :model/DashboardCard :hook/change-log)))
  (when config/ee-available?
    (mt/with-premium-features #{:change-log}
      (mt/with-temp [:model/Dashboard     dash  {}
                     :model/Card          card  {}
                     :model/DashboardCard dc    {:dashboard_id (:id dash), :card_id (:id card)}
                     :model/Pulse         pulse {:dashboard_id (:id dash)}
                     :model/PulseCard     pc    {:pulse_id (:id pulse), :card_id (:id card)
                                                 :dashboard_card_id (:id dc)}]
        (testing "deleting a dashboard card, which is not logged, logs the subscription card deleted with it"
          (is (= [["pulse_card" (:id pc) "delete"]]
                 (logged-by #(t2/delete! :model/DashboardCard :id (:id dc)))))
          (is (nil? (t2/select-one :model/PulseCard :id (:id pc)))))))))

(defn- call-counts
  "The app-DB calls of an insert, an update and a delete of a permissions group."
  []
  (let [id (atom nil)]
    {:insert (t2/with-call-count [calls]
               (reset! id (t2/insert-returning-pk! :model/PermissionsGroup {:name (str (random-uuid))}))
               (calls))
     :update (t2/with-call-count [calls]
               (t2/update! :model/PermissionsGroup :id @id {:name (str (random-uuid))})
               (calls))
     :delete (t2/with-call-count [calls]
               (t2/delete! :model/PermissionsGroup :id @id)
               (calls))}))

(deftest call-count-test
  (mt/with-premium-features #{:change-log}
    ;; warm the caches a first write fills
    (call-counts))
  (let [unhooked (mt/with-premium-features #{}
                   (try
                     (underive :model/PermissionsGroup :hook/change-log)
                     (call-counts)
                     (finally
                       (derive :model/PermissionsGroup :hook/change-log))))
        off      (mt/with-premium-features #{}
                   (call-counts))]
    (testing "while the change log is off, a logged model runs no extra query"
      (is (= unhooked off)))
    (when config/ee-available?
      (let [on (mt/with-premium-features #{:change-log}
                 (call-counts))]
        (testing "while the change log is on, an insert runs one extra query, an update two, and a delete more"
          (is (= (inc (:insert off)) (:insert on)))
          (is (= (+ (:update off) 2) (:update on)))
          (is (< (+ (:delete off) 2) (:delete on))))))))

(deftest off-test
  (mt/with-temp [:model/PermissionsGroup group {}]
    (mt/with-premium-features #{}
      (testing "without the `:change-log` feature, nothing is logged"
        (is (= [] (logged-by #(t2/update! :model/PermissionsGroup :id (:id group) {:name "unlicensed"})))))
      (testing "while the change log is off, `log-rows!` runs no query"
        (t2/with-call-count [calls]
          (is (nil? (change-log/log-rows! :model/PermissionsGroup :update :id (:id group))))
          (is (zero? (calls))))))))

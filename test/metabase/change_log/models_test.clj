(ns metabase.change-log.models-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.change-log.cascade :as change-log.cascade]
   [metabase.change-log.core :as change-log]
   [metabase.config.core :as config]
   [metabase.core.init-test :as init-test]
   [metabase.models.resolution :as models.resolution]
   [metabase.permissions.core :as perms]
   [metabase.pulse.db :as pulse.db]
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
            (is (= [["metabase_field" @id "insert"] ["metabase_field" @id "update"] ["metabase_field" @id "delete"]]
                   rows))))
        (testing "an update logs the rows it matches, also when before-update leaves them as they were and Toucan sends
                  no UPDATE: a reader reads them again"
          (is (= [["metabase_table" (:id t) "update"]]
                 (logged-by #(t2/update! :model/Table :id (:id t) {:name (:name t)})))))
        (testing "an update on a model without a before-update logs the rows it matches, also when its UPDATE sets the
                  value a row holds: a reader reads it again"
          (mt/with-temp [:model/Pulse     pulse {}
                         :model/Card      card  {:database_id (:id db)}
                         :model/PulseCard pc    {:pulse_id (:id pulse), :card_id (:id card), :include_csv false}]
            (is (= [["pulse_card" (:id pc) "update"]]
                   (logged-by #(t2/update! :model/PulseCard :id (:id pc) {:include_csv false}))))))
        (testing "an update that matches no row logs nothing"
          (is (= [] (logged-by #(t2/update! :model/Table :id Integer/MAX_VALUE {:name "none"})))))
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
                                                                     :semantic_type_set true}))))))))))

(deftest other-hooks-test
  (testing "a model with other hooks on the same Toucan methods logs, and runs them too"
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
            (is (= (for [action ["insert" "update" "delete"]] ["report_card" (:id @card) action])
                   rows))
            (testing "entity-id: the insert set entity_id"
              (is (some? (:entity_id @card))))
            (testing "timestamped: the update set updated_at"
              (is (not= (:updated_at @card) @updated)))))))))

(deftest split-update-test
  (testing "an update that before-update splits into one UPDATE per row logs each row once"
    (when config/ee-available?
      (mt/with-premium-features #{:change-log}
        (mt/with-temp [:model/Database db {}
                       :model/Table    t  {:db_id (:id db)}
                       :model/Field    f1 {:table_id (:id t), :base_type :type/Text, :effective_type :type/Text}
                       :model/Field    f2 {:table_id (:id t), :base_type :type/Text, :effective_type :type/Text}]
          ;; before-update moves f2's effective_type back to its base_type, so the two rows get different changes
          (t2/update! :metabase_field :id (:id f2) {:effective_type "type/Integer"})
          (is (= [["metabase_field" (:id f1) "update"] ["metabase_field" (:id f2) "update"]]
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
                                  (catch Exception _))))))
        (testing "a write that bypasses the model is not logged"
          (is (= [] (logged-by #(t2/update! :permissions_group :id (:id group) {:name "raw"})))))))))

(deftest raw-write-test
  (testing "the writes that bypass the models log their rows themselves"
    (when config/ee-available?
      (mt/with-premium-features #{:change-log}
        (mt/with-temp [:model/User             user  {}
                       :model/PermissionsGroup group {}]
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
                     (logged-by #(pulse.db/delete-pulse-channel-recipients-raw! (:id pc) #{(:id user)})))))))))))

(deftest foreign-keys-test
  (testing "the app DB gives the foreign keys from logged tables, the same on every engine"
    (let [[_ fks] (change-log.cascade/foreign-keys)
          edge    (fn [parent child column]
                    (some #(when (and (= child (:child %)) (= column (:column %))) (:rule %)) (get fks parent)))]
      (is (= :cascade (edge "metabase_database" "metabase_table" :db_id)))
      (is (= :cascade (edge "metabase_table" "metabase_field" :table_id)))
      (is (= :cascade (edge "metabase_field" "metabase_field_user_settings" :field_id)))
      (is (= :cascade (edge "pulse_channel" "pulse_channel_recipient" :pulse_channel_id)))
      (is (= :set-null (edge "metabase_field" "metabase_field" :fk_target_field_id)))
      (is (= :set-null (edge "report_card" "report_card" :source_card_id)))
      (testing "also to tables that are not logged"
        (is (= :cascade (edge "report_dashboardcard" "pulse_card" :dashboard_card_id)))
        (is (= :set-null (edge "collection" "report_card" :collection_id))))
      (testing "only from logged tables"
        (is (not-any? #(= "collection" (:child %)) (mapcat val fks)))))))

(defn- load-models!
  "Loads the namespace of every model. A model derives the hook when its namespace loads, and Metabase loads some only
  when they are first used."
  []
  (doseq [[model nspace] models.resolution/model->namespace
          :when (or config/ee-available? (not (str/starts-with? (str nspace) "metabase-enterprise")))]
    (t2/resolve-model model)))

(deftest logged-model-keys-test
  (testing "the key of each logged model is one integer column, which row_id holds"
    (load-models!)
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
  (testing "the namespace of each logged model loads at startup, so the change log sees the rows a delete cascades to"
    (load-models!)
    (let [startup (startup-namespaces)]
      (doseq [model (descendants :hook/change-log)
              :when (= "model" (namespace model))]
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
        (testing "a delete logs the rows the database deletes through ON DELETE CASCADE, at any depth, and the rows it
                  updates through ON DELETE SET NULL"
          (let [logged (set (logged-by #(t2/delete! :model/Database :id (:id db))))]
            (is (contains? logged ["metabase_database" (:id db) "delete"]))
            (is (contains? logged ["metabase_table" (:id t) "delete"]))
            (is (contains? logged ["metabase_field" (:id f) "delete"]))
            (is (contains? logged ["metabase_field_user_settings" (:id f) "delete"]))
            (is (contains? logged ["report_card" (:id card) "delete"]))
            (is (contains? logged ["metabase_field" (:id fk) "update"]))
            (is (not-any? #(= (:id other-t) (second %)) (filter #(= "metabase_table" (first %)) logged)))
            (testing "and the database did as the log says"
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
        (testing "removing a card from a dashboard, a model that is not logged, logs the subscription's card that the
                  database deletes with it"
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
    (testing "while the change log is off, a hooked model runs the queries it ran without the hook"
      (is (= unhooked off)))
    (when config/ee-available?
      (let [on (mt/with-premium-features #{:change-log}
                 (call-counts))]
        (testing "while the change log is on: an insert adds the log row; an update reads the keys and adds the log
                  rows; a delete also reads what it cascades to"
          (is (= (inc (:insert off)) (:insert on)))
          (is (= (+ (:update off) 2) (:update on)))
          (is (< (+ (:delete off) 2) (:delete on))))))))

(deftest off-test
  (mt/with-temp [:model/PermissionsGroup group {}]
    (mt/with-premium-features #{}
      (testing "without the `:change-log` feature, nothing is logged"
        (is (false? (change-log/enabled?)))
        (is (= [] (logged-by #(t2/update! :model/PermissionsGroup :id (:id group) {:name "unlicensed"})))))
      (testing "while the change log is off, log-write! does not call row-ids, so a raw write runs no extra query, and
                it returns what the write returns"
        (let [called? (atom false)]
          (is (= :written (change-log/log-write! :model/PermissionsGroup :update
                                                 #(do (reset! called? true) [(:id group)])
                                                 (constantly :written))))
          (is (false? @called?))))
      (testing "log-write! takes only a logged model"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid input"
                              (change-log/log-write! :model/Collection :update (constantly []) (constantly 0))))))))

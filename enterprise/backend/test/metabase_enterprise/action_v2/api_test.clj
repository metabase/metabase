(ns ^:mb/driver-tests metabase-enterprise.action-v2.api-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase-enterprise.action-v2.test-util :as data-editing.tu]
   [metabase.actions.test-util :as actions.tu]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc :as sql-jdbc]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.query-processor :as qp]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.data.sql :as sql.tx]
   [metabase.util :as u]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- table-rows [table-id]
  (mt/rows
   (qp/process-query
    {:database (mt/id)
     :type     :query
     :query    {:source-table table-id}})))

(def ^:private execute-url "/ee/action-v2/execute")
(def ^:private execute-bulk-url "/ee/action-v2/execute-bulk")
(def ^:private execute-form-url "/ee/action-v2/execute-bulk")

(defn create-rows!
  ([table-id rows]
   (create-rows! table-id 200 rows))
  ([table-id response-code rows]
   (mt/user-http-request :crowberto :post response-code execute-bulk-url
                         {:action :data-grid.row/create
                          :scope  {:table-id table-id}
                          :inputs rows})))

(defn- update-rows!
  ([table-id rows]
   (update-rows! table-id 200 rows))
  ([table-id response-code rows]
   (mt/user-http-request :crowberto :post response-code execute-bulk-url
                         {:action :data-grid.row/update
                          :scope  {:table-id table-id}
                          :inputs rows})))

(deftest feature-flag-required-test
  (mt/with-premium-features #{}
    (mt/assert-has-premium-feature-error "Editing Table Data" (mt/user-http-request :crowberto :post 402 execute-url))
    (mt/assert-has-premium-feature-error "Editing Table Data" (mt/user-http-request :crowberto :post 402 execute-bulk-url))
    (mt/assert-has-premium-feature-error "Editing Table Data" (mt/user-http-request :crowberto :post 402 execute-form-url))))

;; To Chris: I'm trying to get this tests passed
(deftest table-operations-via-action-execute-test
  (mt/with-premium-features #{:actions}
    (mt/test-drivers #{:h2 :postgres}
      (data-editing.tu/with-test-tables! [table-id data-editing.tu/default-test-table]
        (testing "Initially the table is empty"
          (is (= [] (table-rows table-id))))

        (testing "POST should insert new rows"
          (is (= #{{:op "created", :table-id table-id, :row {:id 1, :name "Pidgey", :song "Car alarms"}}
                   {:op "created", :table-id table-id, :row {:id 2, :name "Spearow", :song "Hold music"}}
                   {:op "created", :table-id table-id, :row {:id 3, :name "Farfetch'd", :song "The land of lisp"}}}
                 (set
                  (:outputs
                   (mt/user-http-request :crowberto :post 200 execute-bulk-url
                                         {:action_id "data-grid.row/create"
                                          :scope     {:table-id table-id}
                                          :inputs    [{:name "Pidgey"     :song "Car alarms"}
                                                      {:name "Spearow"    :song "Hold music"}
                                                      {:name "Farfetch'd" :song "The land of lisp"}]})))))

          (is (= [[1 "Pidgey" "Car alarms"]
                  [2 "Spearow" "Hold music"]
                  [3 "Farfetch'd" "The land of lisp"]]
                 (table-rows table-id))))

        #_(testing "PUT should update the relevant rows and columns"
            (is (= #{{:op "updated", :table-id table-id :row {:id 1, :name "Pidgey",     :song "Join us now and share the software"}}
                     {:op "updated", :table-id table-id :row {:id 2, :name "Speacolumn", :song "Hold music"}}}
                   (set
                    (:outputs
                     (mt/user-http-request :crowberto :post 200 execute-bulk-url
                                           {:action_id "data-grid.row/update"
                                            :scope     {:table-id table-id}
                                            :inputs    [{:id 1 :song "Join us now and share the software"}
                                                        {:id 2 :name "Speacolumn"}]})))))

            (is (= #{[1 "Pidgey" "Join us now and share the software"]
                     [2 "Speacolumn" "Hold music"]
                     [3 "Farfetch'd" "The land of lisp"]}
                   (set (table-rows table-id)))))

        #_(testing "PUT can also do bulk updates"
            (is (= #{{:op "updated", :table-id table-id, :row {:id 1, :name "Pidgey",     :song "The Star-Spangled Banner"}}
                     {:op "updated", :table-id table-id, :row {:id 2, :name "Speacolumn", :song "The Star-Spangled Banner"}}}
                   (set
                    (:outputs
                     (mt/user-http-request :crowberto :post 200 execute-bulk-url
                                           {:action_id "data-grid.row/update"
                                            :scope     {:table-id table-id}
                                            :inputs    [{:id 1}
                                                        {:id 2}]
                                            :params    {:song "The Star-Spangled Banner"}})))))

            (is (= #{[1 "Pidgey" "The Star-Spangled Banner"]
                     [2 "Speacolumn" "The Star-Spangled Banner"]
                     [3 "Farfetch'd" "The land of lisp"]}
                   (set (table-rows table-id)))))

        #_(testing "DELETE should remove the corresponding rows"
            (is (= #{{:op "deleted", :table-id table-id, :row {:id 1}}
                     {:op "deleted", :table-id table-id, :row {:id 2}}}
                   (set
                    (:outputs
                     (mt/user-http-request :crowberto :post 200 execute-bulk-url
                                           {:action_id "data-grid.row/delete"
                                            :scope     {:table-id table-id}
                                            :inputs    [{:id 1}
                                                        {:id 2}]})))))
            (is (= [[3 "Farfetch'd" "The land of lisp"]]
                   (table-rows table-id))))))))

(deftest table-operations-via-action-execute-with-compound-pk-test
  (mt/with-premium-features #{:actions}
    (mt/test-drivers #{:h2 :postgres}
      (data-editing.tu/with-test-tables! [table-id [{:id_1   'auto-inc-type
                                                     :id_2   'auto-inc-type
                                                     :name  [:text]
                                                     :song  [:text]}
                                                    {:primary-key [:id_1 :id_2]}]]
        (let [url "action/v2/execute-bulk"]
          (testing "Initially the table is empty"
            (is (= [] (table-rows table-id))))

          (testing "POST should insert new rows"
            (is (= #{{:op "created", :table-id table-id, :row {:id_1 1, :id_2 1, :name "Pidgey",     :song "Car alarms"}}
                     {:op "created", :table-id table-id, :row {:id_1 2, :id_2 2, :name "Spearow",    :song "Hold music"}}
                     {:op "created", :table-id table-id, :row {:id_1 3, :id_2 3, :name "Farfetch'd", :song "The land of lisp"}}}
                   (set
                    (:outputs
                     (mt/user-http-request :crowberto :post 200 url
                                           {:action_id "data-grid.row/create"
                                            :scope     {:table-id table-id}
                                            :inputs    [{:name "Pidgey"     :song "Car alarms"}
                                                        {:name "Spearow"    :song "Hold music"}
                                                        {:name "Farfetch'd" :song "The land of lisp"}]})))))

            (is (= [[1 1 "Pidgey" "Car alarms"]
                    [2 2 "Spearow" "Hold music"]
                    [3 3 "Farfetch'd" "The land of lisp"]]
                   (table-rows table-id))))

          (testing "PUT should update the relevant rows and columns"
            (is (= #{{:op "updated", :table-id table-id :row {:id_1 1, :id_2 1, :name "Pidgey",     :song "Join us now and share the software"}}
                     {:op "updated", :table-id table-id :row {:id_1 2, :id_2 2, :name "Speacolumn", :song "Hold music"}}}
                   (set
                    (:outputs
                     (mt/user-http-request :crowberto :post 200 url
                                           {:action_id "data-grid.row/update"
                                            :scope     {:table-id table-id}
                                            :inputs    [{:id_1 1, :id_2 1, :song "Join us now and share the software"}
                                                        {:id_1 2, :id_2 2, :name "Speacolumn"}]})))))

            (is (= #{[1 1 "Pidgey" "Join us now and share the software"]
                     [2 2 "Speacolumn" "Hold music"]
                     [3 3 "Farfetch'd" "The land of lisp"]}
                   (set (table-rows table-id)))))

          (testing "PUT can also do bulk updates"
            (is (= #{{:op "updated", :table-id table-id, :row {:id_1 1, :id_2 1, :name "Pidgey",     :song "The Star-Spangled Banner"}}
                     {:op "updated", :table-id table-id, :row {:id_1 2, :id_2 2, :name "Speacolumn", :song "The Star-Spangled Banner"}}}
                   (set
                    (:outputs
                     (mt/user-http-request :crowberto :post 200 url
                                           {:action_id "data-grid.row/update"
                                            :scope     {:table-id table-id}
                                            :inputs    [{:id_1 1, :id_2 1}
                                                        {:id_1 2, :id_2 2}]
                                            :params    {:song "The Star-Spangled Banner"}})))))

            (is (= #{[1 1 "Pidgey" "The Star-Spangled Banner"]
                     [2 2 "Speacolumn" "The Star-Spangled Banner"]
                     [3 3 "Farfetch'd" "The land of lisp"]}
                   (set (table-rows table-id)))))

          (testing "DELETE should remove the corresponding rows"
            (is (= #{{:op "deleted", :table-id table-id, :row {:id_1 1, :id_2 1}}
                     {:op "deleted", :table-id table-id, :row {:id_1 2, :id_2 2}}}
                   (set
                    (:outputs
                     (mt/user-http-request :crowberto :post 200 url
                                           {:action_id "data-grid.row/delete"
                                            :scope     {:table-id table-id}
                                            :inputs    [{:id_1 1, :id_2 1}
                                                        {:id_1 2, :id_2 2}]})))))
            (is (= [[3 3 "Farfetch'd" "The land of lisp"]]
                   (table-rows table-id)))))))))

;; TODO update now that we don't detect or delete children automatically, or require confirmation for cascading, or have undo
(deftest simple-delete-with-children-test
  (binding [actions.tu/*actions-test-data-tables* #{"people" "products" "orders"}]
    (mt/with-premium-features #{:actions}
      (data-editing.tu/with-temp-test-db!
        (let [body {:action_id "data-grid.row/delete"
                    :scope     {:table-id (mt/id :products)}
                    :inputs    [{(mt/format-name :id) 1}
                                {(mt/format-name :id) 2}]}
              children-count (fn []
                               (let [result (mt/rows (qp/process-query {:database (mt/id)
                                                                        :type     :query
                                                                        :query    {:source-table (mt/id :orders)
                                                                                   :aggregation  [[:count]]
                                                                                   :breakout     [(mt/$ids $orders.product_id)]
                                                                                   :filter        [:in (mt/$ids $orders.product_id) 1 2]}}))]
                                 (zipmap (map first result) (map second result))))]

          (testing "sanity check that we have children rows"
            (is (= {1 93
                    2 98}
                   (children-count))))
          (testing "delete without delete-children param will return errors with children count"
            (is (=? {:errors {:type "metabase.actions.error/children-exist", :children-count {(mt/id :orders) 191}}}
                    (mt/user-http-request :crowberto :post 400 execute-bulk-url
                                          body))))

          (testing "success with delete-children options"
            (is (=? {:outputs [{:table-id (mt/id :products) :op "deleted" :row {(keyword (mt/format-name :id)) 1}}
                               {:table-id (mt/id :products) :op "deleted" :row {(keyword (mt/format-name :id)) 2}}]}
                    (mt/user-http-request :crowberto :post 200 execute-bulk-url
                                          (assoc body :params {:delete-children true}))))
            (is (empty? (children-count)))
            (testing "the change is not undoable"
              (is (= "Your previous change cannot be undone"
                     (mt/user-http-request :crowberto :post 405 execute-bulk-url
                                           {:action_id "data-editing/undo"
                                            :scope     {:table-id (mt/id :products)}
                                            :inputs    []}))))))))))

(mt/defdataset self-referential-categories
  [["category"
    [{:field-name "name" :base-type :type/Text :not-null? true}
     {:field-name "parent_id" :base-type :type/Integer :fk :category}]
    [["Electronics" nil]
     ["Phones" 1]
     ["Laptops" 1]
     ["Smartphones" 2]
     ["Gaming Laptops" 3]]]])

;; Update this too with actual behavior
#_(deftest simple-delete-with-self-referential-children-test
    (mt/with-premium-features #{:actions}
      (data-editing.tu/with-actions-temp-db self-referential-categories
        (let [body {:action_id "data-grid.row/delete"
                    :scope     {:table-id (mt/id :category)}
                    :inputs    [{(mt/format-name :id) 1}]}
              children-count (fn [parent-id]
                               (let [result (mt/rows (qp/process-query {:database (mt/id)
                                                                        :type     :query
                                                                        :query    {:source-table (mt/id :category)
                                                                                   :aggregation  [[:count]]
                                                                                   :filter       [:= (mt/$ids $category.parent_id) parent-id]}}))]
                                 (-> result first first)))]

          (testing "sanity check that we have self-referential children"
            (is (= 2 (children-count 1)))
            (is (= 1 (children-count 2)))
            (is (= 1 (children-count 3))))

          (testing "delete parent with self-referential children should return error without delete-children param"
            (is (=? {:errors {:type "metabase.actions.error/children-exist", :children-count {(mt/id :category) 4}}}
                    (mt/user-http-request :crowberto :post 400 execute-bulk-url body))))

          (testing "success with delete-children option should cascade delete all descendants"
            (is (=? {:outputs [{:table-id (mt/id :category)
                                :op       "deleted"
                                :row      {(keyword (mt/format-name :id)) 1}}]}
                    (mt/user-http-request :crowberto :post 200 execute-bulk-url
                                          (assoc body :params {:delete-children true}))))
            (is (= 0 (count (table-rows (mt/id :category)))))

            (testing "the change is not undoable for self-referential cascades"
              (is (= "Your previous change cannot be undone"
                     (mt/user-http-request :crowberto :post 405 execute-bulk-url
                                           {:action_id "data-editing/undo"
                                            :scope     {:table-id (mt/id :category)}
                                            :inputs    []})))))))))

#_(mt/defdataset mutual-recursion-users-teams
    [["user"
      [{:field-name "id" :base-type :type/Integer :pk? true}
       {:field-name "name" :base-type :type/Text :not-null? true}
       {:field-name "team_id" :base-type :type/Integer #_:fk #_:team}]
      [[1 "Alice" 1]
       [2 "Bob" 2]]]
     ["team"
      [{:field-name "id" :base-type :type/Integer :pk? true}
       {:field-name "name" :base-type :type/Text :not-null? true}
       {:field-name "manager_id" :base-type :type/Integer :fk :user}]
      [[1 "Alpha" nil]
       [2 "Beta" 1]]]])

;; TODO let's keep this test setup, but track our current behavior with no smarts
#_(deftest mutual-recursion-delete-test
    (mt/test-drivers #{:h2 :postgres}
      (mt/with-premium-features #{:actions}
        (data-editing.tu/with-actions-temp-db mutual-recursion-users-teams
          (jdbc/execute! (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
                         (sql.tx/add-fk-sql driver/*driver*
                                            mutual-recursion-users-teams
                                            {:table-name "user"}
                                            {:fk :team :field-name "team_id"})
                         {:transaction? false})
          (sync/sync-database! (mt/db))
          (let [users-table-id (mt/id :user)
                teams-table-id (mt/id :team)
                delete-user-body {:action_id "data-grid.row/delete"
                                  :scope     {:table-id users-table-id}
                                  :inputs    [{(mt/format-name :id) 1}]}]

            (testing "delete user involved in mutual recursion should return error without delete-children param"
              (is (=? {:errors {:type "metabase.actions.error/children-exist"
                                :children-count {(mt/id :team) 1
                                                 (mt/id :user) 1}}}
                      (mt/user-http-request :crowberto :post 400 execute-bulk-url delete-user-body))))
            (testing "delete with delete-children should handle mutual recursion gracefully"
            ; When deleting Alice with delete-children, it should:
            ; 1. Delete Alice (user 1)
            ; 2. This should cascade to Team Beta (which Alice manages)
            ; 3. Deleting Team Beta should cascade to Bob (who belong to Team Beta)
              (is (=? {:outputs [{:table-id users-table-id
                                  :op       "deleted"
                                  :row      {(keyword (mt/format-name :id)) 1}}]}
                      (mt/user-http-request :crowberto :post 200 execute-bulk-url
                                            (assoc delete-user-body :params {:delete-children true}))))

              (let [remaining-users (table-rows users-table-id)
                    remaining-teams (table-rows teams-table-id)]
                (testing "mutual recursion cascade should delete interconnected records"
                  (is (empty? remaining-users))
                  (is (= 1 (count remaining-teams)))))))))))

(deftest editing-allowed-test
  (mt/with-premium-features #{:actions}
    (mt/test-drivers #{:h2 :postgres}
      (testing "40x returned if user/database not configured for editing"
        (let [test-endpoints (fn [flags]
                               (data-editing.tu/with-test-tables! [table-id data-editing.tu/default-test-table]
                                 (let [actions-enabled (:a flags)
                                       editing-enabled (:d flags)
                                       superuser       (:s flags)
                                       url             execute-bulk-url
                                       settings        {:database-enable-table-editing (boolean editing-enabled)
                                                        :database-enable-actions       (boolean actions-enabled)}
                                       user            (if superuser :crowberto :rasta)
                                       req             mt/user-http-request-full-response]
                                   (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings settings}
                                     {:settings settings
                                      :user     user
                                      :responses {:create (req user :post url {:action :data-grid.row/create, :inputs [{:name "Pidgey" :song "Car alarms"}]})
                                                  :update (req user :post url {:action :data-grid.row/update, :inputs [{:id 1 :song "Join us now and share the software"}]})
                                                  :delete (req user :post url {:action :data-grid.row/delete, :inputs [{:id 1}]})}}))))

              error-or-ok
              (fn [{:keys [status body]}]
                (if (<= 200 status 299)
                  :ok
                  [(:message body body) status]))

              ;; Shorthand config notation
              ;; :a == action-editing should not affect result
              ;; :d == data-editing   only allowed to edit if editing enabled
              ;; :s == super-user     only allowed to edit if a superuser
              tests
              [#{:a}       ["You don't have permissions to do that." 403]
               #{:d}       ["You don't have permissions to do that." 403]
               #{:a :d}    ["You don't have permissions to do that." 403]
               #{:s}       ["Data editing is not enabled."           400]
               #{:s :a}    ["Data editing is not enabled."           400]
               #{:s :d}    :ok
               #{:s :a :d} :ok]]
          (doseq [[flags expected] (partition 2 tests)
                  :let [{:keys [settings user responses]} (test-endpoints flags)]
                  [verb  response] responses]
            (testing (format "%s user: %s, settings: %s" verb user settings)
              (is (= expected (error-or-ok response))))))))))

;; TODO this needs to be updated to use the execute api
(deftest coercion-test
  (mt/with-premium-features #{:actions}
    (mt/test-drivers #{:h2 :postgres}
      (let [create! #(mt/user-http-request :crowberto :post execute-bulk-url {:action :data-grid.row/create, :scope {:table-id %1}, :inputs %2})
            update! #(mt/user-http-request :crowberto :post execute-bulk-url {:action :data-grid.row/update, :scope {:table-id %1}, :inputs %2})
            always-lossy #{:Coercion/UNIXNanoSeconds->DateTime
                           :Coercion/UNIXMicroSeconds->DateTime
                           :Coercion/ISO8601->Date
                           :Coercion/ISO8601->Time}
            driver-lossy (case driver/*driver*
                           :postgres #{:Coercion/UNIXMilliSeconds->DateTime}
                           #{})
            lossy? (set/union always-lossy driver-lossy)
            do-test (fn [t coercion-strategy input expected]
                      (testing (str t " " coercion-strategy " " input)
                        (data-editing.tu/with-test-tables! [table-id [{:id 'auto-inc-type
                                                                       :o  [t :null]}
                                                                      {:primary-key [:id]}]]
                          (let [table-name-kw (t2/select-one-fn (comp keyword :name) [:model/Table :name] table-id)
                                field-id      (t2/select-one-fn :id [:model/Field :id] :table_id table-id :name "o")
                                driver        driver/*driver*
                                get-qp-state  (fn [] (map #(zipmap [:id :o] %) (table-rows table-id)))
                                get-db-state  (fn [] (sql-jdbc/query driver (mt/id) {:select [:*] :from [table-name-kw]}))]
                            (t2/update! :model/Field field-id {:coercion_strategy coercion-strategy})
                            (testing "create"
                              (let [row {:o input}
                                    {returned-state :created-rows} (create! table-id [row])
                                    qp-state (get-qp-state)
                                    _ (is (= 1 (count returned-state)))]
                                (when-not (lossy? coercion-strategy)
                                  (is (= qp-state returned-state) "we should return the same coerced output that table/$table-id/data would return")
                                  (is (= input (:o (first qp-state))) "the qp value should be the same as the input"))
                                (is (= expected (:o (first (get-db-state)))))))
                            (testing "update"
                              (let [[{id :id}] (:created-rows (create! table-id [{:o nil}]))
                                    _ (is (some? id))
                                    {returned-state :updated} (update! table-id [{:id id, :o input}])
                                    [qp-row] (filter (comp #{id} :id) (get-qp-state))]
                                (is (= 1 (count returned-state)))
                                (is (some? qp-row))
                                (when-not (lossy? coercion-strategy)
                                  (is (= [qp-row] returned-state))
                                  (is (= input (:o qp-row))))
                                (is (= expected (:o (first (get-db-state)))))))))))]

        ;;    type     coercion                                     input                          database
        (->> [:text    nil                                          "a"                            "a"
              :text    :Coercion/YYYYMMDDHHMMSSString->Temporal     "2025-03-25T14:34:00Z"         "20250325143400"
              :text    :Coercion/ISO8601->DateTime                  "2025-03-25T14:34:42.314Z"     "2025-03-25T14:34:42.314Z"
              :text    :Coercion/ISO8601->Date                      "2025-03-25T00:00:00Z"         "2025-03-25"
              :text    :Coercion/ISO8601->Time                      "1999-04-05T14:34:42Z"         "14:34:42"

              ;; note fractional seconds in input, remains undefined for Seconds
              :int     :Coercion/UNIXSeconds->DateTime              "2025-03-25T14:34:42Z"         (quot (inst-ms #inst "2025-03-25T14:34:42Z") 1000)
              :bigint  :Coercion/UNIXMilliSeconds->DateTime         "2025-03-25T14:34:42.314Z"     (inst-ms #inst "2025-03-25T14:34:42.314Z")

              ;; note fractional secs beyond millis are discarded   (lossy)
              :bigint  :Coercion/UNIXMicroSeconds->DateTime         "2025-03-25T14:34:42.314121Z"  (* (inst-ms #inst "2025-03-25T14:34:42.314Z") 1000)
              :bigint  :Coercion/UNIXNanoSeconds->DateTime          "2025-03-25T14:34:42.3141212Z" (* (inst-ms #inst "2025-03-25T14:34:42.314Z") 1000000)

              ;; nil safe
              :text    :Coercion/YYYYMMDDHHMMSSString->Temporal     nil                            nil

              ;; seconds component does not work properly here, lost by qp output, bug in existing code?
              #_#_#_#_:text :Coercion/YYYYMMDDHHMMSSString->Temporal     "2025-03-25T14:34:42Z"     "20250325143442"]
             (partition 4)
             (run! #(apply do-test %)))))))

;; TODO update this to use the execute api
(deftest field-values-invalidated-test
  (mt/with-premium-features #{:actions}
    (mt/test-drivers #{:h2 :postgres}
      (data-editing.tu/with-test-tables! [table-id [{:id 'auto-inc-type, :n [:text]} {:primary-key [:id]}]]
        (let [field-id     (t2/select-one-fn :id :model/Field :table_id table-id :name "n")
              _            (t2/update! :model/Field {:id field-id} {:semantic_type "type/Category"})
              field-values #(vec (:values (field-values/get-latest-full-field-values field-id)))
              create!      #(create-rows! table-id %)
              update!      #(mt/user-http-request :crowberto :put 200 execute-bulk-url {:rows %})
              expect-field-values
              (fn [expect]                     ; redundantly pass expect get ok-ish assert errors (preserve last val)
                (let [last-res (volatile! nil)]
                  (or (u/poll {:thunk       (fn [] (vreset! last-res (field-values)))
                               :done?       #(= expect %)
                               :timeout-ms  1000
                               :interval-ms 1})
                      @last-res)))]
          (is (= [] (field-values)))

          (create! [{:n "a"}])
          (is (= ["a"] (expect-field-values ["a"])))

          (create! [{:n "b"} {:n "c"}])
          (is (= ["a" "b" "c"] (expect-field-values ["a" "b" "c"])))

          (update! [{:id 2, :n "d"}])
          (is (= ["a" "c" "d"] (expect-field-values ["a" "c" "d"])))

          (create! [{:n "a"}])
          (update! [{:id 1, :n "e"}])
          (is (= ["a" "c" "d" "e"] (expect-field-values ["a" "c" "d" "e"]))))))))

;; actions (need this to associate with the route namespace)
;; data-editing (keep this to control whether the data-grid.row actions are callable?)

(deftest unified-execute-test
  (let [url "action/v2/execute"
        req #(mt/user-http-request-full-response (:user % :crowberto) :post url
                                                 (merge {:scope {:unknown :model-action} :input {}}
                                                        (dissoc % :user-id)))]
    (mt/with-premium-features #{:actions}
      (mt/test-drivers #{:h2 :postgres}
        (mt/with-non-admin-groups-no-root-collection-perms
          (data-editing.tu/with-test-tables! [table-id [{:id 'auto-inc-type
                                                         :name [:text]
                                                         :status [:text]}
                                                        {:primary-key [:id]}]]
            (mt/with-temp [:model/Card          model    {:type           :model
                                                          :table_id       table-id
                                                          :database_id    (mt/id)
                                                          :dataset_query  {:database (mt/id)
                                                                           :type :query
                                                                           :query {:source-table table-id}}}
                           :model/Action        action   {:type           :implicit
                                                          :name           "update"
                                                          :model_id       (:id model)
                                                          :parameters     [{:id "a"
                                                                            :name "Id"
                                                                            :slug "id"}
                                                                           {:id "b"
                                                                            :name "Name"
                                                                            :slug "name"}
                                                                           {:id "c"
                                                                            :name "Status"
                                                                            :slug "status"}]}
                           :model/ImplicitAction _       {:action_id      (:id action)
                                                          :kind           "row/update"}
                           :model/Dashboard     dash     {}
                           :model/DashboardCard dashcard {:dashboard_id   (:id dash)
                                                          :card_id        (:id model)
                                                          :visualization_settings
                                                          {:table_id table-id
                                                           :editableTable.enabledActions
                                                           (let [param-maps
                                                                 ;; TODO change these to use field ids, to test the translation
                                                                 [{:parameterId "id",     :sourceType "row-data", :sourceValueTarget "id"}
                                                                  {:parameterId "name",   :sourceType "row-data", :sourceValueTarget "name"}
                                                                  {:parameterId "status", :sourceType "row-data", :sourceValueTarget "status"}]]
                                                             [{:id                "dashcard:unknown:abcdef"
                                                               :actionId          (:id action)
                                                               :actionType        "data-grid/custom-action"
                                                               :parameterMappings param-maps
                                                               :enabled           true}
                                                              {:id                "dashcard:unknown:fedcba"
                                                               :actionId          "table.row/update"
                                                               :actionType        "data-grid/custom-action"
                                                               :mapping           {:table-id table-id
                                                                                   :row      "::root"}
                                                               :parameterMappings param-maps
                                                               :enabled           true}])}}]
              (testing "no access to the model"
                (is (= 403 (:status (req {:user      :rasta
                                          :action_id (:id action)
                                          :scope     {:dashcard-id (:id dashcard)}
                                          :input     {:id 1}
                                          :params    {:status "approved"}})))))
              ;; should not need this permission for model actions
              (data-editing.tu/with-data-editing-enabled! false
                (testing "non-row action modifying a row"
                  (testing "underlying row does not exist, action not executed"
                    (is (= 400 (:status (req {:action_id (:id action)
                                              :scope     {:dashcard-id (:id dashcard)}
                                              :input     {:id 1}
                                              :params    {:status "approved"}})))))
                  (testing "underlying row exists, action executed"
                    (data-editing.tu/with-data-editing-enabled! true
                      (create-rows! table-id [{:name "Widgets", :status "waiting"}]))
                    (is (= {:status 200
                            :body   {:outputs [{:rows-updated 1}]}}
                           (-> (req {:action_id (:id action)
                                     :scope     {:dashcard-id (:id dashcard)}
                                     :input     {:id 1}
                                     :params    {:status "approved"}})
                               (select-keys [:status :body]))))))
                (testing "dashcard row action modifying a row - implicit action"
                  (let [action-id "dashcard:unknown:abcdef"]
                    (testing "underlying row does not exist, action not executed"
                      (is (= 404 (:status (req {:action_id action-id
                                                :scope     {:dashcard-id (:id dashcard)}
                                                :input     {:id 2}
                                                :params    {:status "approved"}})))))
                    (testing "underlying row exists, action executed"
                      (data-editing.tu/with-data-editing-enabled! true
                        (create-rows! table-id [{:name "Sprockets", :status "waiting"}]))
                      (is (= {:status 200
                              :body   {:outputs [{:rows-updated 1}]}}
                             (-> (req {:action_id action-id
                                       :scope     {:dashcard-id (:id dashcard)}
                                       :input     {:id 2}
                                       :params    {:status "approved"}})
                                 (select-keys [:status :body]))))))))
              ;; but it is necessary for the primitives
              (data-editing.tu/with-data-editing-enabled! true
                (testing "dashcard row action modifying a row - primitive action"
                  (let [action-id "dashcard:unknown:fedcba"]
                    (testing "underlying row does not exist, action not executed"
                      (is (= 404 (:status (req {:action_id action-id
                                                :scope     {:dashcard-id (:id dashcard)}
                                                :input     {:id 3}
                                                :params    {:status "approved"}})))))
                    (testing "underlying row exists, action executed"
                      (create-rows! table-id [{:name "Braai tongs", :status "waiting"}])
                      (is (= {:status 200
                              :body   {:outputs [{:table-id table-id
                                                  :op       "updated"
                                                  :row      {:id 3, :name "Braai tongs", :status "approved"}}]}}
                             (-> (req {:action_id action-id
                                       :scope     {:dashcard-id (:id dashcard)}
                                       :input     {:id 3}
                                       :params    {:status "approved"}})
                                 (select-keys [:status :body])))))))))))))))

;; TODO we may want to test that data-grid/built-in actions can't get called in they're disabled?
;;    i.e. the data-editing premium feature is enabled

(deftest unified-execute-server-side-mapping-test
  (mt/with-premium-features #{:actions}
    (mt/test-drivers #{:h2 :postgres}
      (data-editing.tu/with-test-tables! [table-1-id [{:id  'auto-inc-type
                                                       :col [:text]}
                                                      {:primary-key [:id]}]
                                          table-2-id [{:id 'auto-inc-type
                                                       :a  [:text]
                                                       :b  [:text]
                                                       :c  [:text]
                                                       :d  [:text]}
                                                      {:primary-key [:id]}]]

        (mt/with-temp [:model/Card          model    {:type           :model
                                                      :table_id       table-1-id
                                                      :database_id    (mt/id)
                                                      :dataset_query  {:database (mt/id)
                                                                       :type     :query
                                                                       :query    {:source-table table-1-id}}}
                       :model/Dashboard     dash     {}
                       :model/DashboardCard dashcard {:dashboard_id   (:id dash)
                                                      :card_id        (:id model)
                                                      :visualization_settings
                                                      {:table_id table-1-id
                                                       :editableTable.enabledActions
                                                       [{:id         "dashcard:unknown:my-row-action"
                                                         :actionId   "table.row/create"
                                                         :actionType "data-grid/custom-action"
                                                         :mapping    {:table-id table-2-id
                                                                      :row      {:a ["::key" "aa"]
                                                                                 :b ["::key" "bb"]
                                                                                 :c ["::key" "cc"]
                                                                                 :d ["::key" "dd"]}}
                                                         :parameterMappings
                                                         [{:parameterId "aa" :sourceType "row-data" :sourceValueTarget "col"}
                                                          {:parameterId "bb" :sourceType "ask-user"}
                                                          {:parameterId "cc" :sourceType "ask-user" :value "default"}
                                                          {:parameterId "dd" :sourceType "constant" :value "hard-coded"}]
                                                         :enabled    true}]}}]
          (testing "dashcard row action modifying a row - primitive action"
            (let [action-id "dashcard:unknown:my-row-action"]
              (testing "underlying row does not exist, action not executed"
                (mt/user-http-request :crowberto :post 404 execute-url {:action_id action-id
                                                                        :scope  {:dashcard-id (:id dashcard)}
                                                                        :input  {:id 1}
                                                                        :params {:status "approved"}}))
              (testing "underlying row exists, action executed\n"
                (create-rows! table-1-id [{:col "database-value"}])
                (let [base-req {:action_id action-id
                                :scope     {:dashcard-id (:id dashcard)}
                                :input     {:id 1, :col "stale-value"}
                                :params    {:bb nil}}]
                  ;; TODO don't have a way to make params required for non-legacy actions yet, d'oh
                  ;;      oh well, let nil spill through
                  (testing "missing required param"
                    (is (=? {:outputs [{:table-id table-2-id
                                        :op       "created"
                                        :row      {:id 1
                                                   :a  "database-value"
                                                   :b  nil
                                                   :c  "default"
                                                   :d  "hard-coded"}}]}
                            (mt/user-http-request :crowberto :post 200 execute-url base-req))))
                  (testing "missing optional param"
                    (is (=? {:outputs [{:table-id table-2-id
                                        :op       "created"
                                        :row      {:id 2
                                                   :a  "database-value"
                                                   :b  "necessary"
                                                   :c  "default"
                                                   :d  "hard-coded"}}]}
                            (mt/user-http-request :crowberto :post 200 execute-url (assoc-in base-req [:params :bb] "necessary")))))
                  (testing "null optional param"
                    (is (= {:outputs [{:table-id table-2-id
                                       :op       "created"
                                       :row      {:id 3
                                                  :a  "database-value"
                                                  :b  "necessary"
                                                  :c  nil
                                                  :d  "hard-coded"}}]}
                           (mt/user-http-request :crowberto :post 200 execute-url (-> base-req
                                                                                      (assoc-in [:params :bb] "necessary")
                                                                                      (assoc-in [:params :cc] nil))))))
                  (testing "provided optional param"
                    (is (= {:outputs [{:table-id table-2-id
                                       :op       "created"
                                       :row      {:id 4
                                                  :a  "database-value"
                                                  :b  "necessary"
                                                  :c  "optional"
                                                  :d  "hard-coded"}}]}
                           (mt/user-http-request :crowberto :post 200 execute-url (-> base-req
                                                                                      (assoc-in [:params :bb] "necessary")
                                                                                      (assoc-in [:params :cc] "optional")))))))))))))))

(deftest execute-form-built-in-table-action-test
  (mt/with-premium-features #{:actions}
    (mt/test-drivers #{:h2 :postgres}
      (data-editing.tu/with-test-tables! [table-id [{:id 'auto-inc-type
                                                     :text      [:text]
                                                     :int       [:int]
                                                     :timestamp [:timestamp]
                                                     :date [:date]
                                                     :inactive [:text]}
                                                    {:primary-key [:id]}]]
        ;; This inactive field should not show up
        (t2/update! :model/Field {:table_id table-id, :name "inactive"} {:active false})
        (testing "table actions"
          (let [create-id           "data-grid.row/create"
                update-id           "data-grid.row/update"
                delete-id           "data-grid.row/delete"
                scope               {:table-id table-id}]

            (testing "create"
              (is (=? {:parameters [{:id "text"      :display_name "Text"      :input_type "text"}
                                    {:id "int"       :display_name "Int"       :input_type "text"}
                                    {:id "timestamp" :display_name "Timestamp" :input_type "datetime"}
                                    {:id "date"      :display_name "Date"      :input_type "date"}]}
                      (mt/user-http-request :crowberto :post 200 "action/v2/execute-form"
                                            {:scope     scope
                                             :action_id create-id}))))

            (testing "update"
              (is (=? {:parameters [{:id "id"        :display_name "ID"        :input_type "text"}
                                    {:id "text"      :display_name "Text"      :input_type "text"}
                                    {:id "int"       :display_name "Int"       :input_type "text"}
                                    {:id "timestamp" :display_name "Timestamp" :input_type "datetime"}
                                    {:id "date"      :display_name "Date"      :input_type "date"}]}
                      (mt/user-http-request :crowberto :post 200 "action/v2/execute-form"
                                            {:scope     scope
                                             :action_id update-id}))))

            (testing "delete"
              (is (=? {:parameters [{:id "id" :display_name "ID" :input_type "text"}]}
                      (mt/user-http-request :crowberto :post 200 "action/v2/execute-form"
                                            {:scope     scope
                                             :action_id delete-id}))))))))))

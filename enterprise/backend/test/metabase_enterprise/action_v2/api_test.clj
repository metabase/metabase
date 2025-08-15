(ns ^:mb/driver-tests metabase-enterprise.action-v2.api-test
  (:require
   [clojure.data :as data]
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [clojure.test :refer :all]
   [flatland.ordered.map :refer [ordered-map]]
   [metabase-enterprise.action-v2.api]
   [metabase-enterprise.action-v2.coerce :as coerce]
   [metabase-enterprise.action-v2.data-editing :as data-editing]
   [metabase-enterprise.action-v2.test-util :as action-v2.tu]
   [metabase.actions.test-util :as actions.tu]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc :as sql-jdbc]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.query-processor :as qp]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.data.sql :as sql.tx]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent ArrayBlockingQueue)))

(set! *warn-on-reflection* true)

;; We're postponing adding this flag until other features like data-apps need them.
(def ^:private actions-feature-flag :table-data-editing)

(defn- table-rows [table-id]
  (mt/rows
   (qp/process-query
    {:database (mt/id)
     :type     :query
     :query    {:source-table table-id}})))

(def ^:private execute-url "/ee/action-v2/execute")
(def ^:private execute-bulk-url "/ee/action-v2/execute-bulk")
(def ^:private execute-form-url "/ee/action-v2/execute-form")

(deftest feature-flag-required-test
  (mt/with-premium-features #{}
    (mt/assert-has-premium-feature-error "Table Data Editing" (mt/user-http-request :crowberto :post 402 execute-url))
    (mt/assert-has-premium-feature-error "Table Data Editing" (mt/user-http-request :crowberto :post 402 execute-bulk-url))
    (mt/assert-has-premium-feature-error "Table Data Editing" (mt/user-http-request :crowberto :post 402 execute-form-url))))

;; TODO have a similar test to this next one, but for single execution (which data apps will use)

(deftest table-operations-via-action-execute-test
  (mt/with-premium-features #{actions-feature-flag}
    (mt/test-drivers (mt/normal-drivers-with-feature :actions/data-editing)
      (action-v2.tu/with-test-tables! [table-id action-v2.tu/default-test-table]
        (testing "Initially the table is empty"
          (is (= [] (table-rows table-id))))

        (testing "POST should insert new rows"
          (is (= #{{:op "created", :table-id table-id, :row {:id 1, :name "Pidgey", :song "Car alarms"}}
                   {:op "created", :table-id table-id, :row {:id 2, :name "Spearow", :song "Hold music"}}
                   {:op "created", :table-id table-id, :row {:id 3, :name "Farfetch'd", :song "The land of lisp"}}}
                 (set
                  (:outputs
                   (action-v2.tu/create-rows! table-id [{:name "Pidgey" :song "Car alarms"}
                                                        {:name "Spearow" :song "Hold music"}
                                                        {:name "Farfetch'd" :song "The land of lisp"}])))))

          (is (= [[1 "Pidgey" "Car alarms"]
                  [2 "Spearow" "Hold music"]
                  [3 "Farfetch'd" "The land of lisp"]]
                 (table-rows table-id))))

        (testing "PUT should update the relevant rows and columns"
          (is (= #{{:op "updated", :table-id table-id :row {:id 1, :name "Pidgey", :song "Join us now and share the software"}}
                   {:op "updated", :table-id table-id :row {:id 2, :name "Speacolumn", :song "Hold music"}}}
                 (set
                  (:outputs
                   (action-v2.tu/update-rows! table-id [{:id 1 :song "Join us now and share the software"}
                                                        {:id 2 :name "Speacolumn"}])))))

          (is (= #{[1 "Pidgey" "Join us now and share the software"]
                   [2 "Speacolumn" "Hold music"]
                   [3 "Farfetch'd" "The land of lisp"]}
                 (set (table-rows table-id)))))

        (testing "PUT can also do bulk updates"
          (is (= #{{:op "updated", :table-id table-id, :row {:id 1, :name "Pidgey", :song "The Star-Spangled Banner"}}
                   {:op "updated", :table-id table-id, :row {:id 2, :name "Speacolumn", :song "The Star-Spangled Banner"}}}
                 (set
                  (:outputs
                   (action-v2.tu/update-rows! table-id [{:id 1} {:id 2}] {:song "The Star-Spangled Banner"})))))

          (is (= #{[1 "Pidgey" "The Star-Spangled Banner"]
                   [2 "Speacolumn" "The Star-Spangled Banner"]
                   [3 "Farfetch'd" "The land of lisp"]}
                 (set (table-rows table-id)))))

        (testing "DELETE should remove the corresponding rows"
          (is (= #{{:op "deleted", :table-id table-id, :row {:id 1}}
                   {:op "deleted", :table-id table-id, :row {:id 2}}}
                 (set
                  (:outputs
                   (action-v2.tu/delete-rows! table-id [{:id 1} {:id 2}])))))
          (is (= [[3 "Farfetch'd" "The land of lisp"]]
                 (table-rows table-id))))))))

(deftest table-operations-via-action-execute-with-uuid-pk-test
  (mt/with-premium-features #{actions-feature-flag}
    ;; MySQL does not support a UUID type (or at least if it does, our create-table syntax is wrong)
    (mt/test-drivers (disj (mt/normal-drivers-with-feature :actions/data-editing) :mysql)
      (action-v2.tu/with-test-tables! [table-id [{:id [:uuid]
                                                  :name [:text]
                                                  :song [:text]}
                                                 {:primary-key [:id]}]]
        (let [id-1 (random-uuid)
              id-2 (random-uuid)
              id-3 (random-uuid)]
          (testing "Initially the table is empty"
            (is (= [] (table-rows table-id))))

          (testing "POST should insert new rows"
            (is (= #{{:op "created", :table-id table-id, :row {:id (str id-1), :name "Pidgey", :song "Car alarms"}}
                     {:op "created", :table-id table-id, :row {:id (str id-2), :name "Spearow", :song "Hold music"}}
                     {:op "created", :table-id table-id, :row {:id (str id-3), :name "Farfetch'd", :song "The land of lisp"}}}
                   (set
                    (:outputs
                     (action-v2.tu/create-rows! table-id [{:id id-1, :name "Pidgey"     :song "Car alarms"}
                                                          {:id id-2, :name "Spearow"    :song "Hold music"}
                                                          {:id id-3, :name "Farfetch'd" :song "The land of lisp"}])))))

            (is (= [[id-1 "Pidgey" "Car alarms"]
                    [id-2 "Spearow" "Hold music"]
                    [id-3 "Farfetch'd" "The land of lisp"]]
                   (table-rows table-id))))

          (testing "PUT should update the relevant rows and columns"
            (is (= #{{:op "updated", :table-id table-id :row {:id (str id-1), :name "Pidgey",     :song "Join us now and share the software"}}
                     {:op "updated", :table-id table-id :row {:id (str id-2), :name "Speacolumn", :song "Hold music"}}}
                   (set
                    (:outputs
                     (action-v2.tu/update-rows! table-id [{:id id-1, :song "Join us now and share the software"}
                                                          {:id id-2, :name "Speacolumn"}])))))

            (is (= #{[id-1 "Pidgey" "Join us now and share the software"]
                     [id-2 "Speacolumn" "Hold music"]
                     [id-3 "Farfetch'd" "The land of lisp"]}
                   (set (table-rows table-id)))))

          (testing "PUT can also do bulk updates"
            (is (= #{{:op "updated", :table-id table-id, :row {:id (str id-1), :name "Pidgey",     :song "The Star-Spangled Banner"}}
                     {:op "updated", :table-id table-id, :row {:id (str id-2), :name "Speacolumn", :song "The Star-Spangled Banner"}}}
                   (set
                    (:outputs
                     (action-v2.tu/update-rows! table-id
                                                [{:id id-1}
                                                 {:id id-2}]
                                                {:song "The Star-Spangled Banner"})))))

            (is (= #{[id-1 "Pidgey" "The Star-Spangled Banner"]
                     [id-2 "Speacolumn" "The Star-Spangled Banner"]
                     [id-3 "Farfetch'd" "The land of lisp"]}
                   (set (table-rows table-id)))))

          (testing "DELETE should remove the corresponding rows"
            (is (= #{{:op "deleted", :table-id table-id, :row {:id (str id-1)}}
                     {:op "deleted", :table-id table-id, :row {:id (str id-2)}}}
                   (set
                    (:outputs
                     (action-v2.tu/delete-rows! table-id [{:id id-1}
                                                          {:id id-2}])))))
            (is (= [[id-3 "Farfetch'd" "The land of lisp"]]
                   (table-rows table-id)))))))))

(deftest table-operations-via-action-execute-with-compound-pk-test
  (mt/with-premium-features #{actions-feature-flag}
    (mt/test-drivers (mt/normal-drivers-with-feature :actions/data-editing)
      (action-v2.tu/with-test-tables! [table-id [{:id_1   'auto-inc-type
                                                     ;; MySQL does not support multiple auto increment fields.
                                                  :id_2   [:integer]
                                                  :name   [:text]
                                                  :song   [:text]}
                                                 {:primary-key [:id_1 :id_2]}]]
        (testing "Initially the table is empty"
          (is (= [] (table-rows table-id))))

        (testing "POST should insert new rows"
          (is (= #{{:op "created", :table-id table-id, :row {:id_1 1, :id_2 0, :name "Pidgey",     :song "Car alarms"}}
                   {:op "created", :table-id table-id, :row {:id_1 2, :id_2 0, :name "Spearow",    :song "Hold music"}}
                   {:op "created", :table-id table-id, :row {:id_1 3, :id_2 0, :name "Farfetch'd", :song "The land of lisp"}}}
                 (set
                  (:outputs
                   (action-v2.tu/create-rows! table-id [{:id_2 0 :name "Pidgey"     :song "Car alarms"}
                                                        {:id_2 0 :name "Spearow"    :song "Hold music"}
                                                        {:id_2 0 :name "Farfetch'd" :song "The land of lisp"}])))))

          (is (= [[1 0 "Pidgey" "Car alarms"]
                  [2 0 "Spearow" "Hold music"]
                  [3 0 "Farfetch'd" "The land of lisp"]]
                 (table-rows table-id))))

        (testing "PUT should update the relevant rows and columns"
          (is (= #{{:op "updated", :table-id table-id :row {:id_1 1, :id_2 0, :name "Pidgey",     :song "Join us now and share the software"}}
                   {:op "updated", :table-id table-id :row {:id_1 2, :id_2 0, :name "Speacolumn", :song "Hold music"}}}
                 (set
                  (:outputs
                   (action-v2.tu/update-rows! table-id [{:id_1 1, :id_2 0, :song "Join us now and share the software"}
                                                        {:id_1 2, :id_2 0, :name "Speacolumn"}])))))

          (is (= #{[1 0 "Pidgey" "Join us now and share the software"]
                   [2 0 "Speacolumn" "Hold music"]
                   [3 0 "Farfetch'd" "The land of lisp"]}
                 (set (table-rows table-id)))))

        (testing "PUT can also do bulk updates"
          (is (= #{{:op "updated", :table-id table-id, :row {:id_1 1, :id_2 0, :name "Pidgey",     :song "The Star-Spangled Banner"}}
                   {:op "updated", :table-id table-id, :row {:id_1 2, :id_2 0, :name "Speacolumn", :song "The Star-Spangled Banner"}}}
                 (set
                  (:outputs
                   (action-v2.tu/update-rows! table-id
                                              [{:id_1 1, :id_2 0}
                                               {:id_1 2, :id_2 0}]
                                              {:song "The Star-Spangled Banner"})))))

          (is (= #{[1 0 "Pidgey" "The Star-Spangled Banner"]
                   [2 0 "Speacolumn" "The Star-Spangled Banner"]
                   [3 0 "Farfetch'd" "The land of lisp"]}
                 (set (table-rows table-id)))))

        (testing "DELETE should remove the corresponding rows"
          (is (= #{{:op "deleted", :table-id table-id, :row {:id_1 1, :id_2 0}}
                   {:op "deleted", :table-id table-id, :row {:id_1 2, :id_2 0}}}
                 (set
                  (:outputs
                   (action-v2.tu/delete-rows! table-id [{:id_1 1, :id_2 0}
                                                        {:id_1 2, :id_2 0}])))))
          (is (= [[3 0 "Farfetch'd" "The land of lisp"]]
                 (table-rows table-id))))))))

(deftest simple-delete-with-children-test
  (binding [actions.tu/*actions-test-data-tables* #{"people" "products" "orders"}]
    (mt/with-premium-features #{actions-feature-flag}
      (action-v2.tu/with-temp-test-db!
        (let [body {:action "data-grid.row/delete"
                    :scope  {:table-id (mt/id :products)}
                    :inputs [{(mt/format-name :id) 1}
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
            (is (=? {:errors [{:index       0
                               :type        "metabase.actions.error/violate-foreign-key-constraint",
                               :message     "Other tables rely on this row so it cannot be deleted.",
                               :errors      {}
                               :status-code 400}
                              {:index       1,
                               :type        "metabase.actions.error/violate-foreign-key-constraint",
                               :message     "Other tables rely on this row so it cannot be deleted.",
                               :errors      {},
                               :status-code 400}]}
                    (mt/user-http-request :crowberto :post 400 execute-bulk-url
                                          body))))

          ;; TODO: an edge case we could handle in the future
          #_(testing "success with delete-children options"
              (is (=? {:outputs [{:table-id (mt/id :products) :op "deleted" :row {(keyword (mt/format-name :id)) 1}}
                                 {:table-id (mt/id :products) :op "deleted" :row {(keyword (mt/format-name :id)) 2}}]}
                      (mt/user-http-request :crowberto :post 200 execute-bulk-url
                                            (assoc body :params {:delete-children true}))))
              (is (empty? (children-count)))
              (testing "the change is not undoable"
                (is (= "Your previous change cannot be undone"
                       (mt/user-http-request :crowberto :post 405 execute-bulk-url
                                             {:action "data-editing/undo"
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

(deftest simple-delete-with-self-referential-children-test
  (mt/with-premium-features #{actions-feature-flag}
    (action-v2.tu/with-actions-temp-db self-referential-categories
      (let [body {:action "data-grid.row/delete"
                  :scope  {:table-id (mt/id :category)}
                  :inputs [{(mt/format-name :id) 1}]}
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
          (is (=? {:errors [{:index       0
                             :type        "metabase.actions.error/violate-foreign-key-constraint",
                             :message     "Other tables rely on this row so it cannot be deleted.",
                             :errors      {}
                             :status-code 400}]}
                  (mt/user-http-request :crowberto :post 400 execute-bulk-url body))))

        ;; TODO: same with the test above, this is one of the case where we want to handle in the future
        #_(testing "success with delete-children option should cascade delete all descendants"
            (is (=? {:outputs [{:table-id (mt/id :category)
                                :op       "deleted"
                                :row      {(keyword (mt/format-name :id)) 1}}]}
                    (mt/user-http-request :crowberto :post 200 execute-bulk-url
                                          (assoc body :params {:delete-children true}))))
            (is (= 0 (count (table-rows (mt/id :category)))))

            (testing "the change is not undoable for self-referential cascades"
              (is (= "Your previous change cannot be undone"
                     (mt/user-http-request :crowberto :post 405 execute-bulk-url
                                           {:action "data-editing/undo"
                                            :scope  {:table-id (mt/id :category)}
                                            :inputs []})))))))))

(mt/defdataset mutual-recursion-users-teams
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
(deftest mutual-recursion-delete-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/data-editing)
    (mt/with-premium-features #{actions-feature-flag}
      (action-v2.tu/with-actions-temp-db mutual-recursion-users-teams
        (jdbc/execute! (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
                       (sql.tx/add-fk-sql driver/*driver*
                                          mutual-recursion-users-teams
                                          {:table-name "user"}
                                          {:fk :team :field-name "team_id"})
                       {:transaction? false})
        (sync/sync-database! (mt/db))
        (let [users-table-id (mt/id :user)
              #_teams-table-id #_(mt/id :team)
              delete-user-body {:action "data-grid.row/delete"
                                :scope     {:table-id users-table-id}
                                :inputs    [{(mt/format-name :id) 1}]}]

          (testing "delete user involved in mutual recursion should return error without delete-children param"
            (is (=? {:errors [{:index       0
                               :type        "metabase.actions.error/violate-foreign-key-constraint",
                               :message     "Other tables rely on this row so it cannot be deleted.",
                               :errors      {}
                               :status-code 400}]}
                    (mt/user-http-request :crowberto :post 400 execute-bulk-url delete-user-body))))
          ;; TODO: same with the test above, this is one of the case where we want to handle in the future
          #_(testing "delete with delete-children should handle mutual recursion gracefully"
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
  (mt/with-premium-features #{actions-feature-flag}
    (mt/test-drivers (mt/normal-drivers-with-feature :actions/data-editing)
      (testing "40x returned if user/database not configured for editing"
        (let [test-endpoints (fn [flags status-code]
                               (action-v2.tu/with-test-tables! [table-id action-v2.tu/default-test-table]
                                 (let [actions-enabled (:a flags)
                                       editing-enabled (:d flags)
                                       superuser       (:s flags)
                                       settings        {:database-enable-table-editing (boolean editing-enabled)
                                                        :database-enable-actions       (boolean actions-enabled)}
                                       user            (if superuser :crowberto :rasta)]
                                   (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings settings}
                                     {:settings settings
                                      :user     user
                                      :responses {:create (action-v2.tu/create-rows! table-id user status-code [{:name "Pidgey" :song "Car alarms"}])
                                                  :update (action-v2.tu/update-rows! table-id user status-code [{:id 1 :song "Join us now and share the software"}])
                                                  :delete (action-v2.tu/delete-rows! table-id user status-code [{:id 1}])}}))))
              error-or-ok (fn [res]
                            (cond
                              (string? res)  res
                              (:message res) (:message res)
                              :else          :ok))
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
                  :let [[expected-msg expected-status-code] (if (sequential? expected) expected [expected 200])
                        {:keys [settings user responses]} (test-endpoints flags expected-status-code)]
                  [verb response] responses]
            (testing (format "%s user: %s, settings: %s" verb user settings)
              (is (= expected-msg (error-or-ok response))))))))))

(defn- check-coercion-fn-coverage
  ([test-cases]
   (check-coercion-fn-coverage #{} test-cases))
  ([exclusions test-cases]
   (let [covered-fns  (into #{} (keep second) test-cases)
         ;; Strip out Coercions defined in tests, e.g. clojure.types.core-test/Coerce-BigInteger-To-Instant
         expected-fns (into #{} (filter (comp #{"Coercion"} namespace)) (descendants :Coercion/*))
         [unknown missing] (data/diff covered-fns expected-fns)]
     (testing "There are no unnecessary transformations (or stale keywords)"
       (is (empty? unknown)))
     (testing "All expected coercion options are tested"
       (is (= exclusions missing))))
   test-cases))

(deftest coercion-test
  (mt/with-premium-features #{actions-feature-flag}
    (mt/test-drivers (mt/normal-drivers-with-feature :actions/data-editing)
      (let [always-lossy #{:Coercion/UNIXNanoSeconds->DateTime
                           :Coercion/UNIXMicroSeconds->DateTime
                           :Coercion/ISO8601->Date
                           :Coercion/ISO8601->Time}
            driver-lossy (case driver/*driver*
                           :postgres #{:Coercion/UNIXMilliSeconds->DateTime}
                           #{})
            lossy? (set/union always-lossy driver-lossy)
            do-test (fn [t coercion-strategy input expected]
                      (testing (str t " " coercion-strategy " " input)
                        (action-v2.tu/with-test-tables! [table-id [{:id 'auto-inc-type
                                                                    :o  [t :null]}
                                                                   {:primary-key [:id]}]]
                          (let [table-name-kw (t2/select-one-fn (comp keyword :name) [:model/Table :name] table-id)
                                field-id      (t2/select-one-fn :id [:model/Field :id] :table_id table-id :name "o")
                                driver        driver/*driver*
                                get-qp-state  (fn [] (map #(zipmap [:id :o] %) (table-rows table-id)))
                                get-db-state  (fn [] (sql-jdbc/query driver (mt/id) {:select [:*] :from [table-name-kw]}))]
                            (t2/update! :model/Field field-id {:coercion_strategy coercion-strategy})
                            (testing "create"
                              (let [row                {:o input}
                                    {outputs :outputs} (action-v2.tu/create-rows! table-id [row])
                                    qp-state           (get-qp-state)
                                    _                  (is (= 1 (count outputs)))]
                                (when-not (lossy? coercion-strategy)
                                  (is (= qp-state (map :row outputs)) "we should return the same coerced output that table/$table-id/data would return")
                                  (is (= input (:o (first qp-state))) "the qp value should be the same as the input"))
                                (is (= expected (:o (first (get-db-state)))))))
                            (testing "update"
                              (let [[{id :id}]         (map :row (:outputs (action-v2.tu/create-rows! table-id [{:o nil}])))
                                    _ (is (some? id))
                                    {outputs :outputs} (action-v2.tu/update-rows! table-id [{:id id, :o input}])
                                    [qp-row] (filter (comp #{id} :id) (get-qp-state))]
                                (is (= 1 (count outputs)))
                                (is (some? qp-row))
                                (when-not (lossy? coercion-strategy)
                                  (is (= [qp-row] (map :row outputs)))
                                  (is (= input (:o qp-row))))
                                (is (= expected (:o (first (get-db-state)))))))))))]

        ;;    type     coercion                                     input                          database
        (->> (concat
              [:text    nil                                          "a"                            "a"
               :text    :Coercion/YYYYMMDDHHMMSSString->Temporal     "2025-03-25T14:34:00Z"         "20250325143400"]
              ;; MySQL loses precision, so we relax the test for it.
              (if (not= :mysql driver/*driver*)
                [:text  :Coercion/ISO8601->DateTime                  "2025-03-25T14:34:42.314Z"     "2025-03-25T14:34:42.314Z"]
                [:text  :Coercion/ISO8601->DateTime                  "2025-03-25T14:34:42Z"         "2025-03-25T14:34:42Z"])
              [:text    :Coercion/ISO8601->Date                      "2025-03-25T00:00:00Z"         "2025-03-25"
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
               #_#_#_#_:text :Coercion/YYYYMMDDHHMMSSString->Temporal     "2025-03-25T14:34:42Z"     "20250325143442"])
             (partition 4)
             (check-coercion-fn-coverage @#'coerce/unimplemented-coercion-functions)
             (run! #(apply do-test %)))))))

(deftest field-values-invalidated-test
  (mt/with-premium-features #{actions-feature-flag}
    (mt/test-drivers (mt/normal-drivers-with-feature :actions/data-editing)
      (action-v2.tu/with-test-tables! [table-id [{:id 'auto-inc-type, :n [:text]} {:primary-key [:id]}]]
        (let [field-id         (t2/select-one-fn :id :model/Field :table_id table-id :name "n")
              _                (t2/update! :model/Field {:id field-id} {:semantic_type "type/Category"})
              field-values     #(vec (:values (field-values/get-latest-full-field-values field-id)))
              test-queue       (ArrayBlockingQueue. 100)
              create!          #(action-v2.tu/create-rows! table-id %)
              update!          #(action-v2.tu/update-rows! table-id %)
              process-queue!   (fn []
                                 (when-let [field-ids (.poll test-queue)]
                                   (#'data-editing/batch-invalidate-field-values! [field-ids])
                                   (recur)))]
          (binding [data-editing/*field-value-invalidate-queue* test-queue]
            (is (= [] (field-values)))

            (create! [{:n "a"}])
            (is (pos? (.size test-queue)))
            (process-queue!)
            (is (= ["a"] (field-values)))

            (create! [{:n "b"} {:n "c"}])
            (is (pos? (.size test-queue)))
            (process-queue!)
            (is (= ["a" "b" "c"] (field-values)))

            (update! [{:id 2, :n "d"}])
            (is (pos? (.size test-queue)))
            (process-queue!)
            (is (= ["a" "c" "d"] (field-values)))

            (create! [{:n "a"}])
            (is (zero? (.size test-queue)))
            (process-queue!)
            (update! [{:id 1, :n "e"}])
            (is (pos? (.size test-queue)))
            (process-queue!)
            (is (= ["a" "c" "d" "e"] (field-values)))))))))

(deftest execute-form-built-in-table-action-test
  (mt/with-premium-features #{actions-feature-flag}
    (mt/test-drivers (mt/normal-drivers-with-feature :actions/data-editing)
      (testing "Data editing not enabled on database"
        (action-v2.tu/with-test-tables! [table-id [{:id        [:int]
                                                    :text      [:text]}
                                                   {:primary-key [:id]}]]
          (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {:database-enable-table-editing false}}
            (testing "execute-form should return 400 error when data editing is not enabled"
              (is (= {:message "Data editing is not enabled."}
                     (select-keys
                      (mt/user-http-request :crowberto :post 400 execute-form-url
                                            {:scope  {:table-id table-id}
                                             :action "data-grid.row/create"})
                      [:message])))))))

      (testing "Non auto-incrementing pk"
        (action-v2.tu/with-test-tables! [table-id [(ordered-map
                                                    :id        [:int]
                                                    :text      [:text]
                                                    :int       [:int]
                                                    :bool      [:boolean]
                                                    :float_val [:float]
                                                    :timestamp [:timestamp]
                                                    :date      [:date]
                                                    :time_val  [:time]
                                                    :inactive  [:text])
                                                   {:primary-key [:id]}]]
          ;; This inactive field should not show up
          (t2/update! :model/Field {:table_id table-id, :name "inactive"} {:active false})
          (testing "table actions"
            (let [create-id           "data-grid.row/create"
                  update-id           "data-grid.row/update"
                  delete-id           "data-grid.row/delete"
                  scope               {:table-id table-id}]

              (testing "create"
                (is (=? {:parameters [{:id "id"        :display_name "ID"         :input_type "dropdown" :optional false :readonly false}
                                      {:id "text"      :display_name "Text"       :input_type "text"     :optional true  :readonly false}
                                      {:id "int"       :display_name "Int"        :input_type "integer"  :optional true  :readonly false}
                                      {:id "bool"      :display_name "Bool"       :input_type "boolean"  :optional true  :readonly false}
                                      {:id "float_val" :display_name "Float Val"  :input_type "float"    :optional true  :readonly false}
                                      {:id "timestamp" :display_name "Timestamp"  :input_type "datetime" :optional true  :readonly false}
                                      {:id "date"      :display_name "Date"       :input_type "date"     :optional true  :readonly false}
                                      {:id "time_val"  :display_name "Time Val"   :input_type "time"     :optional true  :readonly false}]}
                        (mt/user-http-request :crowberto :post 200 execute-form-url
                                              {:scope     scope
                                               :action create-id}))))

              (testing "update"
                (is (=? {:parameters [{:id "id"        :display_name "ID"         :input_type "dropdown" :optional false :readonly true}
                                      {:id "text"      :display_name "Text"       :input_type "text"     :optional true  :readonly false}
                                      {:id "int"       :display_name "Int"        :input_type "integer"  :optional true  :readonly false}
                                      {:id "bool"      :display_name "Bool"       :input_type "boolean"  :optional true  :readonly false}
                                      {:id "float_val" :display_name "Float Val"  :input_type "float"    :optional true  :readonly false}
                                      {:id "timestamp" :display_name "Timestamp"  :input_type "datetime" :optional true  :readonly false}
                                      {:id "date"      :display_name "Date"       :input_type "date"     :optional true  :readonly false}
                                      {:id "time_val"  :display_name "Time Val"   :input_type "time"     :optional true  :readonly false}]}
                        (mt/user-http-request :crowberto :post 200 execute-form-url
                                              {:scope     scope
                                               :action update-id}))))

              (testing "delete"
                (is (=? {:parameters [{:id "id" :display_name "ID" :input_type "dropdown" :optional false :readonly true}]}
                        (mt/user-http-request :crowberto :post 200 execute-form-url
                                              {:scope     scope
                                               :action delete-id}))))))))

      (testing "Auto incrementing pk"
        (action-v2.tu/with-test-tables! [table-id [(ordered-map
                                                    :id        'auto-inc-type
                                                    :text      [:text]
                                                    :int       [:int]
                                                    :bool      [:boolean]
                                                    :float_val [:float]
                                                    :timestamp [:timestamp]
                                                    :date      [:date]
                                                    :time_val  [:time]
                                                    :inactive  [:text])
                                                   {:primary-key [:id]}]]
          ;; This inactive field should not show up
          (t2/update! :model/Field {:table_id table-id, :name "inactive"} {:active false})
          (testing "table actions"
            (let [create-id           "data-grid.row/create"
                  update-id           "data-grid.row/update"
                  delete-id           "data-grid.row/delete"
                  scope               {:table-id table-id}]

              (testing "create"
                (is (=? {:parameters [{:id "text"      :display_name "Text"       :input_type "text",     :optional true, :readonly false}
                                      {:id "int"       :display_name "Int"        :input_type "integer",  :optional true, :readonly false}
                                      {:id "bool"      :display_name "Bool"       :input_type "boolean",  :optional true, :readonly false}
                                      {:id "float_val" :display_name "Float Val"  :input_type "float",    :optional true, :readonly false}
                                      {:id "timestamp" :display_name "Timestamp"  :input_type "datetime", :optional true, :readonly false}
                                      {:id "date"      :display_name "Date"       :input_type "date",     :optional true, :readonly false}
                                      {:id "time_val"  :display_name "Time Val"   :input_type "time",     :optional true, :readonly false}]}
                        (mt/user-http-request :crowberto :post 200 execute-form-url
                                              {:scope     scope
                                               :action create-id}))))

              (testing "update"
                (is (=? {:parameters [{:id "id"        :display_name "ID"         :input_type "dropdown", :optional false, :readonly true}
                                      {:id "text"      :display_name "Text"       :input_type "text",     :optional true, :readonly false}
                                      {:id "int"       :display_name "Int"        :input_type "integer",  :optional true, :readonly false}
                                      {:id "bool"      :display_name "Bool"       :input_type "boolean",  :optional true, :readonly false}
                                      {:id "float_val" :display_name "Float Val"  :input_type "float",    :optional true, :readonly false}
                                      {:id "timestamp" :display_name "Timestamp"  :input_type "datetime", :optional true, :readonly false}
                                      {:id "date"      :display_name "Date"       :input_type "date",     :optional true, :readonly false}
                                      {:id "time_val"  :display_name "Time Val"   :input_type "time",     :optional true, :readonly false}]}
                        (mt/user-http-request :crowberto :post 200 execute-form-url
                                              {:scope     scope
                                               :action update-id}))))

              (testing "delete"
                (is (=? {:parameters [{:id "id" :display_name "ID" :input_type "dropdown", :optional false, :readonly true}]}
                        (mt/user-http-request :crowberto :post 200 execute-form-url
                                              {:scope     scope
                                               :action delete-id})))))))))))

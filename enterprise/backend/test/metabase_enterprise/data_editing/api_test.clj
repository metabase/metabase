(ns ^:mb/driver-tests metabase-enterprise.data-editing.api-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase-enterprise.data-editing.api :as data-editing.api]
   [metabase-enterprise.data-editing.test-util :as data-editing.tu]
   [metabase.actions.models :as actions]
   [metabase.actions.test-util :as actions.tu]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc :as sql-jdbc]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- table-rows [table-id]
  (mt/rows
   (qp/process-query
    {:database (mt/id)
     :type     :query
     :query    {:source-table table-id}})))

(defn- table-url [table-id]
  (format "ee/data-editing/table/%d" table-id))

(def ^:private execute-v2-url "ee/data-editing/action/v2/execute-bulk")

(use-fixtures :each
  (fn [f]
    (mt/with-dynamic-fn-redefs [data-editing.api/require-authz? (constantly true)]
      (f)))
  #'data-editing.tu/restore-db-settings-fixture)

(deftest feature-flag-required-test
  (mt/with-premium-features #{}
    (let [url (data-editing.tu/table-url 1)]
      (mt/assert-has-premium-feature-error "Editing Table Data" (mt/user-http-request :crowberto :post 402 url))
      (mt/assert-has-premium-feature-error "Editing Table Data" (mt/user-http-request :crowberto :put 402 url))
      (mt/assert-has-premium-feature-error "Editing Table Data" (mt/user-http-request :crowberto :post 402 (str url "/delete"))))))

(deftest table-operations-test
  (mt/with-premium-features #{:table-data-editing}
    (mt/test-drivers #{:h2 :postgres}
      (with-open [table-ref (data-editing.tu/open-test-table!)]
        (let [table-id @table-ref
              url      (data-editing.tu/table-url table-id)]
          (data-editing.tu/toggle-data-editing-enabled! true)
          (testing "Initially the table is empty"
            (is (= [] (table-rows table-id))))

          (testing "POST should insert new rows"
            (is (= {:created-rows [{:id 1 :name "Pidgey" :song "Car alarms"}
                                   {:id 2 :name "Spearow" :song "Hold music"}
                                   {:id 3 :name "Farfetch'd" :song "The land of lisp"}]}
                   (mt/user-http-request :crowberto :post 200 url
                                         {:rows [{:name "Pidgey" :song "Car alarms"}
                                                 {:name "Spearow" :song "Hold music"}
                                                 {:name "Farfetch'd" :song "The land of lisp"}]})))

            (is (= [[1 "Pidgey" "Car alarms"]
                    [2 "Spearow" "Hold music"]
                    [3 "Farfetch'd" "The land of lisp"]]
                   (table-rows table-id))))

          (testing "PUT should update the relevant rows and columns"
            (is (= #{{:id 1, :name "Pidgey", :song "Join us now and share the software"}
                     {:id 2, :name "Speacolumn", :song "Hold music"}}
                   (set
                    (:updated
                     (mt/user-http-request :crowberto :put 200 url
                                           {:rows [{:id 1 :song "Join us now and share the software"}
                                                   {:id 2 :name "Speacolumn"}]})))))

            (is (= #{[1 "Pidgey" "Join us now and share the software"]
                     [2 "Speacolumn" "Hold music"]
                     [3 "Farfetch'd" "The land of lisp"]}
                   (set (table-rows table-id)))))

          (testing "PUT can also do bulk updates"
            (is (= #{{:id 1, :name "Pidgey",     :song "The Star-Spangled Banner"}
                     {:id 2, :name "Speacolumn", :song "The Star-Spangled Banner"}}
                   (set
                    (:updated
                     (mt/user-http-request :crowberto :put 200 url
                                           {:pks     [{:id 1}
                                                      {:id 2}]
                                            :updates {:song "The Star-Spangled Banner"}}))))

                (is (= #{[1 "Pidgey" "The Star-Spangled Banner"]
                         [2 "Speacolumn" "The Star-Spangled Banner"]
                         [3 "Farfetch'd" "The land of lisp"]}
                       (set (table-rows table-id))))))

          (testing "DELETE should remove the corresponding rows"
            (is (= {:success true}
                   ;; TODO change what we return to be more useful, for example it can contain children in the same
                   ;;      table.
                   #_[{:id 1} {:id 2}]
                   (mt/user-http-request :crowberto :post 200 (str url "/delete")
                                         {:rows [{:id 1}
                                                 {:id 2}]})))
            (is (= [[3 "Farfetch'd" "The land of lisp"]]
                   (table-rows table-id)))))))))

(deftest table-operations-via-action-execute-test
  (mt/with-premium-features #{:table-data-editing}
    (mt/test-drivers #{:h2 :postgres}
      (with-open [table-ref (data-editing.tu/open-test-table!)]
        (let [table-id @table-ref
              url      "ee/data-editing/action/v2/execute-bulk"]
          (data-editing.tu/toggle-data-editing-enabled! true)
          (testing "Initially the table is empty"
            (is (= [] (table-rows table-id))))

          (testing "POST should insert new rows"
            (is (= #{{:op "created", :table-id table-id, :row {:id 1, :name "Pidgey", :song "Car alarms"}}
                     {:op "created", :table-id table-id, :row {:id 2, :name "Spearow", :song "Hold music"}}
                     {:op "created", :table-id table-id, :row {:id 3, :name "Farfetch'd", :song "The land of lisp"}}}
                   (set
                    (:outputs
                     (mt/user-http-request :crowberto :post 200 url
                                           {:action_id "data-grid.row/create"
                                            :scope     {:table-id table-id}
                                            :inputs    [{:name "Pidgey" :song "Car alarms"}
                                                        {:name "Spearow" :song "Hold music"}
                                                        {:name "Farfetch'd" :song "The land of lisp"}]})))))

            (is (= [[1 "Pidgey" "Car alarms"]
                    [2 "Spearow" "Hold music"]
                    [3 "Farfetch'd" "The land of lisp"]]
                   (table-rows table-id))))

          (testing "PUT should update the relevant rows and columns"
            (is (= #{{:op "updated", :table-id table-id :row {:id 1, :name "Pidgey",     :song "Join us now and share the software"}}
                     {:op "updated", :table-id table-id :row {:id 2, :name "Speacolumn", :song "Hold music"}}}
                   (set
                    (:outputs
                     (mt/user-http-request :crowberto :post 200 url
                                           {:action_id "data-grid.row/update"
                                            :scope     {:table-id table-id}
                                            :inputs    [{:id 1 :song "Join us now and share the software"}
                                                        {:id 2 :name "Speacolumn"}]}))))

                (is (= #{[1 "Pidgey" "Join us now and share the software"]
                         [2 "Speacolumn" "Hold music"]
                         [3 "Farfetch'd" "The land of lisp"]}
                       (set (table-rows table-id))))))

          ;; Leaning against not adding this action.
          #_(testing "PUT can also do bulk updates"
              (is (= #{{:id 1, :name "Pidgey",     :song "The Star-Spangled Banner"}
                       {:id 2, :name "Speacolumn", :song "The Star-Spangled Banner"}}
                     (set
                      (:updated
                       (mt/user-http-request :crowberto :put 200 url
                                             {:pks     [{:id 1}
                                                        {:id 2}]
                                              :updates {:song "The Star-Spangled Banner"}}))))

                  (is (= #{[1 "Pidgey" "The Star-Spangled Banner"]
                           [2 "Speacolumn" "The Star-Spangled Banner"]
                           [3 "Farfetch'd" "The land of lisp"]}
                         (set (table-rows table-id))))))

          (testing "DELETE should remove the corresponding rows"
            (is (= #{{:op "deleted", :table-id table-id, :row {:id 1}}
                     {:op "deleted", :table-id table-id, :row {:id 2}}}
                   (set
                    (:outputs
                     (mt/user-http-request :crowberto :post 200 url
                                           {:action_id "data-grid.row/delete"
                                            :scope     {:table-id table-id}
                                            :inputs    [{:id 1}
                                                        {:id 2}]})))))
            (is (= [[3 "Farfetch'd" "The land of lisp"]]
                   (table-rows table-id)))))))))

(deftest simple-delete-with-children-test
  (binding [actions.tu/*actions-test-data-tables* #{"people" "products" "orders"}]
    (mt/with-premium-features #{:table-data-editing}
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
                    (mt/user-http-request :crowberto :post 400 execute-v2-url
                                          body))))

          (testing "sucess with delete-children options"
            (is (=? {:outputs [{:table-id (mt/id :products) :op "deleted" :row {(keyword (mt/format-name :id)) 1}}
                               {:table-id (mt/id :products) :op "deleted" :row {(keyword (mt/format-name :id)) 2}}]}
                    (mt/user-http-request :crowberto :post 200 execute-v2-url
                                          (assoc body :params {:delete-children true}))))
            (is (empty? (children-count)))
            (testing "the change is not undoable"
              (is (= "Your previous change cannot be undone"
                     (mt/user-http-request :crowberto :post 405 execute-v2-url
                                           {:action_id "data-editing/undo"
                                            :scope     {:table-id (mt/id :products)}
                                            :inputs    []}))))))))))

(deftest editing-allowed-test
  (mt/with-premium-features #{:table-data-editing}
    (mt/test-drivers #{:h2 :postgres}
      (testing "40x returned if user/database not configured for editing"
        (let [test-endpoints
              (fn [flags]
                (with-open [table-ref (data-editing.tu/open-test-table!)]
                  (let [actions-enabled (:a flags)
                        editing-enabled (:d flags)
                        superuser       (:s flags)
                        url             (data-editing.tu/table-url @table-ref)
                        settings        {:database-enable-table-editing (boolean editing-enabled)
                                         :database-enable-actions       (boolean actions-enabled)}
                        _               (data-editing.tu/alter-db-settings! merge settings)
                        user            (if superuser :crowberto :rasta)
                        req             mt/user-http-request-full-response

                        post-response
                        (req user :post url {:rows [{:name "Pidgey" :song "Car alarms"}]})

                        put-response
                        (req user :put url {:rows [{:id 1 :song "Join us now and share the software"}]})

                        del-response
                        (req user :post (str url "/delete") {:rows [{:id 1}]})]
                    {:settings settings
                     :user     user
                     :responses {:create post-response
                                 :update put-response
                                 :delete del-response}})))

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

(deftest create-table-test
  (mt/with-premium-features #{:table-data-editing}
    (mt/test-drivers #{:h2 :postgres}
      (let [run-example
            (fn [flags req-body]
              (let [{table-name-prefix :name} req-body
                    table-name      (str table-name-prefix "_" (System/currentTimeMillis))
                    req-body'       (u/update-if-exists req-body :name (constantly table-name))
                    db-id           (mt/id)
                    driver          driver/*driver*
                    editing-enabled (:d flags)
                    superuser       (:s flags)
                    _               (data-editing.tu/toggle-data-editing-enabled! editing-enabled)
                    user            (if superuser :crowberto :rasta)
                    url             (format "ee/data-editing/database/%d/table" db-id)
                    res             (delay (mt/user-http-request-full-response user :post url req-body'))
                    cleanup!        #(try (driver/drop-table! driver db-id table-name) (catch Exception _))
                    describe-table
                    (fn []
                      (-> (driver/describe-table driver (t2/select-one :model/Database db-id) {:name table-name})
                          (update :name   {table-name table-name-prefix})
                          (update :fields #(sort-by :name (for [f %] (select-keys f [:name :base-type :pk?]))))))]
                (try
                  (if (<= 200 (:status @res) 299)
                    (merge
                     {:status 200}
                     (describe-table))
                    (:status @res))
                  (finally
                    (cleanup!)))))]

        (are [flags req-body expected]
             (= expected (run-example flags req-body))

          #{:s :d}
          {}
          400

          #{:s :d}
          {:name "a"}
          400

          #{:s :d}
          {:name "a"
           :columns [[{:name "id", :type "int"}]]}
          400

          #{:s :d}
          {:name "a"
           :columns [{:name "id", :type "int"}
                     {:name "name", :type "int"}]
           :primary_key ["id"]}
           ;; =>
          {:status 200
           :name "a"
           :fields [{:name "id"
                     :base-type :type/BigInteger
                     :pk? true}
                    {:name "name"
                     :base-type :type/BigInteger}]}

          #{:s :d}
          {:name "a"
           :columns [{:name "id", :type "not-a-type"}]
           :primary_key ["id"]}
         ;; =>
          400

         ;; escaped quotes are not allowed for now
          #{:s :d}
          {:name "a\""
           :columns [{:name "id", :type "int"}]
           :primary_key ["id"]}
          400
          #{:s :d}
          {:name "a`"
           :columns [{:name "id", :type "int"}]
           :primary_key ["id"]}
          400

         ;; underscores, dashes, spaces allowed
          #{:s :d}
          {:name "a_b1 -"
           :columns [{:name "id", :type "int"}]
           :primary_key ["id"]}
         ;; =>
          {:status 200
           :name "a_b1 -"
           :fields [{:name "id"
                     :base-type :type/BigInteger
                     :pk? true}]}

         ;; if not admin, denied
          #{:d}
          {:name        "a"
           :columns     [{:name "id", :type "int"}]
           :primary_key ["id"]}
          403

         ;; data editing disabled, denied
          #{:s}
          {:name        "a"
           :columns     [{:name "id", :type "int"}]
           :primary_key ["id"]}
          400

          ;; compound pk
          #{:s :d}
          {:name "a"
           :columns [{:name "id_p1", :type "int"}
                     {:name "id_p2", :type "int"}]
           :primary_key ["id_p1" "id_p2"]}
          ;; =>
          {:status 200
           :name "a"
           :fields [{:name "id_p1"
                     :base-type :type/BigInteger
                     :pk? true}
                    {:name "id_p2"
                     :base-type :type/BigInteger
                     :pk? true}]})))))

(deftest create-table-auto-inc-test
  (mt/with-premium-features #{:table-data-editing}
    (mt/test-drivers #{:h2 :postgres}
      (data-editing.tu/toggle-data-editing-enabled! true)
      (let [db-id      (mt/id)
            url        (format "ee/data-editing/database/%d/table" db-id)
            user       :crowberto
            table-name (str "test_table_" (System/currentTimeMillis))
            req-body   {:name table-name
                        :columns [{:name "id", :type "auto_incrementing_int_pk"}
                                  {:name "n",  :type "int"}]
                        :primary_key ["id"]}]

        (try
          (let [_          (mt/user-http-request user :post 200 url req-body)
                db         (t2/select-one :model/Database db-id)
                table-id   (data-editing.tu/sync-new-table! db table-name)
                create!    #(mt/user-http-request user :post 200 (table-url table-id) {:rows %})]
            (create! [{:n 1} {:n 2}])
            (is (= [[1 1] [2 2]] (table-rows table-id))))
          (finally
            (driver/drop-table! driver/*driver* (mt/id) table-name)
            (t2/delete! :model/Table :name table-name)))))))

(deftest coercion-test
  (mt/with-premium-features #{:table-data-editing}
    (mt/test-drivers #{:h2 :postgres}
      (data-editing.tu/toggle-data-editing-enabled! true)
      (let [user :crowberto
            req mt/user-http-request
            create!
            #(req user :post (data-editing.tu/table-url %1) {:rows %2})

            update!
            #(req user :put (data-editing.tu/table-url %1) {:rows %2})

            always-lossy
            #{:Coercion/UNIXNanoSeconds->DateTime
              :Coercion/UNIXMicroSeconds->DateTime
              :Coercion/ISO8601->Date
              :Coercion/ISO8601->Time}

            driver-lossy
            (case driver/*driver*
              :postgres #{:Coercion/UNIXMilliSeconds->DateTime}
              #{})

            lossy? (set/union always-lossy driver-lossy)

            do-test
            (fn [t coercion-strategy input expected]
              (testing (str t " " coercion-strategy " " input)
                (with-open [table (data-editing.tu/open-test-table!
                                   {:id 'auto-inc-type
                                    :o  [t :null]}
                                   {:primary-key [:id]})]
                  (let [table-id      @table
                        table-name-kw (t2/select-one-fn (comp keyword :name) [:model/Table :name] table-id)
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

(deftest webhook-creation-test
  (mt/with-premium-features #{:table-data-editing}
    (mt/test-drivers #{:h2 :postgres}
      (with-open [test-table (data-editing.tu/open-test-table!)]
        (let [url            "ee/data-editing/webhook"
              req            #(mt/user-http-request-full-response %1 :post url %2)
              status         (comp :status req)
              table-id       @test-table
              not-a-table-id Long/MAX_VALUE]
          (testing "auth fail"
            (is (= 403 (status :rasta {})))
            (is (= 403 (status :rasta {:table-id table-id})) "no information leakage"))
          (testing "creates token"
            (let [token (:token (:body (req :crowberto {:table-id table-id})))]
              (is (string? token))
              (testing "token in database"
                (is (some? (t2/select-one :table_webhook_token :token token))))
              (testing "new token if called again"
                (is (not= token (:token (req :crowberto {:table-id table-id}))))
                (testing "table does not exist"
                  (is (= 404 (status :crowberto {:table-id not-a-table-id}))))))))))))

(deftest webhook-list-test
  (mt/with-premium-features #{:table-data-editing}
    (mt/test-drivers #{:h2 :postgres}
      (with-open [test-table1 (data-editing.tu/open-test-table!)
                  test-table2 (data-editing.tu/open-test-table!)]
        (let [url            "ee/data-editing/webhook"
              req            #(mt/user-http-request-full-response %1 :get url :table-id %2)
              create-url     "ee/data-editing/webhook"
              create         #(:body (mt/user-http-request-full-response :crowberto :post create-url {:table-id %}))
              status         (comp :status req)
              table-id1      @test-table1
              table-id2      @test-table2
              not-a-table-id Long/MAX_VALUE]
          (testing "auth fail"
            (is (= 403 (status :rasta table-id1)))
            (is (= 403 (status :rasta not-a-table-id)) "no information leakage"))
          (testing "table does not exist"
            (is (= 404 (status :crowberto not-a-table-id))))
          (testing "no tokens"
            (is (= [] (:tokens (:body (req :crowberto table-id1))))))
          (testing "n tokens"
            (let [{token1 :token} (create table-id1)
                  {token2 :token} (create table-id2)
                  {token3 :token} (create table-id1)
                  table1-res      (:body (req :crowberto table-id1))
                  table2-res      (:body (req :crowberto table-id2))
                  table1-tokens   (map :token (:tokens table1-res))
                  table2-tokens   (map :token (:tokens table2-res))]
              (is (= {token1 1 token3 1} (frequencies table1-tokens)))
              (is (= [token2] table2-tokens)))))))))

(deftest webhook-delete-test
  (mt/with-premium-features #{:table-data-editing}
    (mt/test-drivers #{:h2 :postgres}
      (with-open [test-table (data-editing.tu/open-test-table!)]
        (let [url            #(format "ee/data-editing/webhook/%s" %)
              req            #(mt/user-http-request-full-response %1 :delete (url %2) {})
              create-url     "ee/data-editing/webhook"
              create         #(:body (mt/user-http-request-full-response :crowberto :post create-url {:table-id %}))
              list-url       "ee/data-editing/webhook"
              list-tokens    #(:body (mt/user-http-request-full-response :crowberto :get list-url :table-id %))
              status         (comp :status req)
              table-id       @test-table
              {token :token} (create table-id)
              not-a-token    (str (random-uuid))]
          (testing "auth fail"
            (is (= 403 (status :rasta token)))
            (is (= 403 (status :rasta not-a-token)) "no information leakage"))
          (testing "token does not exist"
            (is (= 404 (status :crowberto not-a-token))))
          (testing "token does exist"
            (is (some #{token} (map :token (:tokens (list-tokens table-id)))))
            (is (= 200 (status :crowberto token)))
            (is (not-any? #{token} (map :token (:tokens (list-tokens table-id))))))
          (testing "token does not exist when deleted"
            (is (= 404 (status :crowberto token)))))))))

(deftest webhook-ingest-test
  (mt/with-premium-features #{:table-data-editing}
    (mt/test-drivers #{:h2 :postgres}
      (data-editing.tu/toggle-data-editing-enabled! true)
      (with-open [test-table (data-editing.tu/open-test-table!
                              {:id [:int]
                               :v [:text]}
                              {:primary-key [:id]})]
        (let [url            #(format "ee/data-editing-public/webhook/%s/data" %)
              req            #(mt/client-full-response
                               :post (url %1)
                               {:request-options {:body (.getBytes (json/encode %2))}})
              status         (comp :status req)
              result         (comp
                              (fn [req]
                                (is (= 200 (:status req)))
                                (:body req))
                              req)
              create-url     "ee/data-editing/webhook"
              create         #(:body (mt/user-http-request-full-response :crowberto :post create-url {:table-id %}))
              delete-url     #(format "ee/data-editing/webhook/%s" %)
              delete         #(mt/user-http-request :crowberto :delete (delete-url %))
              table-id       @test-table
              {token :token} (create table-id)
              not-a-token    (str (random-uuid))]
          (testing "token does not exist"
            (is (= 404 (status not-a-token [{:v "foo"}]))))
          (testing "empty rows"
            (are [input code]
                 (= code (status token input))
              nil  400
              {}   400
              []   400
              [{}] 400))
          (testing "one row in array"
            (is (= {:created 1} (result token [{:id 1, :v "a"}])))
            (is (= [[1 "a"]] (table-rows table-id))))
          (testing "multiple rows in array"
            (is (= {:created 2} (result token [{:id 2, :v "b"} {:id 3, :v "c"}])))
            (is (= [[1 "a"] [2 "b"] [3 "c"]] (table-rows table-id))))
          (testing "missing pk"
            (is (= 400 (status token [{:v "d"}]))))
          (testing "insert collision"
            (is (= 400 (status token [{:id 1, :v "a"}])))
            (testing "partial failure"
              (let [rows-before (table-rows table-id)]
                (is (= 400 (status token [{:id 4, :v "d"} {:id 1, :v "a"}])))
                (is (= rows-before (table-rows table-id))))))
          (testing "wrong columns"
            (is (= 400 (status token [{:id 1, :not_a_column "a"}]))))
          (testing "data editing disabled"
            (try
              (data-editing.tu/toggle-data-editing-enabled! false)
              (is (= 400 (status token [{:id 4, :v "d"}])))
              (data-editing.tu/toggle-data-editing-enabled! true)
              (is (= {:created 1} (result token [{:id 4, :v "d"}])))
              (finally
                (data-editing.tu/toggle-data-editing-enabled! true))))
          (testing "token deleted"
            (delete token)
            (is (= 404 (status token [{:id 5, :v "e"}])))))))))
          ;; It would be nice to have for-all config/inputs type tests verifying
          ;; insert behaviour is same as the POST data-editing/table inserts (collision, violation error, event)

(deftest field-values-invalidated-test
  (mt/with-premium-features #{:table-data-editing}
    (mt/test-drivers #{:h2 :postgres}
      (data-editing.tu/toggle-data-editing-enabled! true)
      (with-open [table (data-editing.tu/open-test-table! {:id 'auto-inc-type, :n [:text]} {:primary-key [:id]})]
        (let [table-id     @table
              url          (data-editing.tu/table-url table-id)
              field-id     (t2/select-one-fn :id :model/Field :table_id table-id :name "n")
              _            (t2/update! :model/Field {:id field-id} {:semantic_type "type/Category"})
              field-values #(vec (:values (field-values/get-latest-full-field-values field-id)))
              create!      #(mt/user-http-request :crowberto :post 200 url {:rows %})
              update!      #(mt/user-http-request :crowberto :put  200 url {:rows %})
              expect-field-values
              (fn [expect] ; redundantly pass expect get ok-ish assert errors (preserve last val)
                (let [last-res (volatile! nil)]
                  (or (u/poll {:thunk (fn [] (vreset! last-res (field-values)))
                               :done? #(= expect %)
                               :timeout-ms 1000
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

(deftest unified-execute-not-found-test
  (let [url "ee/data-editing/action/v2/execute"
        req #(mt/user-http-request-full-response (:user % :crowberto) :post url
                                                 (merge {:scope {:unknown :legacy-action} :input {}}
                                                        (dissoc % :user-id)))]
    (mt/with-premium-features #{:table-data-editing}
      (mt/test-drivers #{:h2 :postgres}
        (data-editing.tu/toggle-data-editing-enabled! true)
        (mt/with-actions-enabled
          (testing "no dashcard"
            (is (= 404 (:status (req {:action_id "dashcard:999999:1"
                                      :scope     {:dashcard-id 999999}
                                      :input     {}})))))
          (testing "no action"
            (mt/with-temp [:model/Dashboard     dash {}
                           :model/DashboardCard dashcard {:dashboard_id (:id dash)}]
              (is (= 404 (:status (req {:action_id 999999
                                        :scope     {:dashcard-id (:id dashcard)}
                                        :input     {}}))))
              (testing "no dashcard still results in 404"
                (is (= 404 (:status (req {:action_id 999999, :input {}}))))))))))))

(deftest unified-execute-test
  (let [url "ee/data-editing/action/v2/execute"
        req #(mt/user-http-request-full-response (:user % :crowberto) :post url
                                                 (merge {:scope {:unknown :legacy-action} :input {}}
                                                        (dissoc % :user-id)))]
    (mt/with-premium-features #{:table-data-editing}
      (mt/test-drivers #{:h2 :postgres}
        (data-editing.tu/toggle-data-editing-enabled! true)
        (mt/with-actions-enabled
          (mt/with-non-admin-groups-no-root-collection-perms
            (with-open [test-table (data-editing.tu/open-test-table! {:id 'auto-inc-type
                                                                      :name [:text]
                                                                      :status [:text]}
                                                                     {:primary-key [:id]})]
              (mt/with-temp [:model/Card          model    {:type           :model
                                                            :table_id       @test-table
                                                            :database_id    (mt/id)
                                                            :dataset_query  {:database (mt/id)
                                                                             :type :query
                                                                             :query {:source-table @test-table}}}
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
                                                            {:table-id
                                                             @test-table
                                                             :editableTable.enabledActions
                                                             (let [param-maps
                                                                   ;; we might need to change these to use field ids
                                                                   [{:parameterId "name", :sourceType "row-data", :sourceValueTarget "name"}]]
                                                               [{:id                "dashcard:unknown:abcdef"
                                                                 :actionId          (:id action)
                                                                 :actionType        "data-grid/row-action"
                                                                 :parameterMappings param-maps
                                                                 :enabled           true}
                                                                {:id                "dashcard:unknown:fedcba"
                                                                 :actionId          "table.row/update"
                                                                 :actionType        "data-grid/row-action"
                                                                 :mapping           {:table-id @test-table
                                                                                     :row      "::root"}
                                                                 :parameterMappings param-maps
                                                                 :enabled           true}
                                                                {:id                "dashcard:unknown:xyzabc"
                                                                 :actionId          (#'actions/encoded-action-id :table.row/update @test-table)
                                                                 :actionType        "data-grid/row-action"
                                                                 :parameterMappings param-maps
                                                                 :enabled           true}])}}]
                (testing "no access to the model"
                  (is (= 403 (:status (req {:user      :rasta
                                            :action_id (:id action)
                                            :scope     {:dashcard-id (:id dashcard)}
                                            :input     {:id 1}
                                            :params    {:status "approved"}})))))
                (testing "non-row action modifying a row"
                  (testing "underlying row does not exist, action not executed"
                    (is (= 400 (:status (req {:action_id (:id action)
                                              :scope     {:dashcard-id (:id dashcard)}
                                              :input     {:id 1}
                                              :params    {:status "approved"}})))))
                  (testing "underlying row exists, action executed"
                    (mt/user-http-request :crowberto :post 200 (data-editing.tu/table-url @test-table)
                                          {:rows [{:name "Widgets", :status "waiting"}]})
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
                      (mt/user-http-request :crowberto :post 200 (data-editing.tu/table-url @test-table)
                                            {:rows [{:name "Sprockets", :status "waiting"}]})
                      (is (= {:status 200
                              :body   {:outputs [{:rows-updated 1}]}}
                             (-> (req {:action_id action-id
                                       :scope     {:dashcard-id (:id dashcard)}
                                       :input     {:id 2}
                                       :params    {:status "approved"}})
                                 (select-keys [:status :body])))))))
                (testing "dashcard row action modifying a row - primitive action"
                  (let [action-id "dashcard:unknown:fedcba"]
                    (testing "underlying row does not exist, action not executed"
                      (is (= 404 (:status (req {:action_id action-id
                                                :scope     {:dashcard-id (:id dashcard)}
                                                :input     {:id 3}
                                                :params    {:status "approved"}})))))
                    (testing "underlying row exists, action executed"
                      (mt/user-http-request :crowberto :post 200 (data-editing.tu/table-url @test-table)
                                            {:rows [{:name "Braai tongs", :status "waiting"}]})
                      (is (= {:status 200
                              :body   {:outputs [{:table-id @test-table
                                                  :op       "updated"
                                                  :row      {:id 3, :name "Braai tongs", :status "approved"}}]}}
                             (-> (req {:action_id action-id
                                       :scope     {:dashcard-id (:id dashcard)}
                                       :input     {:id 3}
                                       :params    {:status "approved"}})
                                 (select-keys [:status :body])))))))
                (testing "dashcard row action modifying a row - encoded action"
                  (let [action-id "dashcard:unknown:xyzabc"]
                    (testing "underlying row does not exist, action not executed"
                      (is (= 404 (:status (req {:action_id action-id
                                                :scope     {:dashcard-id (:id dashcard)}
                                                :input     {:id 4
                                                            :status "approved"}
                                                #_#_:params    {:status "approved"}})))))
                    (testing "underlying row exists, action executed"
                      (mt/user-http-request :crowberto :post 200 (data-editing.tu/table-url @test-table)
                                            {:rows [{:name "Salad spinners", :status "waiting"}]})
                      (is (= {:status 200
                              :body   {:outputs [{:table-id @test-table
                                                  :op       "updated"
                                                  :row      {:id 4, :name "Salad spinners", :status "approved"}}]}}
                             (-> (req {:action_id action-id
                                       :scope     {:dashcard-id (:id dashcard)}
                                       :input     {:id 4}
                                       :params    {:status "approved"}})
                                 (select-keys [:status :body])))))))))))))))

(deftest unified-execute-server-side-mapping-test
  (let [url "ee/data-editing/action/v2/execute"
        req #(mt/user-http-request-full-response (:user % :crowberto) :post url
                                                 (merge {:scope {:unknown :legacy-action} :input {}}
                                                        (dissoc % :user-id)))]
    (mt/with-premium-features #{:table-data-editing}
      (mt/test-drivers #{:h2 :postgres}
        (data-editing.tu/toggle-data-editing-enabled! true)
        (mt/with-actions-enabled
          (mt/with-non-admin-groups-no-root-collection-perms
            (with-open [table-1-ref (data-editing.tu/open-test-table!
                                     {:id  'auto-inc-type
                                      :col [:text]}
                                     {:primary-key [:id]})
                        table-2-ref (data-editing.tu/open-test-table!
                                     {:id 'auto-inc-type
                                      :a  [:text]
                                      :b  [:text]
                                      :c  [:text]
                                      :d  [:text]}
                                     {:primary-key [:id]})]
              (mt/with-temp [:model/Card          model    {:type           :model
                                                            :table_id       @table-1-ref
                                                            :database_id    (mt/id)
                                                            :dataset_query  {:database (mt/id)
                                                                             :type :query
                                                                             :query {:source-table @table-1-ref}}}
                             :model/Dashboard     dash     {}
                             :model/DashboardCard dashcard {:dashboard_id   (:id dash)
                                                            :card_id        (:id model)
                                                            :visualization_settings
                                                            {:table-id @table-1-ref
                                                             :editableTable.enabledActions
                                                             [{:id         "dashcard:unknown:my-row-action"
                                                               :actionId   "table.row/create"
                                                               :actionType "data-grid/row-action"
                                                               :mapping    {:table-id @table-2-ref
                                                                            :row      {:a ["::key" "aa"]
                                                                                       :b ["::key" "bb"]
                                                                                       :c ["::key" "cc"]
                                                                                       :d ["::key" "dd"]}}
                                                               :parameterMappings
                                                               (let [field-id (t2/select-one-pk :model/Field :table_id @table-1-ref :name "col")]
                                                                 [{:parameterId "aa", :sourceType "row-data", :sourceValueTarget field-id}
                                                                  {:parameterId "bb", :sourceType "ask-user"}
                                                                  {:parameterId "cc", :sourceType "ask-user", :value "default"}
                                                                  {:parameterId "dd", :sourceType "constant", :value "hard-coded"}])
                                                               :enabled    true}]}}]
                (testing "dashcard row action modifying a row - primitive action"
                  (let [action-id "dashcard:unknown:my-row-action"]
                    (testing "underlying row does not exist, action not executed"
                      (is (= 404 (:status (req {:action_id action-id
                                                :scope     {:dashcard-id (:id dashcard)}
                                                :input     {:id 1}
                                                :params    {:status "approved"}})))))
                    (testing "underlying row exists, action executed\n"
                      (mt/user-http-request :crowberto :post 200 (data-editing.tu/table-url @table-1-ref)
                                            {:rows [{:col "database-value"}]})
                      (let [base-req {:action_id action-id
                                      :scope     {:dashcard-id (:id dashcard)}
                                      :input     {:id 1, :col "stale-value"}
                                      :params    {:bb nil}}]
                        ;; TODO don't have a way to make params required for non-legacy actions yet, d'oh
                        ;;      oh well, let nil spill through
                        (testing "missing required param"
                          (is (= {:status 200
                                  :body {:outputs [{:table-id @table-2-ref
                                                    :op       "created"
                                                    :row      {:id 1
                                                               :a  "database-value"
                                                               :b  nil
                                                               :c  "default"
                                                               :d  "hard-coded"}}]}}
                                 #_{:status 500
                                    :body "sad"}
                                 (-> (req base-req)
                                     (select-keys [:status :body])))))
                        (testing "missing optional param"
                          (is (= {:status 200
                                  :body   {:outputs [{:table-id @table-2-ref
                                                      :op       "created"
                                                      :row      {:id 2
                                                                 :a  "database-value"
                                                                 :b  "necessary"
                                                                 :c  "default"
                                                                 :d  "hard-coded"}}]}}
                                 (-> (req (assoc-in base-req [:params :bb] "necessary"))
                                     (select-keys [:status :body])))))
                        (testing "null optional param"
                          (is (= {:status 200
                                  :body   {:outputs [{:table-id @table-2-ref
                                                      :op       "created"
                                                      :row      {:id 3
                                                                 :a  "database-value"
                                                                 :b  "necessary"
                                                                 :c  nil
                                                                 :d  "hard-coded"}}]}}
                                 (-> (req (-> base-req
                                              (assoc-in [:params :bb] "necessary")
                                              (assoc-in [:params :cc] nil)))
                                     (select-keys [:status :body])))))
                        (testing "provided optional param"
                          (is (= {:status 200
                                  :body   {:outputs [{:table-id @table-2-ref
                                                      :op       "created"
                                                      :row      {:id 4
                                                                 :a  "database-value"
                                                                 :b  "necessary"
                                                                 :c  "optional"
                                                                 :d  "hard-coded"}}]}}
                                 (-> (req (-> base-req
                                              (assoc-in [:params :bb] "necessary")
                                              (assoc-in [:params :cc] "optional")))
                                     (select-keys [:status :body])))))))))))))))))

(deftest list-and-add-to-dashcard-test
  (let [list-req #(mt/user-http-request-full-response
                   (:user % :crowberto)
                   :get
                   "ee/data-editing/tmp-action")]
    (mt/with-premium-features #{:table-data-editing}
      (mt/test-drivers #{:h2 :postgres}
        (data-editing.tu/toggle-data-editing-enabled! true)
        (with-open [test-table (data-editing.tu/open-test-table! {:id 'auto-inc-type
                                                                  :text      [:text]
                                                                  :int       [:int]
                                                                  :timestamp [:timestamp]
                                                                  :date      [:date]}
                                                                 {:primary-key [:id]})]
          (let [{:keys [status body]}
                (list-req {})
                all-actions   (:actions body)
                table-actions (filter #(= @test-table (:table_id %)) all-actions)]
            (is (= 200 status))
            (testing "table actions have neg ids"
              (is (every? neg? (map :id table-actions))))
            (testing "one action for each crud op"
              (is (= {"table.row/create" 1
                      "table.row/update" 1
                      "table.row/delete" 1}
                     (frequencies (map :kind table-actions)))))
            (mt/with-temp [:model/Dashboard dash {}]
              (let [{create-action "table.row/create"
                     update-action "table.row/update"
                     delete-action "table.row/delete"}
                    (u/index-by :kind table-actions)
                    dashboard-url (str "dashboard/" (:id dash))
                    card-input (fn [id action]
                                 {:id id
                                  :size_x 1
                                  :size_y 1
                                  :row 0
                                  :col 0
                                  :action_id (:id action)})
                    {:keys [dashcards]}
                    (mt/user-http-request
                     :crowberto
                     :put
                     dashboard-url
                     {:dashcards [(card-input -1 create-action)
                                  (card-input -2 update-action)
                                  (card-input -3 delete-action)]})

                    exec-url #(str dashboard-url "/dashcard/" (:id %) "/execute")

                    prefill-values
                    #(mt/user-http-request
                      :crowberto
                      :get
                      (exec-url %1)
                      :parameters (json/encode %2))

                    execute!
                    #(mt/user-http-request
                      :crowberto
                      :post
                      (exec-url %1)
                      {:parameters %2})

                    {create-card "table.row/create"
                     update-card "table.row/update"
                     delete-card "table.row/delete"}
                    (u/index-by (comp :kind :action) dashcards)]

                (testing "create"
                  (testing "prefill does not crash"
                    (is (= {} (prefill-values create-card {}))))
                  (execute! create-card
                            {:text      "hello, world!"
                             :int       42
                             :timestamp "2025-05-12 14:32:16"
                             :date      "2025-05-12"})
                  (execute! create-card
                            {:text      "seeya, world!"})
                  (is (= [[1 "hello, world!" 42 "2025-05-12T14:32:16Z" "2025-05-12T00:00:00Z"]
                          [2 "seeya, world!" nil nil                   nil]]
                         (->> (table-rows @test-table)
                              (sort-by first)))))

                (testing "update"
                  (testing "prefill does not crash"
                    (is (= {} (prefill-values update-card {})))
                    (is (= {} (prefill-values update-card {:id 1}))))
                  (execute! update-card
                            {:id 1
                             :int 43})
                  (is (= [[1 "hello, world!" 43 "2025-05-12T14:32:16Z" "2025-05-12T00:00:00Z"]
                          [2 "seeya, world!" nil nil                   nil]]
                         (->> (table-rows @test-table)
                              (sort-by first)))))

                (testing "delete"
                  (testing "prefill does not crash"
                    (is (= {} (prefill-values delete-card {})))
                    (is (= {} (prefill-values delete-card {:id 2}))))
                  (execute! delete-card {:id 2})
                  (is (= [[1 "hello, world!" 43 "2025-05-12T14:32:16Z" "2025-05-12T00:00:00Z"]]
                         (->> (table-rows @test-table)
                              (sort-by first)))))))))))))

(deftest tmp-modal-saved-action-test
  (let [req
        #(mt/user-http-request-full-response
          (:user % :crowberto)
          :post
          "ee/data-editing/tmp-modal"
          (select-keys % [:action_id
                          :scope
                          :input]))]
    (mt/with-premium-features #{:table-data-editing}
      (mt/test-drivers #{:h2 :postgres}
        (data-editing.tu/toggle-data-editing-enabled! true)
        (testing "saved actions"
          (mt/with-non-admin-groups-no-root-collection-perms
            (mt/with-temp [:model/Table         table    {}
                           :model/Card          model    {:type         :model
                                                          :table_id     (:id table)}
                           :model/Action        action   {:type         :query
                                                          :name "Do cool thing"
                                                          :model_id     (:id model)
                                                          :parameters   [{:id "a"
                                                                          :name "A"
                                                                          :type "number/="}
                                                                         {:id "b"
                                                                          :name "B"
                                                                          :type "date/single"}
                                                                         {:id "c"
                                                                          :name "C"
                                                                          :type "string/="}
                                                                         {:id "d"
                                                                          :name "D"
                                                                          :type "string/="}]}]
              (let [{:keys [status, body]} (req {:scope {:model-id (:id model)
                                                         :table-id (:id table)}
                                                 :action_id (:id action)})]
                (is (= 200 status))
                (is (= "Do cool thing" (:title body)))
                (is (= [{:id "a"
                         :display_name "A"
                         :type "type/Number"}
                        {:id "b"
                         :display_name "B"
                         :type "type/Date"}
                        {:id "c"
                         :display_name "C"
                         :type "type/Text"}
                        {:id "d"
                         :display_name "D"
                         :type "type/Text"}]
                       (->> (:parameters body)
                            (map #(select-keys % [:id :display_name :type])))))))))))))

(deftest tmp-modal-table-action-test
  (let [list-req
        #(mt/user-http-request-full-response
          (:user % :crowberto)
          :get
          "ee/data-editing/tmp-action")
        req
        #(mt/user-http-request-full-response
          (:user % :crowberto)
          :post
          "ee/data-editing/tmp-modal"
          (select-keys % [:action_id
                          :scope
                          :input]))]
    (mt/with-premium-features #{:table-data-editing}
      (mt/test-drivers #{:h2 :postgres}
        (data-editing.tu/toggle-data-editing-enabled! true)
        (with-open [test-table (data-editing.tu/open-test-table! {:id 'auto-inc-type
                                                                  :text      [:text]
                                                                  :int       [:int]
                                                                  :timestamp [:timestamp]
                                                                  :date      [:date]}
                                                                 {:primary-key [:id]})]

          (testing "table actions"
            (let [{list-body :body} (list-req {})
                  {create-id "table.row/create"
                   update-id "table.row/update"
                   delete-id "table.row/delete"}
                  (->> (:actions list-body)
                       (filter #(= @test-table (:table_id %)))
                       (u/index-by :kind :id))]
              (testing "create"
                (let [scope {:table-id @test-table}
                      {:keys [status body]} (req {:scope scope
                                                  :action_id create-id})]
                  (is (= 200 status))
                  (is (= [{:id "text"
                           :display_name "Text"
                           :type "type/Text"}
                          {:id "int"
                           :display_name "Int"
                           :type "type/Integer"}
                          {:id "timestamp"
                           :display_name "Timestamp"
                           :type "type/DateTime"}
                          {:id "date"
                           :display_name "Date"
                           :type "type/Date"}]
                         (->> (:parameters body)
                              (map #(select-keys % [:id :display_name :type])))))))
              (testing "update"
                (let [scope {:table-id @test-table}
                      {:keys [status body]} (req {:scope scope
                                                  :action_id update-id})]
                  (is (= 200 status))
                  (is (= [{:id "id"
                           :display_name "ID"
                           :type "type/BigInteger"}
                          {:id "text"
                           :display_name "Text"
                           :type "type/Text"}
                          {:id "int"
                           :display_name "Int"
                           :type "type/Integer"}
                          {:id "timestamp"
                           :display_name "Timestamp"
                           :type "type/DateTime"}
                          {:id "date"
                           :display_name "Date"
                           :type "type/Date"}]
                         (->> (:parameters body)
                              (map #(select-keys % [:id :display_name :type])))))))
              (testing "delete"
                (let [scope {:table-id @test-table}
                      {:keys [status body]} (req {:scope scope
                                                  :action_id delete-id})]
                  (is (= 200 status))
                  (is (= [{:id "id"
                           :display_name "ID"
                           :type "type/BigInteger"}]
                         (->> (:parameters body)
                              (map #(select-keys % [:id :display_name :type])))))))))

          (mt/with-temp
            [:model/Dashboard dashboard
             {}
             :model/DashboardCard dashcard
             {:dashboard_id (:id dashboard)
              :visualization_settings
              {:table_id @test-table
               :editableTable.enabledActions
               [{:id "table.row/create"
                 :parameterMappings [{:parameterId "int"
                                      :sourceType  "const"
                                      :value       42}
                                     {:parameterId "text"
                                      :sourceType  "row-data"
                                      :sourceValueTarget "text"
                                      :visibility  "readonly"}
                                     {:parameterId "timestamp"
                                      :visibility  "hidden"}]}]}}]

            ;; insert a row for the row action
            (mt/user-http-request :crowberto :post 200
                                  (data-editing.tu/table-url @test-table)
                                  {:rows [{:text "a very important string"}]})

            (testing "table actions on a dashcard"
              (let [create-id "table.row/create"
                    update-id "table.row/update"
                    delete-id "table.row/delete"]

                (testing "without a table-id"
                  (let [scope {:dashboard-id (:dashboard_id dashcard)}]
                    (doseq [action-id [create-id update-id delete-id]]
                      (testing action-id
                        (is (=? {:status 400} (req {:action_id action-id, :scope scope})))))))

                (testing "using a partially constructed :input"
                  (let [unrelated-table Long/MAX_VALUE
                        scope           {:table-id unrelated-table}
                        input           {:table-id @test-table}]
                    (testing "create"
                      (is (=? {:status 200
                               :body   {:parameters
                                        (if (:dashcard-id scope)
                                          [{:id "text" :readonly true :value "a very important string"}
                                           {:id "int" :readonly false}
                                           ;; note that timestamp is now hidden
                                           {:id "date" :readonly false}]
                                          [{:id "text" :readonly false}
                                           {:id "int" :readonly false}
                                           {:id "timestamp" :readonly false}
                                           {:id "date" :readonly false}])}}
                              (req {:action_id create-id
                                    :scope     scope
                                    :input     (assoc input :id 1)}))))
                    (testing "update"
                      (is (=? {:status 200} (req {:action_id update-id, :scope scope, :input input}))))
                    (testing "delete"
                      (is (=? {:status 200} (req {:action_id update-id, :scope scope, :input input}))))))

                ;; magic scope detection, deprecated
                (doseq [[testing-msg scope] [["table scope" {:table-id @test-table}]
                                             ["dashcard scope" {:dashcard-id (:id dashcard)}]]]
                  (testing testing-msg
                    (testing "create"
                      (is (=? {:status 200
                               :body   {:parameters
                                        (if (:dashcard-id scope)
                                          [{:id "text" :readonly true :value "a very important string"}
                                           {:id "int" :readonly false}
                                           ;; note that timestamp is now hidden
                                           {:id "date" :readonly false}]
                                          [{:id "text" :readonly false}
                                           {:id "int" :readonly false}
                                           {:id "timestamp" :readonly false}
                                           {:id "date" :readonly false}])}}
                              (req {:scope     scope
                                    :action_id create-id
                                    :input     {:id 1}}))))

                    (testing "update"
                      (is (=? {:status 200} (req {:scope scope, :action_id update-id}))))

                    (testing "delete"
                      (is (=? {:status 200} (req {:scope scope, :action_id delete-id}))))))))))))))

;; Taken from metabase-enterprise.data-editing.api-test.
;; When we deprecate that API, we should move all the sibling tests here as well.
(deftest dashcard-implicit-action-execution-insert-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions)
    (mt/with-premium-features #{:table-data-editing}
      (mt/with-actions-test-data-and-actions-enabled
        (testing "Executing dashcard insert"
          (mt/with-actions [{:keys [action-id model-id]} {:type :implicit :kind "row/create"}]
            (mt/with-temp [:model/Dashboard     {dashboard-id :id} {}
                           :model/DashboardCard {dashcard-id :id}  {:dashboard_id dashboard-id
                                                                    :card_id      model-id
                                                                    :action_id    action-id}]
              (let [execute-path "/ee/data-editing/action/v2/execute"
                    body         {:action_id (str "dashcard:" dashcard-id)
                                  :scope     {:dashboard-id dashboard-id}
                                  :input     {"name" "Birds"}}
                    new-row      (-> (mt/user-http-request :crowberto :post 200 execute-path body)
                                     :outputs
                                     first
                                     :created-row
                                     (update-keys (comp keyword u/lower-case-en name)))]
                (testing "Should be able to insert"
                  (is (pos? (:id new-row)))
                  (is (partial= {:name "Birds"}
                                new-row)))
                (testing "Extra parameter should fail gracefully"
                  (is (partial= {:message "No destination parameter found for #{\"extra\"}. Found: #{\"name\"}"}
                                (mt/user-http-request :crowberto :post 400 execute-path
                                                      (assoc-in body [:input :extra] 1)))))
                (testing "Missing other parameters should fail gracefully"
                  (is (partial= "Implicit parameters must be provided."
                                (mt/user-http-request :crowberto :post 400 execute-path
                                                      (assoc body :input {})))))))))))))

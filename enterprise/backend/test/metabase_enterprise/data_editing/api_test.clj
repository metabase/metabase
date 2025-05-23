(ns metabase-enterprise.data-editing.api-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase-enterprise.data-editing.api :as data-editing.api]
   [metabase-enterprise.data-editing.test-util :as data-editing.tu]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc :as sql-jdbc]
   [metabase.models.field-values :as field-values]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.json :as json]
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

(use-fixtures :each
  (fn [f]
    (mt/with-dynamic-fn-redefs [data-editing.api/require-authz? (constantly true)]
      (f))))

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
                        _               (data-editing.tu/alter-appdb-settings! merge settings)
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
                        :primary_key ["id"]}
            _          (mt/user-http-request user :post 200 url req-body)
            db         (t2/select-one :model/Database db-id)
            table-id   (data-editing.tu/sync-new-table! db table-name)
            create!    #(mt/user-http-request user :post 200 (table-url table-id) {:rows %})]
        (create! [{:n 1} {:n 2}])
        (is (= [[1 1] [2 2]] (table-rows table-id)))))))

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
              update!      #(mt/user-http-request :crowberto :put  200 url {:rows %})]
          (is (= [] (field-values)))
          (create! [{:n "a"}])
          ;; It's async
          (Thread/sleep 10)
          (is (= ["a"] (field-values)))
          (create! [{:n "b"} {:n "c"}])
          ;; It's async
          (Thread/sleep 10)
          (is (= ["a" "b" "c"] (field-values)))
          (update! [{:id 2, :n "d"}])
          ;; It's async
          (Thread/sleep 10)
          (is (= ["a" "c" "d"] (field-values)))
          (create! [{:n "a"}])
          (update! [{:id 1, :n "e"}])
          ;; It's async
          (Thread/sleep 10)
          (is (= ["a" "c" "d" "e"] (field-values))))))))

(deftest get-row-action-test
  (let [url #(format "ee/data-editing/row-action/%s" %)
        action-api #(mt/user-http-request :crowberto :get 200 (format "action/%s" %))]
    (mt/with-premium-features #{:table-data-editing}
      (mt/test-drivers #{:h2 :postgres}
        (testing "no dashcard"
          (mt/with-temp [:model/Card   model  {:type     :model}
                         :model/Action action {:type     :query
                                               :name     "test_action"
                                               :model_id (:id model)}]
            (testing "not specified"
              (is (= 400 (:status (mt/user-http-request-full-response :crowberto :get (url (:id action)))))))
            (testing "specified but does not exist"
              (is (= 404 (:status (mt/user-http-request-full-response :crowberto :get (url (:id action)) :dashcard-id 9999999)))))))
        (testing "no action"
          (mt/with-temp [:model/Dashboard     dash     {}
                         :model/DashboardCard dashcard {:dashboard_id (:id dash)}]
            (is (= 404 (:status (mt/user-http-request-full-response :crowberto :get (url 99999999) :dashcard-id (:id dashcard)))))
            (testing "no dashcard still results in 400"
              (is (= 400 (:status (mt/user-http-request-full-response :crowberto :get (url 9999999))))))))
        (testing "everything exists, no params defined"
          (mt/with-non-admin-groups-no-root-collection-perms
            (mt/with-temp [:model/Table         table    {}
                           :model/Card          model    {:type         :model
                                                          :table_id     (:id table)}
                           :model/Action        action   {:type         :query
                                                          :name         "test_action"
                                                          :model_id     (:id model)}
                           :model/Dashboard     dash     {}
                           :model/DashboardCard dashcard {:dashboard_id (:id dash)
                                                          :card_id      (:id model)}]
              (testing "no access"
                (is (= 403 (:status (mt/user-http-request-full-response :rasta :get (url (:id action)) :dashcard-id (:id dashcard))))))
              (testing "action access"
                (is (= {:status 200
                        :body (action-api (:id action))}
                       (-> (mt/user-http-request-full-response :crowberto :get (url (:id action)) :dashcard-id (:id dashcard))
                           (select-keys [:status
                                         :body]))))))))
        (testing "parameters defined"
          (mt/with-non-admin-groups-no-root-collection-perms
            (mt/with-temp [:model/Table         table    {}
                           :model/Field         _a       {:table_id     (:id table)
                                                          :name         "a"}
                           :model/Field         _b       {:table_id     (:id table)
                                                          :name         "b"}
                           :model/Field         _c       {:table_id     (:id table)
                                                          :name         "c"}
                           :model/Card          model    {:type         :model
                                                          :table_id     (:id table)}
                           :model/Action        action   {:type         :query
                                                          :name         "test_action"
                                                          :model_id     (:id model)
                                                          :parameters   [{:slug "a"}
                                                                         {:slug "e"}
                                                                         {:slug "c"}
                                                                         {:slug "d"}]}
                           :model/Dashboard     dash     {}
                           :model/DashboardCard dashcard {:dashboard_id (:id dash)
                                                          :card_id      (:id model)}]
              (let [{:keys [status, body]} (mt/user-http-request-full-response :crowberto :get (url (:id action)) :dashcard-id (:id dashcard))]
                (is (= 200 status))
                (is (= ["e" "d"]
                       (->> body
                            :parameters
                            (map :slug))))))))))))

(deftest row-action-execute-test
  (let [url #(format "ee/data-editing/row-action/%s/execute" %)
        req #(apply mt/user-http-request-full-response
                    (:user %)
                    :post
                    (url (:action-id %))
                    (:body %)
                    (mapcat identity (:query-params %)))]
    (mt/with-premium-features #{:table-data-editing}
      (mt/test-drivers #{:h2 :postgres}
        (data-editing.tu/toggle-data-editing-enabled! true)
        (mt/with-actions-enabled
          (testing "no dashcard"
            (mt/with-temp [:model/Card   model  {:type     :model}
                           :model/Action action {:type     :query
                                                 :name     "test_action"
                                                 :model_id (:id model)}]
              (testing "not specified"
                (is (= 400 (:status (req {:user :crowberto, :action-id (:id action), :body {:pk {}, :params {}}})))))
              (testing "specified but does not exist"
                (is (= 404 (:status (req {:user         :crowberto
                                          :action-id    (:id action)
                                          :body         {:pk {}, :params {}}
                                          :query-params {:dashcard-id 999999}})))))))
          (testing "no action"
            (mt/with-temp [:model/Dashboard     dash     {}
                           :model/DashboardCard dashcard {:dashboard_id (:id dash)}]
              (is (= 404 (:status (req {:user         :crowberto
                                        :post         999999
                                        :body         {:pk {}, :params {}}
                                        :query-params {:dashcard-id (:id dashcard)}}))))
              (testing "no dashcard still results in 400"
                (is (= 400 (:status (req {:user :crowberto, :post 999999, :body {:pk {}, :params {}}})))))))
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
                                                            :card_id        (:id model)}]
                (testing "no access to the model"
                  (is (= 403 (:status (req {:user         :rasta
                                            :action-id    (:id action)
                                            :body         {:pk {:id 1}
                                                           :params {:status "approved"}}
                                            :query-params {:dashcard-id (:id dashcard)}})))))
                (testing "row does not exist, action not executed"
                  (is (= 404 (:status (req {:user         :crowberto
                                            :action-id    (:id action)
                                            :body         {:pk {:id 1}
                                                           :params {:status "approved"}}
                                            :query-params {:dashcard-id (:id dashcard)}})))))
                (testing "row exists, action executed"
                  (mt/user-http-request :crowberto :post 200 (data-editing.tu/table-url @test-table)
                                        {:rows [{:name "Widgets", :status "waiting"}]})
                  (is (= {:status 200
                          :body {:rows-updated 1}}
                         (-> (req {:user         :crowberto
                                   :action-id    (:id action)
                                   :body         {:pk {:id 1}
                                                  :params {:status "approved"}}
                                   :query-params {:dashcard-id (:id dashcard)}})
                             (select-keys [:status :body])))))))))))))

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

                    [create-card
                     update-card
                     delete-card]
                    dashcards]

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

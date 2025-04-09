(ns metabase-enterprise.data-editing.api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-editing.api]
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
    (mt/with-dynamic-fn-redefs [metabase-enterprise.data-editing.api/require-authz? (constantly true)]
      (f))))

(deftest feature-flag-required-test
  (mt/with-premium-features #{}
    (let [url (data-editing.tu/table-url 1)]
      (mt/assert-has-premium-feature-error "Editing Table Data" (mt/user-http-request :crowberto :post 402 url))
      (mt/assert-has-premium-feature-error "Editing Table Data" (mt/user-http-request :crowberto :put 402 url))
      (mt/assert-has-premium-feature-error "Editing Table Data" (mt/user-http-request :crowberto :post 402 (str url "/delete"))))))

(deftest table-operations-test
  (mt/with-premium-features #{:table-data-editing}
    (mt/with-empty-h2-app-db
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
            (is (= {:updated [{:id 1, :name "Pidgey", :song "Join us now and share the software"}
                              {:id 2, :name "Speacolumn", :song "Hold music"}]}
                   (mt/user-http-request :crowberto :put 200 url
                                         {:rows [{:id 1 :song "Join us now and share the software"}
                                                 {:id 2 :name "Speacolumn"}]})))

            (is (= [[1 "Pidgey" "Join us now and share the software"]
                    [2 "Speacolumn" "Hold music"]
                    [3 "Farfetch'd" "The land of lisp"]]
                   (table-rows table-id))))

          (testing "DELETE should remove the corresponding rows"
            (is (= {:success true}
                   (mt/user-http-request :crowberto :post 200 (str url "/delete")
                                         {:rows [{:id 1}
                                                 {:id 2}]})))
            (is (= [[3 "Farfetch'd" "The land of lisp"]]
                   (table-rows table-id)))))))))

(deftest editing-allowed-test
  (mt/with-premium-features #{:table-data-editing}
    (mt/with-empty-h2-app-db
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
                        _               (t2/update! :model/Database (mt/id) {:settings settings})
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
    (mt/with-empty-h2-app-db
      (let [run-example
            (fn [flags req-body]
              (let [{table-name-prefix :name} req-body
                    table-name      (str table-name-prefix "_" (System/currentTimeMillis))
                    req-body'       (u/update-if-exists req-body :name (constantly table-name))
                    driver          :h2
                    db-id           (mt/id)
                    editing-enabled (:d flags)
                    superuser       (:s flags)
                    settings        {:database-enable-table-editing (boolean editing-enabled)}
                    _               (t2/update! :model/Database (mt/id) {:settings settings})
                    user            (if superuser :crowberto :rasta)
                    url             (format "ee/data-editing/database/%d/table" db-id)
                    res             (delay (mt/user-http-request-full-response user :post url req-body'))
                    cleanup!        #(try (driver/drop-table! driver db-id table-name) (catch Exception _))
                    describe-table
                    (fn []
                      (-> (driver/describe-table driver (t2/select-one :model/Database db-id) {:name table-name})
                          (update :name   {table-name table-name-prefix})
                          (update :fields (partial mapv #(select-keys % [:name :base-type])))))]
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
           :columns [{:name "id", :type "int"}]
           :primary_key ["id"]}
          ;; =>
          {:status 200
           :name "a"
           :fields [{:name "id"
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
                     :base-type :type/BigInteger}]}

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
          400)))))

(deftest coercion-test
  (mt/with-premium-features #{:table-data-editing}
    (mt/with-empty-h2-app-db
      (data-editing.tu/toggle-data-editing-enabled! true)
      (let [user :crowberto
            req mt/user-http-request
            create!
            #(req user :post (data-editing.tu/table-url %1) {:rows %2})

            update!
            #(req user :put (data-editing.tu/table-url %1) {:rows %2})

            lossy?
            #{:Coercion/UNIXNanoSeconds->DateTime
              :Coercion/UNIXMicroSeconds->DateTime
              :Coercion/ISO8601->Date
              :Coercion/ISO8601->Time}

            do-test
            (fn [t coercion-strategy input expected]
              (testing (str t " " coercion-strategy " " input)
                (with-open [table (data-editing.tu/open-test-table!
                                   {:id 'auto-inc-type
                                    :o  [t :null]}
                                   {:primary-key [:id]})]
                  (let [table-id @table
                        table-name-kw (t2/select-one-fn (comp keyword :name) [:model/Table :name] table-id)
                        field-id (t2/select-one-fn :id [:model/Field :id] :table_id table-id :name "o")
                        get-qp-state (fn [] (map #(zipmap [:id :o] %) (table-rows table-id)))
                        get-db-state (fn [] (sql-jdbc/query :h2 (mt/id) {:select [:*] :from [table-name-kw]}))]
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
    (mt/with-empty-h2-app-db
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
    (mt/with-empty-h2-app-db
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
    (mt/with-empty-h2-app-db
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
    (mt/with-empty-h2-app-db
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
    (mt/with-empty-h2-app-db
      (data-editing.tu/toggle-data-editing-enabled! true)
      (with-open [table (data-editing.tu/open-test-table! {:id 'auto-inc-type, :n [:text]} {:primary-key [:id]})]
        (let [table-id     @table
              url          (data-editing.tu/table-url table-id)
              field-id     (t2/select-one-fn :id :model/Field :table_id table-id :name "n")
              field-values #(vec (:values (field-values/get-latest-full-field-values field-id)))
              create!      #(mt/user-http-request :crowberto :post 200 url {:rows %})
              update!      #(mt/user-http-request :crowberto :put  200 url {:rows %})]
          (is (= [] (field-values)))
          (create! [{:n "a"}])
          (is (= ["a"] (field-values)))
          (create! [{:n "b"} {:n "c"}])
          (is (= ["a" "b" "c"] (field-values)))
          (update! [{:id 2, :n "d"}])
          (is (= ["a" "c" "d"] (field-values)))
          (create! [{:n "a"}])
          (update! [{:id 1, :n "e"}])
          (is (= ["a" "c" "d" "e"] (field-values))))))))

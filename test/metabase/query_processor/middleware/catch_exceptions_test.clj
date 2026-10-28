(ns metabase.query-processor.middleware.catch-exceptions-test
  "There are additional tests in [[metabase.query-processor.failure-test]]."
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.query-processor.middleware.catch-exceptions-test]}}}}}}
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.catch-exceptions
    :as catch-exceptions]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.query-processor.test :as qp]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.util.log :as log])
  (:import
   (java.sql SQLException)))

(deftest ^:parallel exception-chain-test
  (testing "Should be able to get a sequence of exceptions by following causes, with the top-level Exception first"
    (let [e1 (ex-info "1" {:level 1})
          e2 (ex-info "2" {:level 2} e1)
          e3 (ex-info "3" {:level 3} e2)]
      (is (= [e1 e2 e3]
             (#'catch-exceptions/exception-chain e3))))))

(deftest ^:parallel exception-response-test
  (testing "Should nicely format a chain of exceptions, with the top-level Exception appearing first"
    (testing "lowest-level error `:type` should be pulled up to the top-level"
      (let [e1 (ex-info "1" {:level 1, :error-code "one"})
            e2 (ex-info "2" {:level 2, :type qp.error-type/qp :is-curated true} e1)
            e3 (ex-info "3" {:level 3, :error-code "three"} e2)]
        (is (= {:status     :failed
                :class      clojure.lang.ExceptionInfo
                :error      "1"
                :stacktrace true
                :error_type :qp
                :ex-data    {:error-code "one"}
                :via        [{:status        :failed
                              :class         clojure.lang.ExceptionInfo
                              :error         "2"
                              :stacktrace    true
                              :error_type    :qp
                              :error_is_curated true}
                             {:status     :failed
                              :class      clojure.lang.ExceptionInfo
                              :error      "3"
                              :stacktrace true
                              :ex-data    {:error-code "three"}}]}
               (-> (#'catch-exceptions/exception-response e3)
                   (update :stacktrace sequential?)
                   (update :via (fn [causes]
                                  (for [cause causes]
                                    (update cause :stacktrace sequential?))))))))))
  (testing "SQLExceptions that include stack traces should have them removed"
    (let [e1 (ex-info "mock databricks jdbc driver exception" {:level 1, :error-code "one"})
          e2 (SQLException. "mock sql exception\n\tat line1\n\tat line2\n\tat line3" ^Throwable e1)
          e3 (ex-info "mock exception" {:level 3, :error-code "three"} e2)]
      (is (= {:status     :failed
              :class      clojure.lang.ExceptionInfo
              :error      "mock sql exception"
              :stacktrace true
              :ex-data    {:error-code "one"}
              :via        [{:status        :failed
                            :class         java.sql.SQLException,
                            :error         "mock sql exception\n\tat line1\n\tat line2\n\tat line3",
                            :stacktrace    true
                            :state nil}
                           {:status     :failed
                            :class      clojure.lang.ExceptionInfo
                            :error      "mock exception"
                            :stacktrace true
                            :ex-data    {:error-code "three"}}]}
             (-> (#'catch-exceptions/exception-response e3)
                 (update :stacktrace sequential?)
                 (update :via (fn [causes]
                                (for [cause causes]
                                  (update cause :stacktrace sequential?))))))))))

(defn catch-exceptions
  ([run]
   (catch-exceptions run {}))

  ([run query]
   (let [query    (merge {:type :query, :database 1} query)
         metadata {}
         rows     []
         qp       (fn [query rff]
                    (run)
                    (binding [qp.pipeline/*execute* (fn [_driver _query respond]
                                                      (respond metadata rows))]
                      (qp.pipeline/*run* query rff)))
         qp       (catch-exceptions/catch-exceptions qp)
         result   (driver/with-driver :h2
                    (qp (qp/userland-query query) qp.reducible/default-rff))]
     (cond-> result
       (map? result) (update :data dissoc :rows)))))

(deftest ^:parallel no-exception-test
  (testing "No Exception -- should return response as-is"
    (is (= {:data {}, :row_count 0, :status :completed}
           (catch-exceptions (fn run []))))))

(deftest ^:synchronized no-exception-test-2
  (testing "compile and preprocess should not be called if no exception occurs"
    (let [compile-call-count (atom 0)
          preprocess-call-count (atom 0)]
      (mt/with-dynamic-fn-redefs [qp.compile/compile       (fn [_] (swap! compile-call-count inc))
                                  qp.preprocess/preprocess (fn [_] (swap! preprocess-call-count inc))]
        (is (= {:data {}, :row_count 0, :status :completed}
               (catch-exceptions (fn run []))))
        (is (= 0 @compile-call-count))
        (is (= 0 @preprocess-call-count))))))

(deftest ^:parallel sync-exception-test
  (testing "if the QP throws an Exception (synchronously), should format the response appropriately"
    (is (=? {:status     :failed
             :class      (partial = java.lang.Exception)
             :error      "Something went wrong"
             :stacktrace vector?
             :json_query {}
             :row_count  0
             :data       {:cols []}}
            (catch-exceptions (fn [] (throw (Exception. "Something went wrong"))))))))

(deftest ^:synchronized connection-pool-saturated-not-logged-test
  (testing "connection-pool saturation is transient load shedding: fail the query (503 for clients) but don't log an error"
    (doseq [error-type [qp.error-type/connection-pool-checkout-timeout
                        qp.error-type/connection-pool-checkout-queue-full]]
      (testing error-type
        (mt/with-log-messages-for-level [messages [metabase.query-processor.middleware.catch-exceptions :error]]
          (is (=? {:status     :failed
                   :error_type error-type
                   :error      "The pool is full"}
                  (catch-exceptions (fn [] (throw (ex-info "The pool is full" {:type error-type}))))))
          (is (empty? (messages)))))))
  (testing "control: other errors still log"
    (mt/with-log-messages-for-level [messages [metabase.query-processor.middleware.catch-exceptions :error]]
      (is (=? {:status :failed}
              (catch-exceptions (fn [] (throw (Exception. "Something went wrong"))))))
      (is (=? [{:level :error, :message #"(?s)^Error processing query.*"}]
              (messages))))))

(deftest ^:synchronized error-log-excludes-stack-trace-and-query-test
  (testing "the error log carries only the error message — no stack trace and nothing carrying the query/user data"
    (mt/with-log-messages-for-level [messages [metabase.query-processor.middleware.catch-exceptions :error]]
      (let [mp     (mt/metadata-provider)
            query  (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                       (lib/filter (lib/= (lib.metadata/field mp (mt/id :venues :name)) "hunter2-query")))
            result (catch-exceptions
                    (fn [] (throw (ex-info "boom" {:secret-in-ex-data "hunter2-ex-data"})))
                    query)]
        (is (=? [{:level :error, :message "Error processing query: boom"}]
                (messages)))
        (testing "the userland response has the detail, but not the server-side ex-data"
          (is (=? {:status     :failed
                   :error      "boom"
                   :stacktrace vector?
                   :json_query map?}
                  result))
          (is (not (contains? result :ex-data))))))))

(deftest ^:parallel response-ex-data-test
  (testing "the response carries only the client-facing ex-data: the keys `metabase.util.api-error` sends, and `:status-code`"
    (is (= {:status-code 400, :error-code "some-code", :field 1}
           (:ex-data (catch-exceptions
                      (fn [] (throw (ex-info "boom" {:status-code    400
                                                     :error-code     "some-code"
                                                     :field          1
                                                     :response/keys  #{:field}
                                                     :card-id        2
                                                     :field-name     "PASSWORD"
                                                     :log/keys       #{:field-name}}))))))))
  (testing "the ex-data of each exception in the chain is filtered"
    (let [result (catch-exceptions
                  (fn [] (throw (ex-info "outer" {:secret 1}
                                         (ex-info "inner" {:secret 2, :error-code "inner"})))))]
      (is (= {:error-code "inner"} (:ex-data result)))
      (is (= [nil] (map :ex-data (:via result)))))))

(deftest ^:synchronized dropped-ex-data-debug-log-test
  (with-redefs [config/is-dev? true]
    (testing "in dev mode, the ex-data entries left out of the response are logged at debug level, for debugging"
      (mt/with-log-messages-for-level [messages [metabase.query-processor.middleware.catch-exceptions :debug]]
        (catch-exceptions (fn [] (throw (ex-info "boom" {:status-code 400, :card-id 2}))))
        (is (=? [{:level :debug, :message #"(?s).*:card-id 2.*"}]
                (filter (comp #{:debug} :level) (messages))))
        (is (not (re-find #"status-code" (pr-str (messages)))))))
    (testing "nothing is logged when no entries are left out"
      (mt/with-log-messages-for-level [messages [metabase.query-processor.middleware.catch-exceptions :debug]]
        (catch-exceptions (fn [] (throw (ex-info "boom" {:status-code 400}))))
        (is (empty? (filter (comp #{:debug} :level) (messages)))))))
  (with-redefs [config/is-dev? false]
    (testing "outside dev mode, nothing is logged"
      (mt/with-log-messages-for-level [messages [metabase.query-processor.middleware.catch-exceptions :debug]]
        (catch-exceptions (fn [] (throw (ex-info "boom" {:status-code 400, :card-id 2}))))
        (is (empty? (filter (comp #{:debug} :level) (messages))))))))

(deftest ^:synchronized log-ex-data-test
  (testing "the ex-data keys listed under `:log/keys` go to the error log line's context, from anywhere in the chain, and not to the response"
    (let [contexts (atom [])]
      (mt/with-dynamic-fn-redefs [log/with-thread-context-fn (fn [context-map f]
                                                               (swap! contexts conj context-map)
                                                               (f))]
        (mt/with-log-messages-for-level [messages [metabase.query-processor.middleware.catch-exceptions :error]]
          (let [result (catch-exceptions
                        (fn [] (throw (ex-info "outer" {:card-id 2, :secret "hunter2", :log/keys #{:card-id}}
                                               (ex-info "inner" {:field-id   1
                                                                 :field-name "PASSWORD"
                                                                 :log/keys   #{:field-id :field-name}})))))]
            (is (=? [{:level :error, :message "Error processing query: inner"}]
                    (messages)))
            (is (contains? (set @contexts) {:card-id 2, :field-id 1, :field-name "PASSWORD"}))
            (is (not (re-find #"hunter2" (pr-str @contexts))))
            (is (not (re-find #"PASSWORD|field-id|card-id" (pr-str (dissoc result :stacktrace :via)))))
            (is (not-any? :ex-data (:via result))))))))
  (testing "a malformed `:log/keys` doesn't mask the original error"
    (mt/with-log-messages-for-level [messages [metabase.query-processor.middleware.catch-exceptions :error]]
      (is (=? {:status :failed, :error "boom"}
              (catch-exceptions (fn [] (throw (ex-info "boom" {:field-id 1, :log/keys :field-id}))))))
      (is (=? [{:level :error, :message "Error processing query: boom"}]
              (messages))))))

(deftest ^:parallel catch-exceptions-test
  (testing "include-query-execution-info-test"
    (testing "Should include info from QueryExecution if added to the thrown/raised Exception"
      (binding [qp.pipeline/*run* (fn [_query _rff]
                                    (throw (ex-info "Something went wrong."
                                                    {:query-execution {:context      :ad-hoc
                                                                       :lens_id      "lens"
                                                                       :card_id      300
                                                                       ;; these keys should all get removed
                                                                       :result_rows  400
                                                                       :hash         (byte-array [5])
                                                                       :executor_id  500
                                                                       :dashboard_id 700
                                                                       :pulse_id     800
                                                                       :native       true}}
                                                    (Exception. "Something went wrong"))))]
        (is (=? {:status     :failed
                 :class      (partial = java.lang.Exception)
                 :error      "Something went wrong"
                 :stacktrace vector?
                 :card_id    300
                 :json_query {}
                 :row_count  0
                 :data       {:cols []}
                 :context    :ad-hoc
                 :lens_id    "lens"}
                (catch-exceptions (fn run []) {})))))))

(deftest ^:parallel catch-exceptions-test-2
  (testing "Should always include :error (#23258, #23281)"
    (testing "Uses error message if present"
      (is (= "Something went wrong"
             (-> (fn [] (throw (Exception. "Something went wrong")))
                 (catch-exceptions)
                 :error))))
    (testing "Has a default if no message on error"
      (is (= "Error running query"
             (-> (fn [] (throw (ex-info nil {})))
                 (catch-exceptions)
                 :error))))))

(deftest permissions-test
  (mt/with-temp-copy-of-db
    (mt/with-no-data-perms-for-all-users!
      (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
      (data-perms/set-table-permission! (perms-group/all-users) (mt/id :venues) :perms/create-queries :query-builder)
      (testing (str "If someone doesn't have native query execution permissions, they shouldn't see the native version of "
                    "the query in the error response")
        (let [result (test.users/with-test-user :rasta
                       (qp/process-query
                        (qp/userland-query
                         (mt/mbql-query venues {:fields [!month.id]}))))]
          (is (=? {:native nil, :preprocessed nil}
                  result))
          (testing "nor the SQL a driver put in its ex-data"
            (is (not-any? (comp :sql :ex-data) (cons result (:via result)))))))
      (testing "They should see it if they have ad-hoc native query perms"
        (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
        (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder-and-native)
        ;; this is not actually a valid query
        (let [result (test.users/with-test-user :rasta
                       (qp/process-query
                        (qp/userland-query
                         (mt/mbql-query venues {:fields [!month.id]}))))]
          (is (=? {:native       {:query  (str "SELECT DATE_TRUNC('month', \"PUBLIC\".\"VENUES\".\"ID\") AS \"ID\""
                                               " FROM \"PUBLIC\".\"VENUES\" LIMIT 1048575")
                                  :params nil}
                   :preprocessed map?}
                  result))
          (testing "but not the SQL a driver put in its ex-data, which is server-side detail"
            (is (not-any? (comp :sql :ex-data) (cons result (:via result))))))))))

(def ^:private compiled-sql
  "SELECT \"PUBLIC\".\"VENUES\".\"ID\" FROM (SELECT * FROM VENUES WHERE \"TIER\" = 1) AS \"__mb_source\"")

(defn- throw-driver-error
  "Throw what the SQL JDBC driver throws when the database rejects `compiled-sql`."
  []
  (let [message (str "Column \"PUBLIC.SHOPS.PRICE\" not found; SQL statement:\n" compiled-sql)]
    (throw (ex-info (str "Error executing query: " message)
                    {:type qp.error-type/invalid-query, :sql [compiled-sql]}
                    (SQLException. message)))))

(defn- throw-schema-error
  "Throw what a failed `mu/defn` output check throws in dev and test: a message and ex-data holding the whole value."
  []
  (let [value {:lib/stage-metadata {:columns [{:name "SECRET_NUM", :fingerprint {:type {:max 42.0}}}]}}]
    (throw (ex-info (str "Invalid output: " (pr-str value))
                    {:type :metabase.util.malli.fn/invalid-output, :error {:value value}, :value value}))))

(defn- internal-detail
  "The server-internal detail found anywhere in `result`."
  [result]
  (let [s (pr-str result)]
    (filterv #(str/includes? s %) ["SELECT" "TIER" "SHOPS" "fingerprint" "stage-metadata" "SECRET_NUM"])))

(defn- every-error [result]
  (map :error (cons result (:via result))))

(deftest ^:synchronized row-restricted-user-error-response-test
  (let [generic "An error occurred while running the query."]
    (mt/with-test-user :rasta
      (doseq [[restriction redefs] {:sandbox       {#'perms/sandboxed-user-for-db? (constantly true)}
                                    :impersonation {#'perms/impersonation-enforced-for-db?                 (constantly true)
                                                    #'qp.perms/current-user-has-adhoc-native-query-perms? (constantly false)}
                                    :routing       {#'perms/data-access-token                             (constantly {:routing {1 "digest"}})
                                                    #'qp.perms/current-user-has-adhoc-native-query-perms? (constantly false)}}]
        (testing restriction
          (with-redefs-fn (merge {#'perms/data-access-token (constantly {})} redefs)
            (fn []
              (testing "a database error"
                (let [result (catch-exceptions throw-driver-error {:database (mt/id)})]
                  (is (=? {:status :failed, :error generic, :error_type :invalid-query} result))
                  (is (every? #{generic} (every-error result)))
                  (is (= [] (internal-detail result)))
                  (is (nil? (:preprocessed result)))
                  (is (nil? (:native result)))))
              (testing "a schema error"
                (let [result (catch-exceptions throw-schema-error {:database (mt/id)})]
                  (is (every? #{generic} (every-error result)))
                  (is (= [] (internal-detail result)))))
              (testing "a message written for the user is kept"
                (is (=? {:error "You'll need to pick a value for 'Price' before this query can run."}
                        (catch-exceptions
                         (fn [] (throw (ex-info "You'll need to pick a value for 'Price' before this query can run."
                                                {:type qp.error-type/missing-required-parameter})))
                         {:database (mt/id)}))))
              (testing "but not when it repeats a hidden message"
                (is (= [] (internal-detail
                           (catch-exceptions
                            (fn [] (try
                                     (throw-driver-error)
                                     (catch Exception e
                                       (throw (ex-info (str "Timed out: " (ex-message (ex-cause e)))
                                                       {:type qp.error-type/timed-out}
                                                       e)))))
                            {:database (mt/id)})))))
              (testing "a message thrown with a 4xx status code is kept"
                (is (=? {:error "Field PASSWORD is not available for querying."}
                        (catch-exceptions
                         (fn [] (throw (ex-info "Field PASSWORD is not available for querying."
                                                {:type qp.error-type/invalid-query, :status-code 400})))
                         {:database (mt/id)}))))
              (testing "a permission error is kept"
                (is (=? {:error "You do not have permissions to run this query."}
                        (catch-exceptions
                         (fn [] (throw (ex-info "You do not have permissions to run this query."
                                                {:type qp.error-type/missing-required-permissions})))
                         {:database (mt/id)}))))
              (testing "a non-userland query throws the generic message, without the original as its cause"
                (let [qp (catch-exceptions/catch-exceptions (fn [_query _rff] (throw-driver-error)))
                      e  (try
                           (driver/with-driver :h2
                             (qp {:type :query, :database (mt/id)} qp.reducible/default-rff))
                           (catch Exception e
                             e))]
                  (is (= generic (ex-message e)))
                  (is (= {:type :invalid-query} (ex-data e)))
                  (is (nil? (ex-cause e))))))))))
    (testing "control: an unrestricted user sees every message"
      (mt/with-test-user :rasta
        (mt/with-dynamic-fn-redefs [perms/data-access-token (constantly {})]
          (is (str/includes? (:error (catch-exceptions throw-driver-error {:database (mt/id)})) compiled-sql))
          (is (str/includes? (:error (catch-exceptions throw-schema-error {:database (mt/id)})) "fingerprint")))))
    (testing "an impersonated user who may run native queries still sees the database's message"
      (mt/with-test-user :rasta
        (mt/with-dynamic-fn-redefs [perms/data-access-token                             (constantly {})
                                    perms/impersonation-enforced-for-db?                 (constantly true)
                                    qp.perms/current-user-has-adhoc-native-query-perms? (constantly true)]
          (let [result (catch-exceptions throw-driver-error {:database (mt/id)})]
            (is (str/starts-with? (:error result) "Column \"PUBLIC.SHOPS.PRICE\" not found"))
            (is (nil? (:preprocessed result))))
          (is (= [] (internal-detail (catch-exceptions throw-schema-error {:database (mt/id)})))))))
    (testing "control: an admin sees every message"
      (mt/with-test-user :crowberto
        (mt/with-dynamic-fn-redefs [perms/sandboxed-user-for-db? (constantly true)]
          (is (str/includes? (:error (catch-exceptions throw-driver-error {:database (mt/id)})) compiled-sql))
          (is (str/includes? (:error (catch-exceptions throw-schema-error {:database (mt/id)})) "fingerprint")))))
    (testing "control: with no current user, every message is kept"
      (is (str/includes? (:error (catch-exceptions throw-driver-error {:database (mt/id)})) compiled-sql)))))

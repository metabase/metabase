(ns metabase-enterprise.data-testing.security-repros-test
  "Data tests refuse impersonated users, send the warehouse input SQL only as a single SELECT that passes the statement
  check, and send the query under test and expectation SQL as written apart from their table references.

  No test opens a warehouse connection. Each runs against a Database row with the `:postgres` engine whose details
  point at a closed port, and replaces three driver methods with a recorder: `driver/do-with-test-connection` calls its
  body with a `java.sql.Connection` that implements no method, and `driver/execute-on-connection!` and
  `driver/query-on-connection` record the SQL they are given and return a stand-in result. The QP control replaces
  `driver/execute-reducible-query` the same way. A failure shows the recorded SQL."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.data-testing.runner :as data-testing.runner]
   [metabase-enterprise.data-testing.test-util :as data-testing.test-util]
   [metabase-enterprise.impersonation.driver :as impersonation.driver]
   [metabase-enterprise.impersonation.util-test :as impersonation.util-test]
   [metabase.driver :as driver]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.core :as perms]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private card-sql
  "The SQL of the card under test."
  "SELECT id FROM public.orders")

(def ^:private orders
  "The table the card reads, as an input names it."
  {:schema "public" :name "orders"})

(defn- do-with-unreachable-postgres
  "Calls `f` with the id of a `:postgres` Database whose details point at a closed port, holding the table
  `public.orders` with the integer column `id` in its metadata."
  [f]
  (mt/with-temp [:model/Database {db-id :id} {:engine  :postgres
                                              :details {:host "127.0.0.1" :port 1 :dbname "unreachable" :user "nobody"}}
                 :model/Table    {table-id :id} {:db_id db-id :schema "public" :name "orders" :active true}
                 :model/Field    _ {:table_id table-id :name "id" :base_type :type/Integer :database_type "int4"}]
    (f db-id)))

(def ^:private no-op-connection
  "A connection that implements no method, so any use of it throws."
  (reify java.sql.Connection))

(defn- with-recorder!
  "Calls `thunk` with the warehouse replaced by a recorder. Returns `{:result :sent :params :roles}`: what `thunk`
  returned or `{:thrown message}`, each statement handed to the warehouse in order, the parameters bound to each, and
  the impersonation role of the current user at each connection checkout, as `set-role-if-supported!` computes it
  outside a query."
  [thunk]
  (let [sent   (atom [])
        params (atom [])
        roles  (atom [])
        record (fn [sql statement-params]
                 (swap! sent conj sql)
                 (swap! params conj (vec statement-params)))]
    ;; `with-redefs`: these are multimethods, and the API run happens on a server thread.
    (with-redefs [driver/do-with-test-connection (fn [_driver database f]
                                                   (swap! roles conj (impersonation.driver/connection-impersonation-role
                                                                      database))
                                                   (f no-op-connection))
                  driver/execute-on-connection!  (fn [_driver _conn [sql statement-params]]
                                                   (record sql statement-params)
                                                   {:rows-affected 0})
                  driver/query-on-connection     (fn [_driver _conn [sql statement-params] _opts]
                                                   (record sql statement-params)
                                                   {:columns [{:name "id" :database_type "int4"}] :rows []})]
      {:result (try (thunk) (catch Exception e {:thrown (ex-message e)}))
       :sent   @sent
       :params @params
       :roles  @roles})))

(defn- more-than-one-statement
  "The statements of `sent` that hold more than one SQL statement."
  [sent]
  (filterv #(str/includes? % ";") sent))

(defn- run-card-test!
  "Saves a native card of `sql`, [[card-sql]] by default, on the Database `db-id` and a test of it with one SQL input
  standing in for `public.orders` and one `empty` expectation, and runs the test as crowberto."
  ([db-id input-sql expectation-sql]
   (run-card-test! db-id card-sql input-sql expectation-sql))
  ([db-id sql input-sql expectation-sql]
   (mt/with-temp [:model/Card     {card-id :id} {:dataset_query (lib/native-query
                                                                 (lib-be/application-database-metadata-provider db-id)
                                                                 sql)}
                  :model/CardTest {test-id :id} {:card_id      card-id
                                                 :inputs       [{:table orders :format :sql :sql input-sql}]
                                                 :expectations [{:type :empty :name "check" :sql expectation-sql}]}]
     (data-testing.test-util/run-as-admin! :card
                                           (t2/select-one :model/Card :id card-id)
                                           (t2/select-one :model/CardTest :id test-id)))))

(deftest data-test-sends-only-single-statements-to-the-warehouse-test
  (mt/with-premium-features #{:transforms-testing :transforms-basic}
    (do-with-unreachable-postgres
     (fn [db-id]
       (testing "control: a test of single SELECTs runs, and the recorder sees each statement"
         (let [{:keys [result sent]} (with-recorder! #(run-card-test! db-id "SELECT 1 AS id"
                                                                      "SELECT * FROM {{output}} WHERE 1 = 0"))]
           (is (= :passed (:status result)) (pr-str result))
           (is (some #(re-find #"^CREATE TEMPORARY TABLE \S+ AS SELECT 1 AS id$" %) sent) (pr-str sent))
           (is (= [] (more-than-one-statement sent)))))
       (testing "input SQL of more than one statement is refused before anything is sent"
         (let [{:keys [result sent]} (with-recorder! #(run-card-test! db-id "SELECT 1 AS id; COMMIT; DELETE FROM public.orders"
                                                                      "SELECT * FROM {{output}} WHERE 1 = 0"))]
           (is (re-find #"^The SQL check refuses the SQL of input public.orders: " (str (:thrown result)))
               (pr-str result))
           (is (= [] sent))))))))

(def ^:private escape-sql
  "Native SQL that leaves the impersonated role, then reads."
  "RESET ROLE; SELECT 1 AS id")

(defn- process-native-query!
  "Runs native `sql` on the Database `db-id` through the query processor, with the warehouse replaced by a recorder.
  Returns `{:result :sent}`: the result or `{:thrown message}`, and the native SQL of each query handed to the
  warehouse."
  [db-id sql]
  (let [sent (atom [])]
    (with-redefs [driver/execute-reducible-query (fn [_driver query _context respond]
                                                   (swap! sent conj (get-in query [:qp/compiled :query]))
                                                   (respond {:cols [{:name "id"}]} [[1]]))]
      {:result (try (qp/process-query (lib/native-query (lib-be/application-database-metadata-provider db-id) sql))
                    (catch Exception e {:thrown (ex-message e)}))
       :sent   @sent})))

(defn- card-test-body
  "The body that creates a test of the card `card-id` with `input-sql` standing in for `public.orders` and one `empty`
  expectation of `expectation-sql`."
  [card-id input-sql expectation-sql]
  {:card_id      card-id
   :name         "impersonated"
   :inputs       [{:table orders :format "sql" :sql input-sql}]
   :expectations [{:type "empty" :name "check" :sql expectation-sql}]})

(defn- create-and-run-as!
  "Creates, through the API as `user`, a test of the card `card-id` from [[card-test-body]], and runs it through the API
  as `user`. Returns the run's response, or the creation's response when creation fails."
  [user card-id input-sql expectation-sql]
  (let [created (mt/user-http-request user :post "ee/card-test" (card-test-body card-id input-sql expectation-sql))]
    (if-let [test-id (:id created)]
      (mt/user-http-request user :post (str "ee/card-test/" test-id "/run"))
      created)))

(deftest impersonated-user-cannot-save-or-run-a-data-test-test
  (mt/with-premium-features #{:advanced-permissions :transforms-testing :transforms-basic}
    (do-with-unreachable-postgres
     (fn [db-id]
       (mt/with-db (t2/select-one :model/Database :id db-id)
         ;; Real policy rows: rasta's group is impersonated on the Database with the role `limited_role`, and has
         ;; unrestricted view-data and native query permission on it. The All Users group has no data permission on it.
         (impersonation.util-test/with-impersonations! {:impersonations [{:db-id db-id :attribute "role_attr"}]
                                                        :attributes     {"role_attr" "limited_role"}}
           (mt/with-temp [:model/Card     {card-id :id} {:dataset_query (lib/native-query
                                                                         (lib-be/application-database-metadata-provider db-id)
                                                                         card-sql)}
                          :model/CardTest {test-id :id} {:card_id      card-id
                                                         :inputs       [{:table orders :format :sql :sql "SELECT 1 AS id"}]
                                                         :expectations [{:type :empty :name "check"
                                                                         :sql  "SELECT * FROM {{output}} WHERE 1 = 0"}]}]
             (testing "control: the query processor sends rasta's single SELECT"
               (is (= ["SELECT 1 AS id"] (:sent (process-native-query! db-id "SELECT 1 AS id")))))
             (testing "control: the query processor refuses rasta's native query that resets the role, and sends nothing"
               (let [{:keys [result sent]} (process-native-query! db-id escape-sql)]
                 (is (re-find #"Must be a single select statement" (str (:thrown result))))
                 (is (= [] sent))))
             (testing "rasta cannot save a data test of single SELECTs, and nothing reaches the warehouse"
               (let [{:keys [result sent roles]}
                     (with-recorder! #(mt/user-http-request :rasta :post 403 "ee/card-test"
                                                            (card-test-body card-id "SELECT 1 AS id"
                                                                            "SELECT * FROM {{output}} WHERE 1 = 0")))]
                 (is (= "card-test.impersonated-user" (:error-code result)) (pr-str result))
                 (is (= [] sent))
                 (is (= [] roles))))
             (testing "rasta cannot save a data test whose SQL resets the role, and nothing reaches the warehouse"
               (let [{:keys [result sent]}
                     (with-recorder! #(mt/user-http-request :rasta :post 403 "ee/card-test"
                                                            (card-test-body card-id (str "SELECT 1 AS id; " escape-sql)
                                                                            "RESET ROLE; SELECT * FROM {{output}} WHERE 1 = 0")))]
                 (is (= "card-test.impersonated-user" (:error-code result)) (pr-str result))
                 (is (= [] sent))))
             (testing "rasta cannot run a data test that an admin saved, and nothing reaches the warehouse"
               (let [{:keys [result sent roles]}
                     (with-recorder! #(mt/user-http-request :rasta :post 403 (str "ee/card-test/" test-id "/run")))]
                 (is (= "card-test.impersonated-user" (:error-code result)) (pr-str result))
                 (is (= [] sent))
                 (is (= [] roles))))
             (testing "a user who is not impersonated on the Database saves and runs a data test"
               (mt/with-group-for-user [group :lucky]
                 (mt/with-db-perms-for-group! group db-id {:perms/view-data      :unrestricted
                                                           :perms/create-queries :query-builder-and-native}
                   (let [{:keys [result sent roles]}
                         (with-recorder! #(create-and-run-as! :lucky card-id "SELECT 1 AS id"
                                                              "SELECT * FROM {{output}} WHERE 1 = 0"))]
                     (is (= "passed" (:status result)) (pr-str result))
                     (is (= [nil] roles))
                     (is (seq sent))
                     (is (= [] (more-than-one-statement sent)))))))
             (testing "an admin saves and runs a data test"
               (let [{:keys [result sent roles]}
                     (with-recorder! #(create-and-run-as! :crowberto card-id "SELECT 1 AS id"
                                                          "SELECT * FROM {{output}} WHERE 1 = 0"))]
                 (is (= "passed" (:status result)) (pr-str result))
                 (is (= [nil] roles))
                 (is (seq sent))))
             (testing "an admin runs the data test that rasta is refused"
               (let [{:keys [result]}
                     (with-recorder! #(mt/user-http-request :crowberto :post 200 (str "ee/card-test/" test-id "/run")))]
                 (is (= "passed" (:status result)) (pr-str result)))))))))))

(def ^:private hidden-setval-sql
  "One SELECT that the parser reads as a string concatenation. SQLGlot rebuilds `E'\\\\'` as `e'\\'`, which Postgres
  reads as ending one quote later, so in the rebuild `setval` runs and `--` comments out the rest."
  "SELECT E'\\\\' || $q$' || (SELECT setval($z$orders_id_seq$z$, 4242))::text --$q$ AS id")

(def ^:private string-with-a-call-sql
  "An `empty` expectation of the same form as [[hidden-setval-sql]]. As written, Postgres reads `E'\\\\'` as one
  backslash and the dollar-quoted text after it as a string, so `set_config` is text and never runs."
  (str "SELECT E'\\\\' || $q$' || set_config($z$role$z$, $z$postgres$z$, false) --$q$ AS id"
       " FROM {{output}} WHERE 1 = 0"))

(deftest data-test-sends-the-checked-statement-test
  (mt/with-premium-features #{:transforms-testing :transforms-basic}
    (do-with-unreachable-postgres
     (fn [db-id]
       (testing "the run sends input SQL as the statement check rebuilt it"
         (let [{:keys [result sent]} (with-recorder! #(run-card-test! db-id "SELECT 1 AS id -- one"
                                                                      "SELECT * FROM {{output}} WHERE 1 = 0"))]
           (is (= :passed (:status result)) (pr-str result))
           (is (some #(re-find #"^CREATE TEMPORARY TABLE \S+ AS SELECT 1 AS id /\* one \*/$" %) sent) (pr-str sent))))
       (testing "input SQL whose rebuild Postgres reads as more than one statement is refused before anything is sent"
         (let [{:keys [result sent]} (with-recorder! #(run-card-test! db-id "SELECT E'a\\\\' || $q$; RESET ROLE; --$q$ AS id"
                                                                      "SELECT * FROM {{output}} WHERE 1 = 0"))]
           (is (re-find #"^The SQL check refuses the SQL of input public.orders: " (str (:thrown result)))
               (pr-str result))
           (is (= [] sent))))
       (testing "a trailing `;` is dropped from the statement sent"
         (let [{:keys [result sent]} (with-recorder! #(run-card-test! db-id "SELECT 1 AS id;"
                                                                      "SELECT * FROM {{output}} WHERE 1 = 0"))]
           (is (= :passed (:status result)) (pr-str result))
           (is (some #(re-find #"^CREATE TEMPORARY TABLE \S+ AS SELECT 1 AS id$" %) sent) (pr-str sent))))
       (testing "input SQL calling `nextval`, whose effect survives the run's rollback, is refused before anything is sent"
         (let [{:keys [result sent]} (with-recorder! #(run-card-test! db-id "SELECT nextval('orders_id_seq') AS id"
                                                                      "SELECT * FROM {{output}} WHERE 1 = 0"))]
           (is (re-find #"^The SQL check refuses the SQL of input public.orders: " (str (:thrown result)))
               (pr-str result))
           (is (= [] sent))))
       (testing "input SQL whose CTE writes is refused before anything is sent"
         (let [{:keys [result sent]} (with-recorder! #(run-card-test! db-id "WITH d AS (DELETE FROM public.orders RETURNING id) SELECT id FROM d"
                                                                      "SELECT * FROM {{output}} WHERE 1 = 0"))]
           (is (re-find #"^The SQL check refuses the SQL of " (str (:thrown result))) (pr-str result))
           (is (= [] sent))))
       (testing "input SQL whose rebuilt E'' string ends one quote later, running `setval`, is refused before anything is sent"
         (let [{:keys [result sent]} (with-recorder! #(run-card-test! db-id hidden-setval-sql
                                                                      "SELECT * FROM {{output}} WHERE 1 = 0"))]
           (is (re-find #"^The SQL check refuses the SQL of " (str (:thrown result))) (pr-str result))
           (is (not (re-find #"\bnull\b" (str (:thrown result)))) (pr-str result))
           (is (= [] sent))))
       (testing "`empty` expectation SQL is sent as written apart from its table, so its E'' string ends where its author ended it"
         (let [{:keys [result sent]} (with-recorder! #(run-card-test! db-id "SELECT 1 AS id" string-with-a-call-sql))]
           (is (= :passed (:status result)) (pr-str result))
           (is (some #(str/includes? % (str/replace string-with-a-call-sql #" FROM .*$" " FROM ")) sent) (pr-str sent))
           (is (some #(re-find #" FROM \S+ AS __mb_output WHERE 1 = 0" %) sent) (pr-str sent))))
       (testing "the card's own SQL is sent as written apart from its table"
         (let [{:keys [result sent]} (with-recorder! #(run-card-test! db-id "select  id -- the id\nFROM public.orders"
                                                                      "SELECT 1 AS id" "SELECT * FROM {{output}} WHERE 1 = 0"))]
           (is (= :passed (:status result)) (pr-str result))
           (is (some #(re-find #"^CREATE TEMPORARY TABLE \S+ AS select  id -- the id\nFROM \S+ AS orders$" %) sent)
               (pr-str sent))))))))

(def ^:private output-expectation
  "An `empty` expectation of a card or segment test, which reads the output as `{{output}}`."
  {:type "empty" :name "check" :sql "SELECT * FROM {{output}} WHERE 1 = 0"})

(def ^:private transform-expectation
  "An `empty` expectation of a transform test, which reads the transform's target, `public.orders_summary`."
  {:type "empty" :name "check" :sql "SELECT * FROM public.orders_summary WHERE 1 = 0"})

(def ^:private sql-input
  "An input standing in for `public.orders`."
  {:table orders :format "sql" :sql "SELECT 1 AS id"})

(deftest impersonated-user-cannot-save-or-run-a-test-of-any-subject-test
  (data-testing.test-util/with-transforms-enabled #{:advanced-permissions :transforms-testing :transforms-basic}
    (do-with-unreachable-postgres
     (fn [db-id]
       (let [mp       (lib-be/application-database-metadata-provider db-id)
             table-id (t2/select-one-pk :model/Table :db_id db-id)
             field-id (t2/select-one-pk :model/Field :table_id table-id)]
         (mt/with-temp [:model/Card          {card-id :id}           {:dataset_query (lib/native-query mp card-sql)}
                        :model/CardTest      {card-test-id :id}      {:card_id      card-id
                                                                      :inputs       [sql-input]
                                                                      :expectations [output-expectation]}
                        :model/Transform     {transform-id :id}      {:name   "orders summary"
                                                                      :source {:type :query :query (lib/native-query mp card-sql)}
                                                                      :target {:type "table" :schema "public" :name "orders_summary"
                                                                               :database db-id}}
                        :model/TransformTest {transform-test-id :id} {:transform_id transform-id
                                                                      :inputs       [sql-input]
                                                                      :expectations [transform-expectation]}
                        :model/Segment       {segment-id :id}        {:name       "positive ids"
                                                                      :table_id   table-id
                                                                      :definition (lib/filter (lib/query mp (lib.metadata/table mp table-id))
                                                                                              (lib/> (lib.metadata/field mp field-id) 0))}
                        :model/SegmentTest   {segment-test-id :id}   {:segment_id   segment-id
                                                                      :inputs       [sql-input]
                                                                      :expectations [output-expectation]}]
           (mt/with-db (t2/select-one :model/Database :id db-id)
             ;; As in `impersonated-user-cannot-save-or-run-a-data-test-test`, rasta's group is impersonated on the
             ;; Database, with unrestricted view-data and native query permission; here it may also write transforms.
             (impersonation.util-test/with-impersonations! {:impersonations [{:db-id db-id :attribute "role_attr"}]
                                                            :attributes     {"role_attr" "limited_role"}}
               (perms/set-database-permission! &group db-id :perms/transforms :yes)
               (mt/with-data-analyst-role! (mt/user->id :rasta)
                 (let [created  (atom [])
                       requests [["transform-test" :model/TransformTest
                                  [[:post "ee/transform-test" {:transform_id transform-id :name "t" :inputs [sql-input]
                                                               :expectations [transform-expectation]}]
                                   [:put (str "ee/transform-test/" transform-test-id)
                                    {:expectations [(assoc transform-expectation :name "changed")]}]
                                   [:post (str "ee/transform-test/" transform-test-id "/run")]]]
                                 ["segment-test" :model/SegmentTest
                                  [[:post "ee/segment-test" {:segment_id segment-id :name "t" :inputs [sql-input]
                                                             :expectations [output-expectation]}]
                                   [:put (str "ee/segment-test/" segment-test-id)
                                    {:expectations [(assoc output-expectation :name "changed")]}]
                                   [:post (str "ee/segment-test/" segment-test-id "/run")]]]
                                 ["card-test" :model/CardTest
                                  [[:put (str "ee/card-test/" card-test-id)
                                    {:expectations [(assoc output-expectation :name "changed")]}]]]]
                       ;; Sends the request with the warehouse replaced by a recorder, and keeps the id of a test it
                       ;; creates, to delete it after.
                       request! (fn [model user method path body]
                                  (let [recorded (with-recorder! #(apply mt/user-http-request user method path
                                                                         (when body [body])))]
                                    (when-let [id (and (= :post method) (not (str/ends-with? path "/run"))
                                                       (:id (:result recorded)))]
                                      (swap! created conj [model id]))
                                    recorded))]
                   (try
                     (doseq [[prefix model prefix-requests] requests
                             [method path body]             prefix-requests]
                       (testing (str (u/upper-case-en (name method)) " " path)
                         (testing "rasta is refused, and nothing reaches the warehouse"
                           (let [{:keys [result sent roles]} (request! model :rasta method path body)]
                             (is (= (str prefix ".impersonated-user") (:error-code result)) (pr-str result))
                             (is (= [] sent))
                             (is (= [] roles))))
                         (testing "control: an admin's same request succeeds"
                           (let [{:keys [result sent]} (request! model :crowberto method path body)]
                             (if (str/ends-with? path "/run")
                               (do (is (= "passed" (:status result)) (pr-str result))
                                   (is (seq sent)))
                               (is (pos-int? (:id result)) (pr-str result)))))))
                     (finally
                       (doseq [[model id] @created]
                         (t2/delete! model :id id))
                       (t2/delete! :model/DataTestRun :test_id [:in [card-test-id transform-test-id segment-test-id]])))))))))))))

(deftest data-test-run-with-no-current-user-is-refused-test
  (mt/with-premium-features #{:transforms-testing :transforms-basic}
    (do-with-unreachable-postgres
     (fn [db-id]
       (mt/with-temp [:model/Card     {card-id :id} {:dataset_query (lib/native-query
                                                                     (lib-be/application-database-metadata-provider db-id)
                                                                     card-sql)}
                      :model/CardTest {test-id :id} {:card_id      card-id
                                                     :inputs       [sql-input]
                                                     :expectations [output-expectation]}]
         (let [card      (t2/select-one :model/Card :id card-id)
               card-test (t2/select-one :model/CardTest :id test-id)]
           (testing "a run with no current user is refused with a 403, sends nothing and records no run"
             (let [{:keys [result sent roles]}
                   (with-recorder! #(try (data-testing.runner/run-test! :card card card-test)
                                         (catch clojure.lang.ExceptionInfo e
                                           {:status-code (:status-code (ex-data e))})))]
               (is (= {:status-code 403} result))
               (is (= [] sent))
               (is (= [] roles))
               (is (zero? (t2/count :model/DataTestRun :test_id test-id)))))
           (testing "control: the same run as an admin passes"
             (try
               (is (= :passed (:status (:result (with-recorder! #(data-testing.test-util/run-as-admin! :card card card-test))))))
               (finally
                 (t2/delete! :model/DataTestRun :test_id test-id))))))))))

(deftest data-test-of-more-than-one-statement-is-refused-over-http-test
  (mt/with-premium-features #{:transforms-testing :transforms-basic}
    (do-with-unreachable-postgres
     (fn [db-id]
       (mt/with-temp [:model/Card     {card-id :id} {:dataset_query (lib/native-query
                                                                     (lib-be/application-database-metadata-provider db-id)
                                                                     card-sql)}
                      :model/CardTest {test-id :id} {:card_id      card-id
                                                     :inputs       [(assoc sql-input :sql "SELECT 1 AS id; DELETE FROM public.orders")]
                                                     :expectations [output-expectation]}]
         (testing "saving such a test is a 400 that names the refusal, sends nothing and saves no test"
           (let [{:keys [result sent]}
                 (with-recorder! #(mt/user-http-request :crowberto :post 400 "ee/card-test"
                                                        (card-test-body card-id "SELECT 1 AS id; DELETE FROM public.orders"
                                                                        "SELECT * FROM {{output}} WHERE 1 = 0")))]
             (is (= "card-test.not-a-single-select" (:error-code result)) (pr-str result))
             (is (= [] sent))
             (is (= #{test-id} (t2/select-pks-set :model/CardTest :card_id card-id)))))
         (testing "running such a saved test is a 400 that names the refusal, sends nothing and records no run"
           (let [{:keys [result sent]}
                 (with-recorder! #(mt/user-http-request :crowberto :post 400 (str "ee/card-test/" test-id "/run")))]
             (is (= "card-test.not-a-single-select" (:error-code result)) (pr-str result))
             (is (= [] sent))
             (is (zero? (t2/count :model/DataTestRun :test_id test-id))))))))))

(defn- strpos-bindings
  "The string and the substring that the sent statement `sql`, with `params`, passes to its `strpos` call, written
  `strpos(?, ?)` or `POSITION(? IN ?)`, or nil when it holds neither."
  [sql params]
  (cond
    (str/includes? sql "strpos(?, ?)")     {:string (first params) :substring (second params)}
    (str/includes? sql "POSITION(? IN ?)") {:string (second params) :substring (first params)}))

(deftest data-test-binds-each-parameter-to-its-placeholder-test
  (mt/with-premium-features #{:transforms-testing :transforms-basic}
    (do-with-unreachable-postgres
     (fn [db-id]
       (let [mp    (lib-be/application-database-metadata-provider db-id)
             query (as-> (lib/native-query mp "SELECT strpos({{a}}, {{b}}) AS id FROM public.orders") q
                     (lib/with-template-tags q (mapv #(assoc % :default ({"a" "abcdef" "b" "cd"} (:name %)))
                                                     (lib/template-tags q))))]
         (testing "premise: the card's query compiles to strpos(?, ?) with the string, then the substring"
           (is (= ["SELECT strpos(?, ?) AS id FROM public.orders" ["abcdef" "cd"]]
                  ((juxt :query (comp vec :params)) (qp.compile/compile query)))))
         (mt/with-temp [:model/Card     {card-id :id} {:dataset_query query}
                        :model/CardTest {test-id :id} {:card_id      card-id
                                                       :inputs       [{:table orders :format :sql :sql "SELECT 1 AS id"}]
                                                       :expectations [{:type :empty :name "check"
                                                                       :sql  "SELECT * FROM {{output}} WHERE 1 = 0"}]}]
           (let [{:keys [result sent params]}
                 (with-recorder! #(data-testing.test-util/run-as-admin! :card
                                                                        (t2/select-one :model/Card :id card-id)
                                                                        (t2/select-one :model/CardTest :id test-id)))
                 bindings (keep identity (map strpos-bindings sent params))]
             (testing "control: the run passes and sends the query under test"
               (is (= :passed (:status result)) (pr-str result))
               (is (seq bindings) (pr-str sent)))
             (testing "every statement holding the call passes it the string, then the substring, as the card does"
               (is (every? #{{:string "abcdef" :substring "cd"}} bindings)
                   (pr-str (map vector sent params)))))))))))

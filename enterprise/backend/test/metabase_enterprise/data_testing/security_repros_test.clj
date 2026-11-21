(ns metabase-enterprise.data-testing.security-repros-test
  "Data tests send the warehouse only single SELECTs that pass the statement check, and refuse impersonated users.

  No test opens a warehouse connection. Each runs against a Database row with the `:postgres` engine whose details
  point at a closed port, and replaces three driver methods with a recorder: `driver/do-with-test-connection` calls its
  body with a `java.sql.Connection` that implements no method, and `driver/execute-on-connection!` and
  `driver/query-on-connection` record the SQL they are given and return a stand-in result. The QP control replaces
  `driver/execute-reducible-query` the same way. A failure shows the recorded SQL."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.data-testing.runner :as data-testing.runner]
   [metabase-enterprise.impersonation.driver :as impersonation.driver]
   [metabase-enterprise.impersonation.util-test :as impersonation.util-test]
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
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
  "Calls `thunk` with the warehouse replaced by a recorder. Returns `{:result :sent :roles}`: what `thunk` returned or
  `{:thrown message}`, each statement handed to the warehouse in order, and the impersonation role of the current user
  at each connection checkout, as `set-role-if-supported!` computes it outside a query."
  [thunk]
  (let [sent  (atom [])
        roles (atom [])]
    ;; `with-redefs`: these are multimethods, and the API run happens on a server thread.
    (with-redefs [driver/do-with-test-connection (fn [_driver database f]
                                                   (swap! roles conj (impersonation.driver/connection-impersonation-role
                                                                      database))
                                                   (f no-op-connection))
                  driver/execute-on-connection!  (fn [_driver _conn [sql _params]]
                                                   (swap! sent conj sql)
                                                   {:rows-affected 0})
                  driver/query-on-connection     (fn [_driver _conn [sql _params] _opts]
                                                   (swap! sent conj sql)
                                                   {:columns [{:name "id" :database_type "int4"}] :rows []})]
      {:result (try (thunk) (catch Exception e {:thrown (ex-message e)}))
       :sent   @sent
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
     (binding [api/*current-user-id* (mt/user->id :crowberto)]
       (data-testing.runner/run-test! :card
                                      (t2/select-one :model/Card :id card-id)
                                      (t2/select-one :model/CardTest :id test-id))))))

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
       (testing "input SQL of more than one statement is refused or never sent"
         (is (= [] (more-than-one-statement
                    (:sent (with-recorder! #(run-card-test! db-id "SELECT 1 AS id; COMMIT; DELETE FROM public.orders"
                                                            "SELECT * FROM {{output}} WHERE 1 = 0")))))))
       (testing "`empty` expectation SQL of more than one statement is refused or never sent"
         (is (= [] (more-than-one-statement
                    (:sent (with-recorder! #(run-card-test! db-id "SELECT 1 AS id"
                                                            (str "SELECT * FROM {{output}} WHERE 1 = 0; COMMIT; "
                                                                 "DO $$ BEGIN EXECUTE 'DELETE FROM public.orders'; END $$"))))))))))))

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

(def ^:private hidden-set-config-sql
  "An `empty` expectation of the same form as [[hidden-setval-sql]], whose rebuild calls `set_config`. The rewrite of
  `{{output}}` is itself a rebuild, so the string is written `E'\\\\\\\\'`: the rewrite turns it into `e'\\\\'`, and
  the rebuild the run executes into `e'\\'`, which Postgres ends one quote later."
  (str "SELECT E'\\\\\\\\' || $q$' || set_config($z$role$z$, $z$postgres$z$, false) --$q$ AS id"
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
       (testing "input SQL whose rebuild Postgres reads as more than one statement is refused or never sent"
         (is (= [] (more-than-one-statement
                    (:sent (with-recorder! #(run-card-test! db-id "SELECT E'a\\\\' || $q$; RESET ROLE; --$q$ AS id"
                                                            "SELECT * FROM {{output}} WHERE 1 = 0")))))))
       (testing "input SQL whose CTE writes is refused before anything is sent"
         (let [{:keys [result sent]} (with-recorder! #(run-card-test! db-id "WITH d AS (DELETE FROM public.orders RETURNING id) SELECT id FROM d"
                                                                      "SELECT * FROM {{output}} WHERE 1 = 0"))]
           (is (re-find #"must be one SELECT statement" (str (:thrown result))) (pr-str result))
           (is (= [] sent))))
       (testing "input SQL whose rebuilt E'' string ends one quote later, running `setval`, is refused before anything is sent"
         (let [{:keys [result sent]} (with-recorder! #(run-card-test! db-id hidden-setval-sql
                                                                      "SELECT * FROM {{output}} WHERE 1 = 0"))]
           (is (re-find #"must be one SELECT statement" (str (:thrown result))) (pr-str result))
           (is (= [] sent))))
       (testing "`empty` expectation SQL whose rebuilt E'' string ends one quote later, running `set_config`, is refused before anything is sent"
         (let [{:keys [result sent]} (with-recorder! #(run-card-test! db-id "SELECT 1 AS id" hidden-set-config-sql))]
           (is (re-find #"must be one SELECT statement" (str (:thrown result))) (pr-str result))
           (is (= [] sent))))
       (testing "the card's own SQL of more than one statement is refused or never sent"
         (is (= [] (more-than-one-statement
                    (:sent (with-recorder! #(run-card-test! db-id "SELECT id FROM public.orders; COMMIT; SELECT 1"
                                                            "SELECT 1 AS id" "SELECT * FROM {{output}} WHERE 1 = 0")))))))))))

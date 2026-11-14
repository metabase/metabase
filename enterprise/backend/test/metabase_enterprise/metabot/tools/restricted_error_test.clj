(ns metabase-enterprise.metabot.tools.restricted-error-test
  "Query error text that Metabot sends to the model, for a user whose row access is restricted."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.impersonation.util-test :as impersonation.util-test]
   [metabase-enterprise.sandbox.test-util :as met]
   [metabase.api-scope.core :as api-scope]
   [metabase.api.common :as api]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.agent.profiles :as profiles]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools :as tools]
   [metabase.metabot.tools.sql.create :as create-sql-query-tools]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.test :as mt]))

(def ^:private generic "An error occurred while running the query.")

(def ^:private internal-text
  "Text that only a user with unrestricted row access may see."
  "Column SECRET_LITERAL_4242 from stage metadata is not available")

(defn- internal-error []
  (ex-info internal-text {:type qp.error-type/invalid-query}))

(defn- permission-error []
  (ex-info "You do not have permissions to run this query." {:type qp.error-type/missing-required-permissions}))

(defn- run-query!
  "Call Chat's `run_query` on `query` as the current user, in a conversation of their own, with SQL allowed."
  [query]
  (mt/with-temp [:model/MetabotConversation {conversation-id :id} {:user_id api/*current-user-id*}]
    (mt/with-temporary-setting-values [metabot-query-execution-enabled? true
                                       metabot-sql-execution-enabled?   true]
      (binding [scope/*current-user-metabot-permissions* scope/all-yes-permissions
                scope/*current-user-scope*               api-scope/unrestricted]
        (let [entries (tools/->entries [#'tools/run-query-tool
                                        #'tools/construct-notebook-query-tool
                                        #'tools/create-sql-query-tool]
                                       (atom {:conversation-id conversation-id
                                              :state           {:queries {"q1" query}}})
                                       nil
                                       :internal)]
          ((get-in entries ["run_query" :fn]) {:query_id "q1"}))))))

(defn- construct-sql-chart!
  "Call the Documents profile's `document_construct_sql_chart` tool as the current user."
  []
  (binding [scope/*current-user-scope* api-scope/unrestricted]
    (let [entries (tools/->entries (:tools (profiles/get-profile :document-generate-content))
                                   (atom {}) nil :document-generate-content)]
      ((get-in entries ["document_construct_sql_chart" :fn])
       {:database_id  (mt/id)
        :name         "Venues"
        :description  "Venues"
        :analysis     "Venues"
        :approach     "Venues"
        :sql          "SELECT COUNT(*) AS N FROM VENUES"
        :viz_settings {:chart_type "bar"}}))))

(defn- venues-sql []
  (mt/native-query {:query "SELECT COUNT(*) AS N FROM VENUES"}))

(defmacro ^:private with-impersonated-rasta!
  [& body]
  `(mt/with-premium-features #{:advanced-permissions}
     (impersonation.util-test/with-impersonations!
       {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
        :attributes     {"impersonation_attr" "impersonation_role"}}
       ~@body)))

(defn- check-output [output expected-text]
  (is (str/includes? output expected-text))
  (when (= expected-text generic)
    (is (not (str/includes? output "SECRET_LITERAL_4242")))))

(deftest run-query-compile-error-for-impersonated-user-test
  (testing "an impersonated user's SQL that fails to compile reaches the model with the generic message"
    (mt/with-dynamic-fn-redefs [qp.compile/compile (fn [& _] (throw (internal-error)))]
      (with-impersonated-rasta!
        (check-output (:output (run-query! (venues-sql))) generic))))
  (testing "a permission error still reaches an impersonated user"
    (mt/with-dynamic-fn-redefs [qp.compile/compile (fn [& _] (throw (permission-error)))]
      (with-impersonated-rasta!
        (check-output (:output (run-query! (venues-sql))) "You do not have permissions to run this query."))))
  (testing "control: an admin still gets the specific message"
    (mt/with-dynamic-fn-redefs [qp.compile/compile (fn [& _] (throw (internal-error)))]
      (mt/with-test-user :crowberto
        (check-output (:output (run-query! (venues-sql))) internal-text)))))

(deftest document-sql-chart-error-for-impersonated-user-test
  ;; Build the query first: creating the test database runs queries, which the redefs below would break.
  (let [query (venues-sql)]
    (mt/with-dynamic-fn-redefs [create-sql-query-tools/create-sql-query
                                (fn [_]
                                  {:validation-result {:valid? true :dialect "h2"}
                                   :action-result     {:query-id "q-1", :query query}})]
      (testing "an impersonated user's failed chart query reaches the model with the generic message"
        (mt/with-dynamic-fn-redefs [qp/process-query (fn [& _] (throw (internal-error)))]
          (with-impersonated-rasta!
            (check-output (:output (construct-sql-chart!)) generic))))
      (testing "a permission error still reaches an impersonated user"
        (mt/with-dynamic-fn-redefs [qp/process-query (fn [& _] (throw (permission-error)))]
          (with-impersonated-rasta!
            (check-output (:output (construct-sql-chart!)) "You do not have permissions to run this query."))))
      (testing "control: an admin still gets the specific message"
        (mt/with-dynamic-fn-redefs [qp/process-query (fn [& _] (throw (internal-error)))]
          (mt/with-test-user :crowberto
            (check-output (:output (construct-sql-chart!)) internal-text)))))))

(defn- venues-count []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
        (lib/aggregate (lib/count)))))

(deftest run-query-database-error-for-sandboxed-user-test
  (testing "a sandboxed user's failed notebook query reaches the model with the generic message"
    (met/with-gtaps! {:gtaps {:venues {}}}
      (binding [qp.pipeline/*execute* (fn [& _] (throw (internal-error)))]
        (check-output (:output (run-query! (venues-count))) generic))))
  (testing "control: an unrestricted user gets the specific message"
    (mt/with-test-user :rasta
      (binding [qp.pipeline/*execute* (fn [& _] (throw (internal-error)))]
        (check-output (:output (run-query! (venues-count))) internal-text)))))

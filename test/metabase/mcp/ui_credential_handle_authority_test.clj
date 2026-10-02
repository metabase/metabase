(ns metabase.mcp.ui-credential-handle-authority-test
  "A handle carries no authority. Every spend re-checks the scopes of the credential that spends it, against the kind of
  query the handle stores, whichever token or tool minted the handle."
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.mcp.session :as mcp.session]
   [metabase.mcp.ui-test-util :as ui.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(def ^:private token-a-scopes #{"agent:query:run" "agent:sql:run"})
(def ^:private token-b-scopes #{"agent:query:run"})

(defn- auth-for-token!
  "A UI credential for crowberto on a fresh MCP session, minted from a new MCP token holding `scopes`."
  [scopes]
  (let [user-id    (mt/user->id :crowberto)
        session-id (mcp.session/create! user-id)]
    {:user-id    user-id
     :session-id session-id
     :credential (ui.tu/credential! session-id user-id scopes)}))

(defn- native-query []
  (let [mp (mt/metadata-provider)]
    (lib/with-template-tags
      (lib/native-query mp "SELECT * FROM VENUES WHERE {{category}}")
      {"category" {:type         :dimension
                   :name         "category"
                   :display-name "Category"
                   :id           "category-tag-id"
                   :dimension    (lib/ref (lib.metadata/field mp (mt/id :venues :category_id)))
                   :widget-type  :number/=}})))

(defn- mbql-query []
  (lib/limit (lib/query (mt/metadata-provider) (lib.metadata/table (mt/metadata-provider) (mt/id :venues))) 1))

(def ^:private handle-routes
  "Each handle-keyed route the iframe runs a stored query through, with a body it accepts."
  {"run"                 {}
   "pivot"               {}
   "query_metadata"      {}
   "parameter/remapping" {:parameter {:id "category-tag-id"} :value 2}})

(defn- spend!
  [auth handle route body]
  (ui.tu/ui-request! auth :post nil (str "embed-mcp/queries/" handle "/" route) body))

(deftest native-handle-from-a-sql-token-is-refused-to-a-query-only-credential-test
  (mt/with-full-data-perms-for-all-users!
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [token-a (auth-for-token! token-a-scopes)
            token-b (auth-for-token! token-b-scopes)
            ;; Token A's session stores the native handle, as execute_sql would.
            handle  (ui.tu/store-query-handle! (:session-id token-a) (:user-id token-a) (native-query))]
        (testing "the same user's credential from a token without agent:sql:run cannot spend the handle on any route"
          (doseq [[route body] handle-routes]
            (testing route
              (let [response (spend! token-b handle route body)]
                (is (= 403 (:status response)))
                (is (re-find #"agent:sql:run" (str (:body response))))))))
        (testing "deriving from the handle with that credential yields nothing it can run"
          (let [derive-response (spend! token-b handle "derive"
                                        {:operations [{:type "temporal-bucket/set" :unit "year"}]})]
            (is (= 400 (:status derive-response)) "a native handle cannot be derived at all")
            (is (nil? (get-in derive-response [:body :handle])))))
        (testing "control: token A's credential spends the same handle"
          (doseq [[route body] handle-routes]
            (testing route
              (is (#{200 202} (:status (spend! token-a handle route body)))))))))))

(deftest mbql-handle-is-refused-to-a-credential-without-the-query-scope-test
  (mt/with-full-data-perms-for-all-users!
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [token-a  (auth-for-token! token-a-scopes)
            no-query (auth-for-token! #{"agent:search"})
            handle   (ui.tu/store-query-handle! (:session-id token-a) (:user-id token-a) (mbql-query))]
        (testing "a credential whose token lacks agent:query:run cannot spend a handle another token minted"
          (doseq [route ["run" "pivot" "query_metadata" "derive"]]
            (testing route
              (is (= 403 (:status (spend! no-query handle route
                                          (if (= route "derive")
                                            {:operations [{:type "date-filter/clear"}]}
                                            {}))))))))
        (testing "control: token A's credential runs it"
          (is (= 202 (:status (spend! token-a handle "run" {})))))))))

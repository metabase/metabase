(ns metabase.mcp.ui-credential-authz-test
  "The MCP Apps UI credential lets the iframe reach a small set of routes. Reaching a route is not the same as being
  allowed to use it: every request runs as the credential's user, and that user's own permissions decide what runs."
  (:require
   [clojure.test :refer :all]
   [metabase.mcp.session :as mcp.session]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- ui-post!
  "POST `body` to `url` the way the iframe does, with a UI credential minted for rasta holding `scopes`. Returns the
  full response."
  [scopes url body]
  (let [user-id    (mt/user->id :rasta)
        session-id (mcp.session/create! user-id)
        credential (mcp.session/issue-ui-credential session-id user-id scopes)]
    (client/client-full-response :post url
                                 {:request-options {:headers {"x-metabase-mcp-ui-auth" credential
                                                              "mcp-session-id"         session-id}}}
                                 body)))

(defn- venues-query []
  {:database (mt/id)
   :type     :query
   :query    {:source-table (mt/id :venues) :limit 1}})

(defn- native-query []
  {:database (mt/id)
   :type     :native
   :native   {:query "SELECT 1 AS one"}})

(defn- card-query [card-id]
  {:database (mt/id)
   :type     :query
   :query    {:source-table (str "card__" card-id) :limit 1}})

(defn- rows [response]
  (get-in response [:body :data :rows]))

(defn- refused?
  "Whether `response` is the refusal /api/dataset gives a query its user lacks permission for: 403, a failed status,
  `missing-required-permissions`, and no rows."
  [response]
  (and (= 403 (:status response))
       (= "failed" (get-in response [:body :status]))
       (= "missing-required-permissions" (get-in response [:body :error_type]))
       (empty? (rows response))))

(deftest dataset-runs-only-what-the-user-may-query-test
  (testing "The credential's agent:query:run scope lets the iframe reach /api/dataset, and the user's own data
            permissions decide what runs. Rasta, with no data permissions, is refused."
    (mt/with-no-data-perms-for-all-users!
      (is (refused? (ui-post! #{"agent:query:run"} "dataset" (venues-query))))))
  (testing "control: the same request runs when rasta may query the table"
    (mt/with-full-data-perms-for-all-users!
      (let [response (ui-post! #{"agent:query:run"} "dataset" (venues-query))]
        (is (= 202 (:status response)))
        (is (= 1 (count (rows response))))))))

(deftest native-sql-runs-only-when-the-user-may-write-native-test
  (testing "The credential's agent:sql:run scope lets the iframe send native SQL, and the user's own native-query
            permission decides whether it runs. Rasta may build queries on the database but not write SQL."
    (mt/with-no-data-perms-for-all-users!
      (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
      (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder)
      (let [scopes #{"agent:query:run" "agent:sql:run"}]
        (is (refused? (ui-post! scopes "dataset" (native-query))))
        (testing "while an MBQL query on the same database runs, so it is the native permission that refuses"
          (is (= 202 (:status (ui-post! scopes "dataset" (venues-query)))))))))
  (testing "control: the same native query runs when rasta may write SQL"
    (mt/with-full-data-perms-for-all-users!
      (let [response (ui-post! #{"agent:query:run" "agent:sql:run"} "dataset" (native-query))]
        (is (= 202 (:status response)))
        (is (= [[1]] (rows response)))))))

(deftest card-source-runs-only-when-the-user-may-read-the-card-test
  (testing "A query whose source is a saved question runs through the credential only if its user may read the
            collection the question lives in"
    (mt/with-full-data-perms-for-all-users!
      (mt/with-temp [:model/Collection {hidden-id :id}   {:name "hidden"}
                     :model/Collection {visible-id :id}  {:name "visible"}
                     :model/Card       {hidden-card :id}  {:collection_id hidden-id :dataset_query (venues-query)}
                     :model/Card       {visible-card :id} {:collection_id visible-id :dataset_query (venues-query)}]
        (mt/with-non-admin-groups-no-collection-perms hidden-id
          (testing "a card in a collection rasta cannot read is refused"
            (let [response (ui-post! #{"agent:query:run"} "dataset" (card-query hidden-card))]
              (is (= 403 (:status response)))
              (is (empty? (rows response)))))
          (testing "control: a card in a collection rasta can read runs"
            (let [response (ui-post! #{"agent:query:run"} "dataset" (card-query visible-card))]
              (is (= 202 (:status response)))
              (is (= 1 (count (rows response)))))))))))

(deftest metadata-and-pivot-show-only-what-the-user-may-see-test
  (testing "query_metadata and pivot run as the credential's user: a table rasta cannot see contributes no metadata
            and no rows"
    (mt/with-no-data-perms-for-all-users!
      (let [metadata (ui-post! #{"agent:query:run"} "dataset/query_metadata" (venues-query))]
        (is (= 200 (:status metadata)))
        (is (empty? (get-in metadata [:body :tables])))
        (is (empty? (get-in metadata [:body :databases]))))
      (let [pivot (ui-post! #{"agent:query:run"} "dataset/pivot" (venues-query))]
        (is (= 403 (:status pivot)))
        (is (empty? (rows pivot))))))
  (testing "control: with permission, query_metadata describes the table"
    (mt/with-full-data-perms-for-all-users!
      (let [metadata (ui-post! #{"agent:query:run"} "dataset/query_metadata" (venues-query))]
        (is (= 200 (:status metadata)))
        (is (some #(= (mt/id :venues) (:id %)) (get-in metadata [:body :tables])))))))

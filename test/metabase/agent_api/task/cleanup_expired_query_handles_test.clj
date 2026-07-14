(ns metabase.agent-api.task.cleanup-expired-query-handles-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [java-time.api :as t]
   [metabase.agent-api.handles :as handles]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- handle!
  [user-id expires-at created-at]
  (let [id (str (random-uuid))]
    (t2/insert! :model/McpQueryHandle
                {:id            id
                 :user_id       user-id
                 :encoded_query (json/encode {:database 1 :stages [{:source-table 2}]})
                 :expires_at    expires-at
                 :created_at    created-at})
    id))

(deftest delete-expired-handles-test
  (mt/with-empty-h2-app-db!
    (let [now       (t/offset-date-time)
          user-id   (mt/user->id :rasta)
          live      (handle! user-id (t/plus now (t/days 1)) now)
          expired   (handle! user-id (t/minus now (t/days 1)) (t/minus now (t/days 15)))
          undated   (handle! user-id nil now)
          stale     (handle! user-id nil (t/minus now (t/days 15)))
          deleted   (handles/delete-expired-handles!)
          surviving (t2/select-fn-set :id :model/McpQueryHandle)]
      (testing "an expired handle, and an expiry-less handle older than the TTL, are both deleted"
        (is (= 2 deleted))
        (is (not (contains? surviving expired)))
        (is (not (contains? surviving stale))))
      (testing "an unexpired handle survives"
        (is (contains? surviving live)))
      (testing "a handle carrying no expiry survives until it is older than the TTL"
        (is (contains? surviving undated))
        (is (some? (handles/read-handle user-id undated))
            "and the sweep leaves it resolvable")))))

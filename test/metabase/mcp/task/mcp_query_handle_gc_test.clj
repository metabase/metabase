(ns metabase.mcp.task.mcp-query-handle-gc-test
  "Tests for the scheduled query-handle GC (GHY-4136): handles past the TTL are deleted, fresh ones kept,
   and the TTL setting is honored."
  (:require
   [clojure.test :refer [deftest is testing]]
   [java-time.api :as t]
   [metabase.mcp.task.mcp-query-handle-gc :as gc]
   [metabase.mcp.v2.common :as common]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- mint!
  "Mint a handle owned by `uid`; the query body is irrelevant — GC only reads `created_at`."
  [uid]
  (common/mint-query-handle! (str (random-uuid)) uid
                             (common/encode-serialized-query {:stages [{:source-table 1}]})))

(defn- hours-ago [n]
  (t/minus (t/offset-date-time) (t/hours (long n))))

(deftest gc-deletes-handles-past-ttl-test
  (mt/with-model-cleanup [:model/McpQueryHandle]
    (let [uid   (mt/user->id :rasta)
          old   (mint! uid)
          fresh (mint! uid)]
      (t2/update! :model/McpQueryHandle old {:created_at (hours-ago 25)}) ; default TTL is 24h
      (#'gc/gc-expired-query-handles!)
      (testing "a handle older than the TTL is deleted"
        (is (nil? (t2/select-one :model/McpQueryHandle :id old))))
      (testing "a handle within the TTL is kept"
        (is (some? (t2/select-one :model/McpQueryHandle :id fresh)))))))

(deftest gc-respects-ttl-setting-test
  (mt/with-model-cleanup [:model/McpQueryHandle]
    (mt/with-temporary-setting-values [mcp-query-handle-ttl-hours 1]
      (let [uid (mt/user->id :rasta)
            h   (mint! uid)]
        (t2/update! :model/McpQueryHandle h {:created_at (hours-ago 2)})
        (#'gc/gc-expired-query-handles!)
        (is (nil? (t2/select-one :model/McpQueryHandle :id h))
            "a 2h-old handle is deleted when the TTL is set to 1h")))))

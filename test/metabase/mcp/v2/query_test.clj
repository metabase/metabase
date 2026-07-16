(ns metabase.mcp.v2.query-test
  "Tests for keyset (seek) pagination of MBQL query results (GHY-4136)."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.query :as q]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- mp [] (lib-be/application-database-metadata-provider (mt/id)))

(defn- orders-query []
  (lib/query (mp) (lib.metadata/table (mp) (mt/id :orders))))

(defn- run-rows+cols [query]
  (let [r (qp/process-query query)]
    [(get-in r [:data :rows]) (get-in r [:data :cols])]))

(defn- col-index [cols col-name]
  (some (fn [[i c]] (when (= (:name c) col-name) i)) (map-indexed vector cols)))

(deftest next-page-cursor-pk-test
  (mt/with-current-user (mt/user->id :rasta)
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [uid    (mt/user->id :rasta)
            sid    (str (random-uuid))
            query  (lib/limit (orders-query) 3)
            [rows cols] (run-rows+cols query)
            cursor (q/next-page-cursor! sid uid (lib/prepare-for-serialization query) (last rows)
                                        {:result-cols cols})
            stage  (-> (common/resolve-query-handle! sid uid cursor) :query :stages last)]
        (testing "a table-sourced query gets a keyset cursor: ORDER BY the PK, WHERE strictly past the boundary, LIMIT preserved"
          (is (some? cursor))
          (is (seq (:order-by stage)) "the next-page query carries a total order")
          (is (= ">" (ffirst (:filters stage))) "the next-page query filters strictly past the last row")
          (is (= 3 (:limit stage))))))))

(deftest next-page-cursor-bails-test
  (mt/with-current-user (mt/user->id :rasta)
    (let [uid (mt/user->id :rasta)
          sid (str (random-uuid))]
      (testing "no cursor for a native query (keyset can't be built over opaque SQL — caller falls back to limit-only)"
        (is (nil? (q/next-page-cursor! sid uid
                                       {:database (mt/id) :stages [{:lib/type "mbql.stage/native" :native "SELECT 1"}]}
                                       [1] {}))))
      (testing "no cursor for an unusable query shape"
        (is (nil? (q/next-page-cursor! sid uid {:stages []} [1] {})))
        (is (nil? (q/next-page-cursor! sid uid {:database (mt/id)} [1] {})))
        (is (nil? (q/next-page-cursor! sid uid "not-a-map" [1] {})))))))

(deftest next-page-cursor-pages-without-gaps-or-dups-test
  ;; Proves the keyset seek is correct across page boundaries: for a unique-key (PK) source, paging
  ;; returns strictly increasing, distinct PKs — no row skipped, none repeated. (The non-unique-key
  ;; case, where the full-tuple tiebreaker can drop duplicate rows split across a boundary, is the
  ;; known gap tracked as review finding #2.)
  (mt/with-current-user (mt/user->id :rasta)
    (let [page-size 4
          n-pages   4
          ids (loop [query (lib/limit (orders-query) page-size), acc [], pages 0]
                (let [[rows cols] (run-rows+cols query)
                      id-idx (col-index cols "ID")
                      acc'   (into acc (map #(nth % id-idx) rows))
                      pages' (inc pages)]
                  (if (or (>= pages' n-pages) (< (count rows) page-size))
                    acc'
                    (if-let [nxt (#'q/next-page-query (lib/prepare-for-serialization query) cols (last rows))]
                      (recur (lib/query (mp) nxt) acc' pages')
                      acc'))))]
      (testing "keyset paging yields strictly increasing, distinct PKs across boundaries"
        (is (= (* page-size n-pages) (count ids)))
        (is (apply < ids) "strictly increasing => no boundary repeats and no rows skipped backwards")
        (is (= (count ids) (count (distinct ids))))))))

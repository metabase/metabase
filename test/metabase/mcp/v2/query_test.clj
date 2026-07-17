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

(defn- products-orders-fanout-query
  "Products fanned out 1:many onto their Orders: the same source-table PK spans many result
   rows, ordered by a non-unique column (TITLE) so page boundaries land inside a PK group.
   The projection is restricted to keyset-safe columns — Products.ID, Products.TITLE, and the
   joined Orders.ID, which is unique per result row and so serves as the completeness check."
  []
  (let [provider (mp)
        orders   (lib.metadata/table provider (mt/id :orders))
        p-id     (lib.metadata/field provider (mt/id :products :id))
        p-title  (lib.metadata/field provider (mt/id :products :title))
        o-id     (lib.metadata/field provider (mt/id :orders :id))
        o-pid    (lib.metadata/field provider (mt/id :orders :product_id))]
    (-> (lib/query provider (lib.metadata/table provider (mt/id :products)))
        (lib/join (-> (lib/join-clause orders [(lib/= p-id o-pid)])
                      (lib/with-join-fields [o-id])))
        (lib/filter (lib/<= p-id 2))
        (lib/order-by p-title :asc)
        (lib/with-fields [p-id p-title]))))

(deftest next-page-cursor-fan-out-join-test
  ;; The contract pinned here is "no silent gaps": whenever a cursor IS minted, following the
  ;; chain must serve exactly the unpaged result set — and when that can't be guaranteed, the
  ;; mechanism must mint nothing (the caller then sees a truncated page with no cursor: an
  ;; explicit dead end, not a gap). A fan-out join breaks both mint-time tiebreakers: the
  ;; source-table PK repeats across result rows (a PK-only boundary drops the boundary row's
  ;; remaining fan-out rows), and the full-tuple fallback imposes a tie order the already-served
  ;; first page never ran under (dropping AND repeating rows around each boundary).
  (mt/with-current-user (mt/user->id :rasta)
    (let [query     (products-orders-fanout-query)
          o-id-of   (fn [row] (nth row 2))
          reference (let [[rows _] (run-rows+cols query)] (mapv o-id-of rows))
          page-size 50
          {:keys [paged refused?]}
          (loop [q (lib/limit query page-size), acc [], pages 1]
            (let [[rows cols] (run-rows+cols q)
                  acc' (into acc (map o-id-of) rows)]
              (if (or (< (count rows) page-size) (> pages 10))
                {:paged acc' :refused? false}
                (if-let [nxt (#'q/next-page-query (lib/prepare-for-serialization q) cols (last rows))]
                  (recur (lib/query (mp) nxt) acc' (inc pages))
                  {:paged acc' :refused? true}))))]
      (testing "GHY-4142: paging a 1:many join must either serve every result row exactly once or mint no cursor at all"
        (is (> (count reference) page-size)
            "fixture must span multiple pages, or no boundary is exercised")
        (is (= (count paged) (count (distinct paged)))
            "no row served twice")
        (when-not refused?
          (is (= (count reference) (count paged))
              "rows served across a completed cursor chain equal the unpaged run — a shortfall means a page boundary dropped fan-out rows")
          (is (= [] (->> reference (remove (set paged)) sort vec))
              "every unpaged row appears on some page — ids listed here were dropped at a boundary")))
      (testing "GHY-4142: a fan-out page refuses the cursor — sound fan-out paging would need the total order imposed on the first page's own execution, which the cursor mint can't do retroactively"
        (is (true? refused?))))))

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

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
            ;; the executed query carries the total order — that is what makes it continuable
            query  (q/with-total-order (lib/prepare-for-serialization (lib/limit (orders-query) 3)))
            [rows cols] (run-rows+cols (lib/query (mp) query))
            cursor (q/next-page-cursor! sid uid query (last rows) {:result-cols cols})
            stage  (-> (common/resolve-query-handle! sid uid cursor) :query :stages last)]
        (testing "a table-sourced query gets a keyset cursor: ORDER BY the PK, WHERE strictly past the boundary, LIMIT preserved"
          (is (some? cursor))
          (is (seq (:order-by stage)) "the next-page query carries a total order")
          (is (= ">" (ffirst (:filters stage))) "the next-page query filters strictly past the last row")
          (is (= 3 (:limit stage))))))))

(deftest with-total-order-test
  ;; The seam this closes: a page served under a partial order broke its ties however the engine
  ;; happened to, while a keyset built afterwards imposes its own tie order — around a boundary
  ;; inside a tie group the two disagree, dropping rows and repeating others. An unordered query
  ;; is the extreme case (the whole result is one tie group), and it is what an agent writes by
  ;; default. So the order goes on before execution, and the mint refuses anything else.
  (mt/with-current-user (mt/user->id :rasta)
    (let [uid        (mt/user->id :rasta)
          sid        (str (random-uuid))
          unordered  (lib/prepare-for-serialization (lib/limit (orders-query) 3))
          ordered    (q/with-total-order unordered)
          last-stage #(-> % :stages last)]
      (testing "GHY-4142: an unordered query comes back ordered by the PK — a total order"
        (is (empty? (:order-by (last-stage unordered))))
        (is (= 1 (count (:order-by (last-stage ordered))))))
      (testing "GHY-4142: idempotent — a second pass finds the tiebreakers already ordered"
        (is (= ordered (q/with-total-order ordered))))
      (testing "GHY-4142: a query whose own order is already total is left alone"
        (let [by-pk (lib/prepare-for-serialization
                     (-> (orders-query)
                         (lib/order-by (lib.metadata/field (mp) (mt/id :orders :id)) :asc)
                         (lib/limit 3)))]
          (is (= by-pk (q/with-total-order by-pk)))))
      (testing "GHY-4142: only the ordered query is continuable — a page served unordered has no continuation to seek"
        (let [[rows cols] (run-rows+cols (lib/query (mp) unordered))]
          (is (nil? (q/next-page-cursor! sid uid unordered (last rows) {:result-cols cols}))))
        (let [[rows cols] (run-rows+cols (lib/query (mp) ordered))]
          (mt/with-model-cleanup [:model/McpQueryHandle]
            (is (some? (q/next-page-cursor! sid uid ordered (last rows) {:result-cols cols})))))))))

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
  ;; explicit dead end, not a gap). Imposing the total order before execution — what makes an
  ;; unjoined page continuable — doesn't rescue this one: the source-table PK repeats across
  ;; result rows, so ordering by it still leaves ties, and the full-tuple fallback can't break
  ;; them either since fanned-out rows can be wholly identical.
  (mt/with-current-user (mt/user->id :rasta)
    (let [query     (products-orders-fanout-query)
          o-id-of   (fn [row] (nth row 2))
          reference (let [[rows _] (run-rows+cols query)] (mapv o-id-of rows))
          page-size 50
          {:keys [paged refused?]}
          (loop [q     (q/with-total-order (lib/prepare-for-serialization (lib/limit query page-size)))
                 acc   []
                 pages 1]
            (let [[rows cols] (run-rows+cols (lib/query (mp) q))
                  acc' (into acc (map o-id-of) rows)]
              (if (or (< (count rows) page-size) (> pages 10))
                {:paged acc' :refused? false}
                (if-let [nxt (#'q/next-page-query q cols (last rows))]
                  (recur (q/with-total-order nxt) acc' (inc pages))
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
      (testing "GHY-4142: a fan-out page refuses the cursor — no order derivable from metadata is total when the PK repeats across rows"
        (is (true? refused?)))
      (testing "GHY-4142: and it is refused the imposed order too — sorting by a repeating PK buys nothing"
        (let [joined (lib/prepare-for-serialization (lib/limit query page-size))]
          (is (= joined (q/with-total-order joined))))))))

(deftest next-page-cursor-sourced-card-fan-out-test
  ;; The join that fans the result out need not be in the payload: a query sourcing a saved
  ;; question inherits that question's joins, and the payload shows only `:source-card`. The
  ;; refusal has to follow the source through, or the hole reopens one indirection away.
  (mt/with-current-user (mt/user->id :rasta)
    (let [joined  (-> (lib/query (mp) (lib.metadata/table (mp) (mt/id :products)))
                      (lib/join (lib/join-clause (lib.metadata/table (mp) (mt/id :orders))
                                                 [(lib/= (lib.metadata/field (mp) (mt/id :products :id))
                                                         (lib.metadata/field (mp) (mt/id :orders :product_id)))])))
          plain   (lib/query (mp) (lib.metadata/table (mp) (mt/id :products)))]
      (mt/with-temp [:model/Card {joined-id :id} {:dataset_query (lib/->legacy-MBQL joined)}
                     :model/Card {plain-id :id}  {:dataset_query (lib/->legacy-MBQL plain)}]
        (let [sourcing  (fn [card-id]
                          (-> (lib/query (mp) (lib.metadata/card (mp) card-id))
                              (lib/limit 5)
                              lib/prepare-for-serialization))
              page-of   (fn [serialized] (run-rows+cols (lib/query (mp) serialized)))]
          (testing "GHY-4142: sourcing a saved question that joins refuses the cursor, same as an inline join"
            (let [serialized  (sourcing joined-id)
                  [rows cols] (page-of serialized)]
              (is (true? (#'q/fan-out-join? (mp) serialized)))
              (is (nil? (#'q/next-page-query serialized cols (last rows))))))
          ;; asserted on the guard rather than end-to-end: a card-sourced query has no projected
          ;; source-table PK, so it falls to the full-tuple tiebreaker and bails for its own
          ;; reasons (PRODUCTS.CREATED_AT doesn't round-trip). What matters here is that the
          ;; fan-out refusal follows the source through instead of blanket-refusing every card.
          (testing "GHY-4142: sourcing a join-free saved question is not a fan-out"
            (is (false? (#'q/fan-out-join? (mp) (sourcing plain-id))))))))))

(deftest next-page-cursor-pages-without-gaps-or-dups-test
  ;; Proves the keyset seek is correct across page boundaries: for a unique-key (PK) source, paging
  ;; returns strictly increasing, distinct PKs — no row skipped, none repeated. (The non-unique-key
  ;; case, where the full-tuple tiebreaker can drop duplicate rows split across a boundary, is the
  ;; known gap tracked as review finding #2.)
  (mt/with-current-user (mt/user->id :rasta)
    (let [page-size 4
          n-pages   4
          ids (loop [query (q/with-total-order
                             (lib/prepare-for-serialization (lib/limit (orders-query) page-size)))
                     acc   []
                     pages 0]
                (let [[rows cols] (run-rows+cols (lib/query (mp) query))
                      id-idx (col-index cols "ID")
                      acc'   (into acc (map #(nth % id-idx) rows))
                      pages' (inc pages)]
                  (if (or (>= pages' n-pages) (< (count rows) page-size))
                    acc'
                    (if-let [nxt (#'q/next-page-query query cols (last rows))]
                      (recur nxt acc' pages')
                      acc'))))]
      (testing "keyset paging yields strictly increasing, distinct PKs across boundaries"
        (is (= (* page-size n-pages) (count ids)))
        (is (apply < ids) "strictly increasing => no boundary repeats and no rows skipped backwards")
        (is (= (count ids) (count (distinct ids))))))))

(ns metabase-enterprise.curated-search.reconcile-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.curated-search.index-table :as index-table]
   [metabase-enterprise.curated-search.reconcile :as reconcile]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.test :as mt]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest content-hash-test
  (let [row {:search_prompt "p" :usage_instructions "u" :entity {:model "table" :id 1}
             :verified false}]
    (testing "equal rows hash equal; nil and absent usage_instructions hash like empty"
      (is (= (reconcile/content-hash row) (reconcile/content-hash row)))
      (is (= (reconcile/content-hash (assoc row :usage_instructions nil))
             (reconcile/content-hash (assoc row :usage_instructions "")))))
    (testing "every mirror-relevant field changes the hash"
      (let [h (reconcile/content-hash row)]
        (doseq [variant [(assoc row :search_prompt "p2")
                         (assoc row :usage_instructions "u2")
                         (assoc row :entity {:model "table" :id 2})
                         (assoc row :verified true)]]
          (is (not= h (reconcile/content-hash variant)) (pr-str variant)))))))

(deftest format-embedding-rejects-invalid-values-test
  (testing "non-numbers, NaN and infinities are rejected before they reach a raw SQL literal"
    (doseq [bad [Double/NaN Double/POSITIVE_INFINITY Double/NEGATIVE_INFINITY "0.1"]]
      (is (thrown-with-msg? Exception #"invalid value"
                            (index-table/format-embedding [0.1 bad 0.3]))
          (pr-str bad)))
    (is (string? (index-table/format-embedding [0.1 -0.2 0.3])))))

(defmacro ^:private with-isolated-mirror
  "Run `body` with isolated pgvector tables bound and dropped afterwards, binding `ds-sym` to the
  pgvector datasource. Skips the body entirely when no pgvector store is configured."
  [[ds-sym] & body]
  `(when semantic.db.datasource/db-url
     (let [suffix# (System/nanoTime)
           ~ds-sym (semantic.db.datasource/ensure-initialized-data-source!)]
       (binding [index-table/*vectors-table* (str "curated_search_index_test_" suffix#)
                 index-table/*meta-table*    (str "curated_search_index_meta_test_" suffix#)]
         (try
           ~@body
           (finally
             (jdbc/execute! ~ds-sym [(str "DROP TABLE IF EXISTS "
                                          index-table/*vectors-table* ", "
                                          index-table/*meta-table*)])))))))

(defn- mirror-rows [ds]
  (jdbc/execute! ds
                 [(format "SELECT index_id, search_prompt, verified, content_hash FROM \"%s\" ORDER BY index_id"
                          index-table/*vectors-table*)]
                 {:builder-fn jdbc.rs/as-unqualified-lower-maps}))

(deftest ^:sequential reconcile-lifecycle-test
  (with-isolated-mirror [ds]
    (let [model semantic.tu/mock-embedding-model]
      (mt/with-temp [:model/CuratedSearchEntry {id-1 :id}
                     {:search_prompt "monthly revenue"
                      :entity {:model "table" :id 1}}
                     :model/CuratedSearchEntry {id-2 :id}
                     {:search_prompt "orders and customers" :verified true
                      :entity {:model "table" :id 2}}]
        (let [appdb-total (t2/count :model/CuratedSearchEntry)]
          (testing "first run mirrors every appdb row"
            (is (=? {:upserted appdb-total :deleted 0 :unchanged 0}
                    (reconcile/reconcile! ds model)))
            (is (=? {id-1 {:search_prompt "monthly revenue" :verified false}
                     id-2 {:search_prompt "orders and customers" :verified true}}
                    (-> (into {} (map (juxt :index_id identity)) (mirror-rows ds))
                        (select-keys [id-1 id-2])))))
          (testing "an unchanged second run embeds and writes nothing"
            (is (=? {:upserted 0 :deleted 0 :unchanged appdb-total}
                    (reconcile/reconcile! ds model))))
          (testing "an updated row is re-embedded; the rest stay unchanged"
            (t2/update! :model/CuratedSearchEntry id-1 {:verified true})
            (is (=? {:upserted 1 :deleted 0 :unchanged (dec appdb-total)}
                    (reconcile/reconcile! ds model)))
            (is (=? {:verified true}
                    (->> (mirror-rows ds) (filter #(= id-1 (:index_id %))) first))))
          (testing "a write that bypassed the hooks entirely is still repaired (self-healing)"
            ;; Tamper with the mirror behind the reconciler's back.
            (jdbc/execute! ds [(format "UPDATE \"%s\" SET content_hash = 'bogus' WHERE index_id = %d"
                                       index-table/*vectors-table* id-2)])
            (is (=? {:upserted 1 :deleted 0}
                    (reconcile/reconcile! ds model))))))
      (testing "rows deleted from the appdb are removed from the mirror as orphans"
        ;; The with-temp rows above are gone now.
        (is (=? {:upserted 0 :deleted 2}
                (reconcile/reconcile! ds model)))))))

(deftest ^:sequential rebuild-on-model-change-test
  (with-isolated-mirror [ds]
    (let [model semantic.tu/mock-embedding-model]
      (mt/with-temp [:model/CuratedSearchEntry _
                     {:search_prompt "monthly revenue"
                      :entity {:model "table" :id 1}}]
        (let [appdb-total (t2/count :model/CuratedSearchEntry)]
          (testing "populate the mirror under the original model"
            (is (=? {:upserted appdb-total} (reconcile/reconcile! ds model))))
          (testing "a model-identity change drops the vectors table and the next run re-embeds everything"
            (let [new-model (assoc model :model-name "model-v2")]
              (is (= :rebuilt (index-table/ensure-tables! ds new-model)))
              (is (= [] (mirror-rows ds)))
              (is (=? {:upserted appdb-total :deleted 0 :unchanged 0}
                      (reconcile/reconcile! ds new-model)))
              (testing "a schema-version mismatch alone also triggers the rebuild"
                ;; stale-write the meta row, as if the table were built by an older code version
                (jdbc/execute! ds [(format "UPDATE \"%s\" SET schema_version = schema_version - 1"
                                           index-table/*meta-table*)])
                (is (= :rebuilt (index-table/ensure-tables! ds new-model)))
                (is (= [] (mirror-rows ds))))
              (testing "the rebuild heals the meta row, so it doesn't recur on the next sync"
                (is (= :ok (index-table/ensure-tables! ds new-model)))))))))))

(ns metabase.search.models-test
  "Pins the delete-capture wiring in [[metabase.search.models]]: deletes now enqueue re-derivation
  messages via the [[metabase.app-db.dml-capture]] seam instead of firing no hooks at all."
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.dml-capture :as dml-capture]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.engine :as search.engine]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

;; Search handoff is deliberately after commit. `with-temp` normally wraps its body in a rollback-only
;; transaction, so these integration tests need real commits; `with-temp` still performs explicit cleanup.
#_{:clj-kondo/ignore [:metabase/validate-deftest]}
(use-fixtures :each
  (fn [f]
    (mt/test-helpers-set-global-values!
      (binding [search.ingestion/*force-sync* true]
        (f)))))

(deftest delete-enqueues-one-bulk-update-test
  (testing "deleting a card enqueues exactly one re-derivation message, covering every model it feeds"
    (let [calls (atom [])]
      (mt/with-dynamic-fn-redefs [search.ingestion/ingest-maybe-async!
                                  (fn [updates] (swap! calls conj updates))]
        (mt/with-temp [:model/Card {id :id} {}]
          ;; the temp card's own creation enqueues an unrelated message via the after-insert hook; only the
          ;; delete's message is under test.
          (reset! calls [])
          (t2/delete! :model/Card id)
          (is (=? [#{["card" [:= id :this.id]]
                     ["dataset" [:= id :this.id]]
                     ["metric" [:= id :this.id]]
                     ["action" [:= id :this.model_id]]
                     ["indexed-entity" [:= id :model_index.model_id]]}]
                  (mapv set @calls))))))))

(deftest capture-fields-disabled-without-engine-test
  (testing "capture-fields is skipped entirely (no pre-select) when no search engine is active"
    (mt/with-dynamic-fn-redefs [search.engine/active-engines (constantly [])]
      (is (nil? (dml-capture/capture-fields :model/Card :delete))))))

(deftest only-delete-capture-is-enabled-test
  (testing "only :delete is wired up in this PR; insert/update capture-fields stay nil even with engines on"
    (is (some? (seq (search.engine/active-engines))) "this test needs an active engine to be meaningful")
    (is (nil? (dml-capture/capture-fields :model/Card :insert)))
    (is (nil? (dml-capture/capture-fields :model/Card :update)))))

(deftest ^:synchronized purge-one-on-delete-test
  (testing "deleting an indexed card purges its index row (appdb engine)"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Card {id :id} {:name "Temp Purge Card"}]
        (is (= 1 (t2/count (search.index/active-table) :model "card" :model_id (str id))))
        (t2/delete! :model/Card id)
        (is (= 0 (t2/count (search.index/active-table) :model "card" :model_id (str id))))))))

(deftest ^:synchronized purge-bulk-on-delete-test
  (testing "bulk deletion purges every affected row (cards first, then their now-empty collection)"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Temp Bulk Collection"}
                     :model/Card       {c1 :id}      {:name "Bulk Card 1" :collection_id coll-id}
                     :model/Card       {c2 :id}      {:name "Bulk Card 2" :collection_id coll-id}]
        (is (= 2 (t2/count (search.index/active-table) :model "card" :model_id [:in [(str c1) (str c2)]])))
        (is (= 1 (t2/count (search.index/active-table) :model "collection" :model_id (str coll-id))))
        ;; cards must go first: a collection with contents refuses deletion.
        (t2/delete! :model/Card :collection_id coll-id)
        (t2/delete! :model/Collection coll-id)
        (is (= 0 (t2/count (search.index/active-table) :model "card" :model_id [:in [(str c1) (str c2)]])))
        (is (= 0 (t2/count (search.index/active-table) :model "collection" :model_id (str coll-id))))))))

(deftest delete-of-a-joined-model-enqueues-the-fed-models-test
  (testing "deleting a row that only feeds other models' docs (not itself searchable) enqueues re-derivation
            for every search-model it feeds, keyed off the review's own captured columns"
    (let [calls (atom [])]
      (mt/with-dynamic-fn-redefs [search.ingestion/ingest-maybe-async!
                                  (fn [updates] (swap! calls conj updates))]
        (mt/with-temp [:model/Card             {card-id :id} {}
                       :model/ModerationReview {mr-id :id}   {:moderated_item_type "card"
                                                              :moderated_item_id   card-id
                                                              :moderator_id        (mt/user->id :crowberto)
                                                              :status              "verified"
                                                              :most_recent         true}]
          (reset! calls [])
          (t2/delete! :model/ModerationReview mr-id)
          (let [where [:and [:= "card" "card"] [:= card-id :this.id] [:= true true]]]
            (is (=? [#{["card" where] ["dataset" where] ["metric" where]}]
                    (mapv set @calls)))))))))

(deftest rollback-discards-handoff-and-leaves-the-row-test
  (testing "a rolled-back delete discards its post-commit handoff, and the row survives"
    (let [calls (atom [])]
      (mt/with-dynamic-fn-redefs [search.ingestion/ingest-maybe-async!
                                  (fn [updates] (swap! calls conj updates))]
        (mt/with-temp [:model/Card {id :id} {}]
          (reset! calls [])
          (is (thrown? clojure.lang.ExceptionInfo
                       (t2/with-transaction [_conn]
                         (t2/delete! :model/Card id)
                         (throw (ex-info "boom" {})))))
          (is (empty? @calls))
          (is (t2/exists? :model/Card id)))))))

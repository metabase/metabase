(ns metabase.search.models-test
  "Pins the DML-capture wiring in [[metabase.search.models]]: all three operations now enqueue re-derivation
  messages via the [[metabase.app-db.dml-capture]] seam, statement-level, instead of firing no hooks
  (deletes), every hook unconditionally (updates, via the old per-row after-update), or per-row with a
  full-row re-select (inserts, via the old per-row after-insert)."
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.dml-capture :as dml-capture]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.engine :as search.engine]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.util.json :as json]
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
          ;; the temp card's own creation enqueues an unrelated insert-capture message; only the delete's
          ;; message is under test.
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
      (is (nil? (dml-capture/capture-fields :model/Card :delete)))
      (is (nil? (dml-capture/capture-fields :model/Card :update)))
      (is (nil? (dml-capture/capture-fields :model/Card :insert))))))

(deftest capture-fields-cover-all-ops-test
  (testing "all three ops are wired up via hook-where-fields"
    (is (some? (seq (search.engine/active-engines))) "this test needs an active engine to be meaningful")
    (is (= #{:id} (dml-capture/capture-fields :model/Card :insert)))
    (is (= #{:id} (dml-capture/capture-fields :model/Card :delete)))
    (is (= #{:id} (dml-capture/capture-fields :model/Card :update)))))

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

(deftest update-enqueues-one-bulk-update-test
  (testing "updating a single card enqueues exactly one re-derivation message"
    (let [calls (atom [])]
      (mt/with-dynamic-fn-redefs [search.ingestion/ingest-maybe-async!
                                  (fn [updates] (swap! calls conj updates))]
        (mt/with-temp [:model/Card {id :id} {}]
          ;; the temp card's own creation enqueues an unrelated message via the after-insert hook; only the
          ;; update's message is under test.
          (reset! calls [])
          (t2/update! :model/Card id {:description "a new description"})
          (is (=? [#{["card" [:= id :this.id]]
                     ["dataset" [:= id :this.id]]
                     ["metric" [:= id :this.id]]}]
                  (mapv set @calls))))))))

(deftest update-filters-on-changed-fields-test
  (testing "changes to fields no hook cares about don't reach the action/indexed-entity joins, which key off
            :name but not :cache_ttl"
    (let [calls (atom [])]
      (mt/with-dynamic-fn-redefs [search.ingestion/ingest-maybe-async!
                                  (fn [updates] (swap! calls conj updates))]
        (mt/with-temp [:model/Card {id :id} {}]
          (reset! calls [])
          (t2/update! :model/Card id {:cache_ttl 3600})
          (is (=? [#{["card" [:= id :this.id]]
                     ["dataset" [:= id :this.id]]
                     ["metric" [:= id :this.id]]}]
                  (mapv set @calls)))))))
  (testing "a :name change also feeds the action and indexed-entity joins"
    (let [calls (atom [])]
      (mt/with-dynamic-fn-redefs [search.ingestion/ingest-maybe-async!
                                  (fn [updates] (swap! calls conj updates))]
        (mt/with-temp [:model/Card {id :id} {}]
          (reset! calls [])
          (t2/update! :model/Card id {:name "renamed"})
          (is (=? [#{["card" [:= id :this.id]]
                     ["dataset" [:= id :this.id]]
                     ["metric" [:= id :this.id]]
                     ["action" [:= id :this.model_id]]
                     ["indexed-entity" [:= id :model_index.model_id]]}]
                  (mapv set @calls))))))))

(deftest bulk-update-enqueues-one-call-test
  (testing "a bulk update matching multiple cards still enqueues in exactly one call, covering every row"
    (let [calls (atom [])]
      (mt/with-dynamic-fn-redefs [search.ingestion/ingest-maybe-async!
                                  (fn [updates] (swap! calls conj updates))]
        (mt/with-temp [:model/Collection {coll-id :id} {}
                       :model/Card       {c1 :id}      {:collection_id coll-id}
                       :model/Card       {c2 :id}      {:collection_id coll-id}]
          (reset! calls [])
          (t2/update! :model/Card :collection_id coll-id {:archived true})
          (is (= 1 (count @calls)))
          (is (=? #{["card" [:= c1 :this.id]] ["dataset" [:= c1 :this.id]] ["metric" [:= c1 :this.id]]
                    ["card" [:= c2 :this.id]] ["dataset" [:= c2 :this.id]] ["metric" [:= c2 :this.id]]}
                  (set (first @calls)))))))))

(deftest ^:synchronized update-runs-exactly-three-statements-test
  (testing "capturing an update runs exactly three statements: the before-update tool's full-row select, the
            narrow capture select, and the update itself — no extra full-row re-select afterward.
            Card has no model-specific after-update hook of its own; Database/Transform/Document do and would
            add their own statements on top of these three."
    (mt/with-dynamic-fn-redefs [search.ingestion/ingest-maybe-async! (fn [_updates] nil)]
      (mt/with-temp [:model/Card {id :id} {}]
        (t2/with-call-count [call-count]
          (t2/update! :model/Card id {:description "a new description"})
          (is (= 3 (call-count))))))))

(deftest ^:synchronized update-of-a-joined-model-refreshes-the-index-test
  (testing "renaming a card's collection is reflected in the card's indexed display_data (appdb engine)"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Original Name"}
                     :model/Card       {id :id}      {:name "E2E Card" :collection_id coll-id}]
        (t2/update! :model/Collection coll-id {:name "Renamed Name"})
        (is (= "Renamed Name"
               (-> (t2/select-one-fn :display_data (search.index/active-table) :model "card" :model_id (str id))
                   json/decode
                   (get "collection_name"))))))))

(deftest insert-enqueues-one-bulk-update-test
  (testing "a PK-only multi-row insert stays one statement and enqueues one re-derivation batch"
    (let [calls (atom [])]
      (mt/with-dynamic-fn-redefs [search.ingestion/ingest-maybe-async!
                                  (fn [updates] (swap! calls conj updates))]
        (mt/with-temp [:model/Collection {coll-id :id} {}]
          (reset! calls [])
          (let [creator-id (mt/user->id :crowberto)]
            (t2/with-call-count [call-count]
              (is (= 3 (t2/insert! :model/Document
                                   (for [i (range 3)]
                                     {:name          (str "Ins Capture Doc " i)
                                      :collection_id coll-id
                                      :document      "{}"
                                      :content_type  "application/json"
                                      :creator_id    creator-id
                                      :created_at    :%now
                                      :updated_at    :%now}))))
              (is (= 1 (call-count))))
            (is (= 1 (count @calls)))
            (is (= 3 (count (set (first @calls)))))
            (is (every? (fn [[search-model where]]
                          (and (= "document" search-model)
                               (= :this.id (last where))))
                        (first @calls)))))))))

(deftest insert-adds-no-statements-test
  (testing "a captured single-row insert runs exactly one statement: the pk-returning INSERT, with no
            follow-up full-row select (the old per-row after-insert forced INSERT + SELECT *)"
    (mt/with-dynamic-fn-redefs [search.ingestion/ingest-maybe-async! (fn [_updates] nil)]
      (mt/with-temp [:model/Collection {coll-id :id} {}]
        ;; resolved outside the counted block: cold, the user lookup itself issues queries.
        (let [creator-id (mt/user->id :crowberto)]
          (t2/with-call-count [call-count]
            (t2/insert! :model/Document {:name          "Ins Capture Solo"
                                         :collection_id coll-id
                                         :document      "{}"
                                         :content_type  "application/json"
                                         :creator_id    creator-id
                                         :created_at    :%now
                                         :updated_at    :%now})
            (is (= 1 (call-count)))))))))

(deftest ^:synchronized insert-indexes-new-rows-test
  (testing "with-temp creation (insert-returning-instances!) still lands rows in the index (appdb engine)"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Card {id :id} {:name "Insert Capture E2E Card"}]
        (is (= 1 (t2/count (search.index/active-table) :model "card" :model_id (str id))))))))

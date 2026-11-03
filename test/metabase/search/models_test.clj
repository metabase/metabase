(ns ^:synchronized metabase.search.models-test
  "Pins the delete-capture wiring in [[metabase.search.models]]: a delete enqueues re-derivation messages through
  the [[metabase.app-db.dml-capture]] seam."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.app-db.dml-capture :as dml-capture]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.core :as search]
   [metabase.search.engine :as search.engine]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

;; `with-appdb-search-if-available-without-fallback` reads search tables before any `with-temp` has set up the app
;; database.
(use-fixtures :once (fixtures/initialize :db :test-users))

;; Search handoff is deliberately after commit. `with-temp` normally wraps its body in a rollback-only
;; transaction, so these integration tests need real commits; `with-temp` still performs explicit cleanup.
(use-fixtures :each
  (fn [f]
    (mt/test-helpers-set-global-values!
      (binding [search.ingestion/*force-sync* true]
        (f)))))

(deftest delete-enqueues-one-bulk-update-test
  (testing "deleting a card enqueues exactly one re-derivation message, covering every model it feeds"
    (search.tu/with-appdb-search-if-available-without-fallback
      (let [calls (atom [])]
        (mt/with-dynamic-fn-redefs [search.ingestion/ingest-maybe-async!
                                    (fn [updates] (swap! calls conj updates))]
          (mt/with-temp [:model/Card {id :id} {}]
            ;; the temp card's own creation enqueues an unrelated message via the after-insert hook; only the
            ;; delete's message is under test.
            (reset! calls [])
            (t2/delete! :model/Card :id id)
            (is (=? [#{["card" [:= id :this.id]]
                       ["dataset" [:= id :this.id]]
                       ["metric" [:= id :this.id]]
                       ["action" [:= id :this.model_id]]
                       ["indexed-entity" [:= id :model_index.model_id]]}]
                    (mapv set @calls)))))))))

(deftest capture-fields-disabled-without-engine-test
  (testing "capture-fields is skipped entirely (no pre-select) when no search engine is active"
    (mt/with-dynamic-fn-redefs [search.engine/active-engines (constantly [])]
      (is (nil? (dml-capture/capture-fields :model/Card :delete))))))

(deftest capture-fields-disabled-with-updates-test
  (testing "capture is skipped while search updates are disabled, as for tests against an old schema"
    (binding [search.ingestion/*disable-updates* true]
      (is (nil? (dml-capture/capture-fields :model/Card :delete))))))

(deftest only-delete-capture-is-enabled-test
  (testing "only :delete is captured; inserts and updates keep their row-level hooks"
    (search.tu/with-appdb-search-if-available-without-fallback
      (is (some? (dml-capture/capture-fields :model/Card :delete)))
      (is (nil? (dml-capture/capture-fields :model/Card :insert)))
      (is (nil? (dml-capture/capture-fields :model/Card :update))))))

(deftest purge-one-on-delete-test
  (testing "deleting an indexed card purges its index row (appdb engine)"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Card {id :id} {:name "Temp Purge Card"}]
        (is (= 1 (t2/count (search.index/active-table) :model "card" :model_id (str id))))
        (t2/delete! :model/Card :id id)
        (is (= 0 (t2/count (search.index/active-table) :model "card" :model_id (str id))))))))

(deftest purge-bulk-on-delete-test
  (testing "bulk deletion purges every affected row (cards first, then their now-empty collection)"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Temp Bulk Collection"}
                     :model/Card       {c1 :id}      {:name "Bulk Card 1", :collection_id coll-id}
                     :model/Card       {c2 :id}      {:name "Bulk Card 2", :collection_id coll-id}]
        (is (= 2 (t2/count (search.index/active-table) :model "card" :model_id [:in [(str c1) (str c2)]])))
        (is (= 1 (t2/count (search.index/active-table) :model "collection" :model_id (str coll-id))))
        ;; cards must go first: a collection with contents refuses deletion.
        (t2/delete! :model/Card :collection_id coll-id)
        (t2/delete! :model/Collection :id coll-id)
        (is (= 0 (t2/count (search.index/active-table) :model "card" :model_id [:in [(str c1) (str c2)]])))
        (is (= 0 (t2/count (search.index/active-table) :model "collection" :model_id (str coll-id))))))))

(deftest delete-of-a-joined-model-enqueues-the-fed-models-test
  (testing "deleting a row that only feeds other models' documents enqueues re-derivation for each of them"
    (search.tu/with-appdb-search-if-available-without-fallback
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
            (t2/delete! :model/ModerationReview :id mr-id)
            (let [where [:and [:= "card" "card"] [:= card-id :this.id] [:= true true]]]
              (is (=? [#{["card" where] ["dataset" where] ["metric" where]}]
                      (mapv set @calls))))))))))

(deftest purge-cascaded-action-on-model-delete-test
  (testing "deleting a model card purges the index entries for actions the database cascade removed with it"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Card   {card-id :id}   {:name "Temp Action Model", :type :model}
                     :model/Action {action-id :id} {:name     "Temp Cascaded Action"
                                                    :model_id card-id
                                                    :type     :query}]
        (is (= 1 (t2/count (search.index/active-table) :model "action" :model_id (str action-id))))
        ;; action.model_id carries ON DELETE CASCADE, so this removes the action with no toucan statement.
        (t2/delete! :model/Card :id card-id)
        (is (false? (t2/exists? :model/Action :id action-id)))
        (is (= 0 (t2/count (search.index/active-table) :model "action" :model_id (str action-id))))))))

(deftest surviving-cascade-documents-are-not-purged-test
  (testing "a cascade-fed document that still resolves after the delete keeps its index entry"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Card   {keep-card :id}   {:name "Kept Action Model", :type :model}
                     :model/Card   {drop-card :id}   {:name "Dropped Action Model", :type :model}
                     :model/Action {keep-action :id} {:name "Surviving Action", :model_id keep-card, :type :query}
                     :model/Action {drop-action :id} {:name "Doomed Action", :model_id drop-card, :type :query}]
        (t2/delete! :model/Card :id drop-card)
        (is (= 0 (t2/count (search.index/active-table) :model "action" :model_id (str drop-action))))
        (testing "the untouched card's action is left alone"
          (is (= 1 (t2/count (search.index/active-table) :model "action" :model_id (str keep-action)))))))))

(deftest cascading-documents-only-covers-unpurgeable-selectors-test
  (testing "only search-models ingestion cannot purge on its own are enumerated"
    (mt/with-temp [:model/Card   {card-id :id} {:name "Selector Shape Card", :type :model}
                   :model/Action {_ :id}       {:name "Shape Probe Action", :model_id card-id, :type :query}]
      (let [cascading (search/cascading-documents [(t2/select-one :model/Card :id card-id)])]
        (testing "card/dataset/metric resolve from a :this.id selector, so ingestion already handles them"
          (is (empty? (set/intersection #{"card" "dataset" "metric"} (set (keys cascading))))))
        (testing "action is reached through :this.model_id, so its documents are enumerated up front"
          (is (contains? (set (keys cascading)) "action")))))))

(deftest moved-document-is-not-purged-test
  (testing "a document that stops matching the selector without being deleted keeps its index entry"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Card   {from-card :id}  {:name "From Model", :type :model}
                     :model/Card   {to-card :id}    {:name "To Model", :type :model}
                     :model/Action {action-id :id}  {:name "Reparented Action", :model_id from-card, :type :query}]
        (let [cascading (search/cascading-documents [(t2/select-one :model/Card :id from-card)])
              indexed   #(str (t2/select-one-fn :legacy_input (search.index/active-table)
                                                :model "action" :model_id (str action-id)))]
          (is (contains? (set (keys cascading)) "action"))
          (is (str/includes? (indexed) "From Model"))
          ;; Raw query, not t2/update!: a database-level SET NULL fires no toucan hook, so this has to leave the
          ;; action outside the captured selector without any re-indexing of its own.
          (t2/query {:update :action, :set {:model_id to-card}, :where [:= :id action-id]})
          (search/reconcile-cascading-documents! cascading)
          (testing "the document survived the reconcile"
            (is (= 1 (t2/count (search.index/active-table) :model "action" :model_id (str action-id)))))
          (testing "and the relationship that moved was re-derived, not left stale"
            (is (str/includes? (indexed) "To Model"))
            (is (not (str/includes? (indexed) "From Model")))))))))

(deftest reconcile-chunks-reindex-messages-test
  (testing "surviving ids go out in bounded chunks, so one batch cannot blow the bind-parameter limit"
    (mt/with-temp [:model/Card   {card-id :id} {:name "Chunking Model", :type :model}
                   :model/Action {_a1 :id}     {:name "Chunk Action 1", :model_id card-id, :type :query}
                   :model/Action {_a2 :id}     {:name "Chunk Action 2", :model_id card-id, :type :query}
                   :model/Action {_a3 :id}     {:name "Chunk Action 3", :model_id card-id, :type :query}]
      (let [cascading (search/cascading-documents [(t2/select-one :model/Card :id card-id)])
            calls     (atom [])]
        (is (= 3 (count (get cascading "action"))))
        ;; A value var, not a function: with-dynamic-fn-redefs has nothing to intercept.
        (with-redefs [search/reindex-batch-size 2]
          (mt/with-dynamic-fn-redefs [search.ingestion/ingest-maybe-async!
                                      (fn [updates] (swap! calls conj updates))]
            (search/reconcile-cascading-documents! cascading)))
        (let [selectors (into [] cat @calls)]
          (testing "three surviving documents split across two messages, neither over the limit"
            (is (= [2 1] (sort > (map (fn [[_model [_in _id-expr ids]]] (count ids)) selectors))))))))))

(deftest cascade-enumeration-ceiling-test
  (testing "a fan-out past the ceiling is skipped rather than materialized"
    (mt/with-temp [:model/Card   {card-id :id} {:name "Ceiling Model", :type :model}
                   :model/Action {_a :id}      {:name "Ceiling Action", :model_id card-id, :type :query}]
      (let [instances [(t2/select-one :model/Card :id card-id)]]
        (is (contains? (set (keys (search/cascading-documents instances))) "action"))
        ;; A value var, not a function: with-dynamic-fn-redefs has nothing to intercept.
        (with-redefs [search.ingestion/max-enumerated-documents 0]
          (is (nil? (search/cascading-documents instances))))))))

(deftest reconcile-leaves-unenumerable-survivors-alone-test
  (testing "when the surviving documents cannot be enumerated, reconcile purges none of them"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Card   {card-id :id}   {:name "Unenumerable Model", :type :model}
                     :model/Action {action-id :id} {:name "Live Action", :model_id card-id, :type :query}]
        (let [cascading (search/cascading-documents [(t2/select-one :model/Card :id card-id)])]
          (is (contains? (set (keys cascading)) "action"))
          ;; A value var, not a function: with-dynamic-fn-redefs has nothing to intercept.
          (with-redefs [search.ingestion/max-enumerated-documents 0]
            (search/reconcile-cascading-documents! cascading))
          (is (= 1 (t2/count (search.index/active-table) :model "action" :model_id (str action-id)))))))))

(deftest model-index-gets-delete-capture-test
  (testing "ModelIndex is captured for deletes despite being kept out of :hook/search-index"
    (testing "it is still excluded from the row-level hooks, whose update path trips a toucan2 bug"
      (is (false? (isa? :model/ModelIndex :hook/search-index))))
    (is (some? (dml-capture/capture-fields :model/ModelIndex :delete)))
    (is (nil? (dml-capture/capture-fields :model/ModelIndex :insert)))))

(deftest rollback-discards-handoff-and-leaves-the-row-test
  (testing "a rolled-back delete discards its post-commit handoff, and the row survives"
    (search.tu/with-appdb-search-if-available-without-fallback
      (let [calls (atom [])]
        (mt/with-dynamic-fn-redefs [search.ingestion/ingest-maybe-async!
                                    (fn [updates] (swap! calls conj updates))]
          (mt/with-temp [:model/Card {id :id} {}]
            (reset! calls [])
            (is (thrown? clojure.lang.ExceptionInfo
                         (t2/with-transaction [_conn]
                           (t2/delete! :model/Card :id id)
                           (throw (ex-info "boom" {})))))
            (is (empty? @calls))
            (is (t2/exists? :model/Card :id id))))))))

(deftest superseded-review-delete-keeps-the-card-test
  (testing "deleting a review that is no longer the most recent leaves the card it reviewed in the index"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Card             {card-id :id} {:name "Reviewed Card"}
                     :model/ModerationReview {mr-id :id}   {:moderated_item_type "card"
                                                            :moderated_item_id   card-id
                                                            :moderator_id        (mt/user->id :crowberto)
                                                            :status              "verified"
                                                            :most_recent         false}]
        (is (= 1 (t2/count (search.index/active-table) :model "card" :model_id (str card-id))))
        (t2/delete! :model/ModerationReview :id mr-id)
        (is (= 1 (t2/count (search.index/active-table) :model "card" :model_id (str card-id))))))))

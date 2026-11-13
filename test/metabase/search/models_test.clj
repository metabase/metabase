(ns ^:synchronized metabase.search.models-test
  "Pins the delete-capture wiring in [[metabase.search.models]]: a delete enqueues re-derivation messages through
  the [[metabase.app-db.dml-capture]] seam."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.dml-capture :as dml-capture]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.core :as search]
   [metabase.search.db :as search.db]
   [metabase.search.engine :as search.engine]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.spec :as search.spec]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.warehouses.models.database :as database]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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

(defn- indexed-count
  "How many appdb index rows `search-model` has for the given model ids."
  [search-model & ids]
  (t2/count (search.index/active-table) :model search-model :model_id [:in (map str ids)]))

(defn- capture-enqueues!
  "Run `thunk`, returning the update sets it handed to ingestion, in order, without ingesting them."
  [thunk]
  (let [calls (atom [])]
    (mt/with-dynamic-fn-redefs [search.ingestion/ingest-maybe-async! (fn [updates] (swap! calls conj (set updates)))]
      (thunk))
    @calls))

(defn- cascading-documents-of
  "What [[search/cascading-documents]] enumerates for the card with `card-id`."
  [card-id]
  (search/cascading-documents [(t2/select-one :model/Card :id card-id)]))

;;; Capture wiring

(deftest card-children-deleted-with-the-card-enqueue-nothing-extra-test
  (testing "the revisions and moderation reviews a card delete removes don't enqueue re-derivations of their own"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Card             {id :id} {}
                     :model/Revision         _        {:model       "Card"
                                                       :model_id    id
                                                       :user_id     (mt/user->id :crowberto)
                                                       :object      {}
                                                       :is_creation true
                                                       :most_recent true}
                     :model/ModerationReview _        {:moderated_item_type "card"
                                                       :moderated_item_id   id
                                                       :moderator_id        (mt/user->id :crowberto)
                                                       :status              "verified"
                                                       :most_recent         true}]
        (is (= 1 (count (capture-enqueues! #(t2/delete! :model/Card :id id)))))))))

(deftest capture-fields-disabled-without-engine-test
  (testing "delete capture is skipped entirely, with no pre-select, when no search engine is active"
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

(deftest captured-models-have-no-before-select-test
  (testing "no model with delete capture has a before-select, which the snapshot would run and the DELETE would not"
    ;; Resolving the hooks loads the namespace of every model that feeds search.
    (search.spec/model-hooks)
    ;; `t2/define-before-select` derives the model from this keyword, so inherited hooks count too.
    (is (= [] (->> (descendants dml-capture/hook)
                   (filter #(isa? % :toucan2.tools.before-select/model))
                   (sort-by str))))))

(deftest model-index-gets-delete-capture-test
  (testing "ModelIndex is captured for deletes despite being kept out of :hook/search-index"
    (testing "it is still excluded from the row-level hooks, whose update path trips a toucan2 bug"
      (is (false? (isa? :model/ModelIndex :hook/search-index))))
    (search.tu/with-appdb-search-if-available-without-fallback
      (is (some? (dml-capture/capture-fields :model/ModelIndex :delete)))
      (is (nil? (dml-capture/capture-fields :model/ModelIndex :insert))))))

;;; Re-derivation on delete

(deftest card-delete-capture-statement-count-test
  (testing "capture adds a fixed number of statements to a card delete, whatever else the delete runs"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Card {captured :id} {}
                     :model/Card {uncaptured :id} {}]
        (let [statements      (fn [thunk]
                                (t2/with-call-count [call-count]
                                  ;; Stubbed, so the post-commit ingestion this delete queues is not counted.
                                  (capture-enqueues! thunk)
                                  (call-count)))
              with-capture    (statements #(t2/delete! :model/Card :id captured))
              without-capture (binding [search.ingestion/*disable-updates* true]
                                (statements #(t2/delete! :model/Card :id uncaptured)))]
          ;; The action and indexed-entity cascade scans.
          ;; A delete by literal primary key builds the card's snapshot without a select, and the Revision and
          ;; ModerationReview deletes in its `before-delete` bypass capture.
          (is (= 2 (- with-capture without-capture))))))))

(deftest delete-enqueues-one-bulk-update-test
  (testing "deleting a card enqueues exactly one re-derivation message, covering every model it feeds"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Card {id :id} {}]
        (is (= [#{["action" [:= id :this.model_id]]
                  ["card" [:= id :this.id]]
                  ["dataset" [:= id :this.id]]
                  ["indexed-entity" [:= id :model_index.model_id]]
                  ["metric" [:= id :this.id]]}]
               (capture-enqueues! #(t2/delete! :model/Card :id id))))))))

(deftest delete-of-a-joined-model-enqueues-the-fed-models-test
  (testing "deleting a row that only feeds other models' documents enqueues re-derivation for each of them"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Card             {card-id :id} {}
                     :model/ModerationReview {mr-id :id}   {:moderated_item_type "card"
                                                            :moderated_item_id   card-id
                                                            :moderator_id        (mt/user->id :crowberto)
                                                            :status              "verified"
                                                            :most_recent         true}]
        (let [where [:and [:= "card" "card"] [:= card-id :this.id] [:= true true]]]
          (is (= [#{["card" where] ["dataset" where] ["metric" where]}]
                 (capture-enqueues! #(t2/delete! :model/ModerationReview :id mr-id)))))))))

;; Updates share the boolean fold with deletes. Without it, a superseded review's selector names its card beside a
;; false comparison, and ingestion would purge the card.
(deftest review-status-update-respects-most-recent-test
  (testing "changing a superseded review's status queues nothing, while changing the current one's queues its card"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Card             {card-id :id} {}
                     :model/ModerationReview {old-id :id}  {:moderated_item_type "card"
                                                            :moderated_item_id   card-id
                                                            :moderator_id        (mt/user->id :crowberto)
                                                            :status              "verified"
                                                            :most_recent         false}
                     :model/ModerationReview {new-id :id}  {:moderated_item_type "card"
                                                            :moderated_item_id   card-id
                                                            :moderator_id        (mt/user->id :crowberto)
                                                            :status              "verified"
                                                            :most_recent         true}]
        (is (= [] (capture-enqueues! #(t2/update! :model/ModerationReview :id old-id {:status nil}))))
        (let [where [:and [:= "card" "card"] [:= card-id :this.id] [:= true true]]]
          (is (= [#{["card" where] ["dataset" where] ["metric" where]}]
                 (capture-enqueues! #(t2/update! :model/ModerationReview :id new-id {:status nil})))))))))

(deftest delete-of-the-latest-revision-enqueues-its-card-test
  (testing "deleting a card's most recent revision enqueues re-derivation of the card it fed"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Card     {card-id :id} {}
                     :model/Revision {rev-id :id}  {:model    "Card"
                                                    :model_id card-id
                                                    :user_id  (mt/user->id :crowberto)
                                                    :object   {}}]
        (let [where [:and [:= card-id :this.id] [:= true true] [:= "Card" "Card"]]]
          (is (= [#{["card" where] ["dataset" where] ["metric" where]}]
                 (capture-enqueues! #(t2/delete! :model/Revision :id rev-id)))))))))

;;; Purges

(deftest purge-one-on-delete-test
  (testing "deleting an indexed card purges its index row (appdb engine)"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Card {id :id} {:name "Temp Purge Card"}]
        (is (= 1 (indexed-count "card" id)))
        (t2/delete! :model/Card :id id)
        (is (= 0 (indexed-count "card" id)))))))

(deftest purge-bulk-on-delete-test
  (testing "bulk deletion purges every affected row (cards first, then their now-empty collection)"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Temp Bulk Collection"}
                     :model/Card       {c1 :id}      {:name "Bulk Card 1", :collection_id coll-id}
                     :model/Card       {c2 :id}      {:name "Bulk Card 2", :collection_id coll-id}]
        (is (= 2 (indexed-count "card" c1 c2)))
        (is (= 1 (indexed-count "collection" coll-id)))
        ;; cards must go first: a collection with contents refuses deletion.
        (t2/delete! :model/Card :collection_id coll-id)
        (t2/delete! :model/Collection :id coll-id)
        (is (= 0 (indexed-count "card" c1 c2)))
        (is (= 0 (indexed-count "collection" coll-id)))))))

(deftest superseded-review-delete-keeps-the-card-test
  (testing "deleting a review that is no longer the most recent leaves the card it reviewed in the index"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Card             {card-id :id} {:name "Reviewed Card"}
                     :model/ModerationReview {mr-id :id}   {:moderated_item_type "card"
                                                            :moderated_item_id   card-id
                                                            :moderator_id        (mt/user->id :crowberto)
                                                            :status              "verified"
                                                            :most_recent         false}]
        (is (= 1 (indexed-count "card" card-id)))
        (t2/delete! :model/ModerationReview :id mr-id)
        (is (= 1 (indexed-count "card" card-id)))))))

(deftest superseded-revision-delete-keeps-the-card-test
  (testing "deleting a revision that a newer one superseded, as the revision prune does, leaves its card in the index"
    (search.tu/with-appdb-search-if-available-without-fallback
      ;; Each insert is marked most recent and unmarks the card's earlier revisions, so the first one is superseded.
      (mt/with-temp [:model/Card     {card-id :id} {:name "Revised Card"}
                     :model/Revision {old-id :id}  {:model    "Card"
                                                    :model_id card-id
                                                    :user_id  (mt/user->id :crowberto)
                                                    :object   {}}
                     :model/Revision _             {:model    "Card"
                                                    :model_id card-id
                                                    :user_id  (mt/user->id :crowberto)
                                                    :object   {}}]
        (is (false? (t2/select-one-fn :most_recent :model/Revision :id old-id)))
        (is (= 1 (indexed-count "card" card-id)))
        (t2/delete! :model/Revision :id old-id)
        (is (= 1 (indexed-count "card" card-id)))))))

(deftest superseded-delete-starts-no-handoff-test
  (testing "a delete whose rows feed no document and cascade to none registers no post-commit handoff"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Card     {card-id :id} {:name "Pruned Revisions Card"}
                     :model/Revision {old-id :id}  {:model    "Card"
                                                    :model_id card-id
                                                    :user_id  (mt/user->id :crowberto)
                                                    :object   {}}
                     :model/Revision {new-id :id}  {:model    "Card"
                                                    :model_id card-id
                                                    :user_id  (mt/user->id :crowberto)
                                                    :object   {}}]
        (let [handoffs      (atom 0)
              after-commit! (mt/original-fn #'search/after-commit!)]
          (mt/with-dynamic-fn-redefs [search/after-commit! (fn [& args]
                                                             (swap! handoffs inc)
                                                             (apply after-commit! args))]
            (t2/delete! :model/Revision :id old-id)
            (is (= 0 @handoffs))
            (testing "while deleting the most recent revision still hands off its card"
              (t2/delete! :model/Revision :id new-id)
              (is (= 1 @handoffs)))))))))

;;; Database cascades

(deftest purge-cascaded-action-on-model-delete-test
  (testing "deleting a model card purges the index entries for actions the database cascade removed with it"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Card   {card-id :id}   {:name "Temp Action Model", :type :model}
                     :model/Action {action-id :id} {:name "Temp Cascaded Action", :model_id card-id, :type :query}]
        (is (= 1 (indexed-count "action" action-id)))
        ;; action.model_id carries ON DELETE CASCADE, so this removes the action with no toucan statement.
        (t2/delete! :model/Card :id card-id)
        (is (false? (t2/exists? :model/Action :id action-id)))
        (is (= 0 (indexed-count "action" action-id)))))))

(deftest purge-cards-on-database-delete-test
  (testing "deleting a database purges the cards it deletes in bulk, and the actions that cascade with them"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Database {db-id :id}     {}
                     :model/Card     {card-id :id}   {:name "Db Delete Model", :type :model, :database_id db-id}
                     :model/Action   {action-id :id} {:name "Db Delete Action", :model_id card-id, :type :query}]
        (is (= 1 (indexed-count "dataset" card-id)))
        (is (= 1 (indexed-count "action" action-id)))
        (t2/delete! :model/Database :id db-id)
        (is (false? (t2/exists? :model/Card :id card-id)))
        (is (= 0 (indexed-count "dataset" card-id)))
        (is (= 0 (indexed-count "action" action-id)))))))

(deftest database-delete-reconciles-despite-a-failed-purge-test
  (testing "when purging a deleted database's cards throws, its cascaded documents are still reconciled"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Database {db-id :id}     {}
                     :model/Card     {card-id :id}   {:name "Db Failed Purge Model", :type :model, :database_id db-id}
                     :model/Action   {action-id :id} {:name "Db Failed Purge Action", :model_id card-id, :type :query}]
        (mt/with-dynamic-fn-redefs [search/delete! (fn [_model _ids] (throw (ex-info "purge failed" {})))]
          (t2/delete! :model/Database :id db-id))
        (is (= 0 (indexed-count "action" action-id)))))))

(deftest database-delete-tombstones-later-chunks-despite-an-earlier-failure-test
  (testing "one tombstone chunk throwing does not cost the chunks after it"
    (search.tu/with-appdb-search-if-available-without-fallback
      ;; A value var, not a function: with-dynamic-fn-redefs has nothing to intercept.
      (with-redefs [database/tombstone-chunk-size 1]
        (mt/with-temp [:model/Database {db-id :id}    {}
                       :model/Card     {fail-card :id} {:name "Db Chunk Failure Model", :type :model, :database_id db-id}
                       :model/Card     {ok-card :id}   {:name "Db Chunk Survivor Model", :type :model, :database_id db-id}]
          (is (= 1 (indexed-count "dataset" fail-card)))
          (is (= 1 (indexed-count "dataset" ok-card)))
          (let [real-delete! (mt/original-fn #'search/delete!)]
            (mt/with-dynamic-fn-redefs [search/delete! (fn [model ids]
                                                         (if (contains? (set ids) fail-card)
                                                           (throw (ex-info "purge failed" {}))
                                                           (real-delete! model ids)))]
              (t2/delete! :model/Database :id db-id)))
          (is (= 1 (indexed-count "dataset" fail-card))
              "the chunk whose delete! throws is left for the reindex")
          (is (= 0 (indexed-count "dataset" ok-card))
              "a later chunk still gets tombstoned despite an earlier chunk's failure"))))))

(deftest database-delete-survives-a-failed-cascade-enumeration-test
  (testing "a search error while enumerating a deleted database's cascades is logged, and the delete still succeeds"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Database {db-id :id}   {}
                     :model/Card     {card-id :id} {:name "Db Enumeration Failure Card", :database_id db-id}]
        (mt/with-dynamic-fn-redefs [search/cascading-documents (fn [_instances] (throw (ex-info "spec bug" {})))]
          (is (= 1 (t2/delete! :model/Database :id db-id))))
        (is (false? (t2/exists? :model/Card :id card-id)))
        (is (= 0 (indexed-count "card" card-id)))))))

(deftest database-delete-keeps-a-card-that-moved-away-test
  (testing "a card that moves to another database during the delete survives it, and keeps its search documents"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Database {db-id :id}    {}
                     :model/Database {other-id :id} {}
                     :model/Card     {card-id :id}  {:name "Db Delete Moved Model", :type :model, :database_id db-id}]
        (is (= 1 (indexed-count "dataset" card-id)))
        (let [add-cascading-documents (mt/original-fn #'search/add-cascading-documents)]
          ;; A raw update, standing in for a concurrent move that lands between the scan and the delete.
          (mt/with-dynamic-fn-redefs [search/add-cascading-documents
                                      (fn [cascading instances]
                                        (t2/query {:update :report_card
                                                   :set    {:database_id other-id}
                                                   :where  [:= :id card-id]})
                                        (add-cascading-documents cascading instances))]
            (t2/delete! :model/Database :id db-id)))
        (is (t2/exists? :model/Card :id card-id))
        (is (= 1 (indexed-count "dataset" card-id)))))))

(deftest add-cascading-documents-stops-at-the-ceiling-test
  (testing "a batched delete stops enumerating once its merged cascades reach the ceiling"
    (mt/with-dynamic-fn-redefs [search/cascading-documents (fn [_instances] {"action" #{3}})]
      ;; A value var, not a function: with-dynamic-fn-redefs has nothing to intercept.
      (with-redefs [search.ingestion/max-enumerated-documents 2]
        (testing "below the ceiling, the batch is enumerated and merged"
          (is (= {"action" #{1 3}} (search/add-cascading-documents {"action" #{1}} [::instance]))))
        (testing "at the ceiling, the batch is not enumerated"
          (is (= {"action" #{1 2}} (search/add-cascading-documents {"action" #{1 2}} [::instance]))))))))

(deftest unrelated-cascade-documents-are-not-purged-test
  (testing "deleting one model card purges its action and leaves another card's action alone"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Card   {keep-card :id}   {:name "Kept Action Model", :type :model}
                     :model/Card   {drop-card :id}   {:name "Dropped Action Model", :type :model}
                     :model/Action {keep-action :id} {:name "Surviving Action", :model_id keep-card, :type :query}
                     :model/Action {drop-action :id} {:name "Doomed Action", :model_id drop-card, :type :query}]
        (t2/delete! :model/Card :id drop-card)
        (is (= 0 (indexed-count "action" drop-action)))
        (is (= 1 (indexed-count "action" keep-action)))))))

(deftest cascading-documents-only-covers-unpurgeable-selectors-test
  (testing "only search-models ingestion cannot purge on its own are enumerated"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Card   {card-id :id} {:name "Selector Shape Card", :type :model}
                     :model/Action {_ :id}       {:name "Shape Probe Action", :model_id card-id, :type :query}]
        (let [cascading (cascading-documents-of card-id)]
          (testing "card/dataset/metric resolve from a :this.id selector, so ingestion already handles them"
            (is (empty? (select-keys cascading ["card" "dataset" "metric"]))))
          (testing "action is reached through :this.model_id, so its documents are enumerated up front"
            (is (contains? cascading "action"))))))))

(deftest moved-document-is-not-purged-test
  (testing "a document that stops matching the selector without being deleted keeps its index entry"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Card   {from-card :id} {:name "From Model", :type :model}
                     :model/Card   {to-card :id}   {:name "To Model", :type :model}
                     :model/Action {action-id :id} {:name "Reparented Action", :model_id from-card, :type :query}]
        (let [cascading (cascading-documents-of from-card)
              indexed   #(str (t2/select-one-fn :legacy_input (search.index/active-table)
                                                :model "action" :model_id (str action-id)))]
          (is (contains? cascading "action"))
          (is (str/includes? (indexed) "From Model"))
          ;; Raw query, not t2/update!: a database-level SET NULL fires no toucan hook, so this has to leave the
          ;; action outside the captured selector without any re-indexing of its own.
          (t2/query {:update :action, :set {:model_id to-card}, :where [:= :id action-id]})
          (search/reconcile-cascading-documents! cascading)
          (testing "the document survived the reconcile"
            (is (= 1 (indexed-count "action" action-id))))
          (testing "and the relationship that moved was re-derived, not left stale"
            (is (str/includes? (indexed) "To Model"))
            (is (not (str/includes? (indexed) "From Model")))))))))

(deftest reconcile-only-queues-its-check-test
  (testing "reconciling queues one check per search-model, and runs no query on the committing thread"
    (search.tu/with-appdb-search-if-available-without-fallback
      (let [checked (atom 0)]
        (mt/with-dynamic-fn-redefs [search.ingestion/existing-doc-ids (fn [_search-model _ids]
                                                                        (swap! checked inc)
                                                                        #{})]
          (is (= [#{(search.ingestion/reconcile "action" #{1})
                    (search.ingestion/reconcile "indexed-entity" #{"1:1"})}]
                 (capture-enqueues!
                  #(search/reconcile-cascading-documents! {"action" #{1}, "indexed-entity" #{"1:1"}})))))
        (is (zero? @checked))))))

(deftest reconcile-chunks-statements-test
  (testing "a reconcile checks and re-derives its ids in bounded chunks, so it cannot build an unbounded query"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Card   {card-id :id} {:name "Chunking Model", :type :model}
                     :model/Action {_a1 :id}     {:name "Chunk Action 1", :model_id card-id, :type :query}
                     :model/Action {_a2 :id}     {:name "Chunk Action 2", :model_id card-id, :type :query}
                     :model/Action {_a3 :id}     {:name "Chunk Action 3", :model_id card-id, :type :query}]
        (let [cascading        (cascading-documents-of card-id)
              checks           (atom [])
              runs             (atom [])
              existing-doc-ids (mt/original-fn #'search.ingestion/existing-doc-ids)
              ingest-updates!  (mt/original-fn #'search.ingestion/ingest-updates!)]
          (is (= 3 (count (get cascading "action"))))
          (mt/with-dynamic-fn-redefs [search.ingestion/existing-doc-ids (fn [search-model ids]
                                                                          (swap! checks conj (count ids))
                                                                          (existing-doc-ids search-model ids))
                                      search.ingestion/ingest-updates!  (fn [messages]
                                                                          (swap! runs conj messages)
                                                                          (ingest-updates! messages))]
            ;; A value var, not a function: with-dynamic-fn-redefs has nothing to intercept.
            (with-redefs-fn {#'search.ingestion/reconcile-batch-size 2}
              #(search/reconcile-cascading-documents! cascading)))
          (testing "three surviving documents split across two checks and two re-index statements"
            (is (= {:checks [2 1], :runs [2 1]}
                   {:checks (sort > @checks)
                    :runs   (sort > (map (fn [[[_model [_in _id-expr ids]]]] (count ids)) @runs))}))))))))

(deftest reconcile-reindex-failure-keeps-tombstones-test
  (testing "a reconcile whose re-index throws still removes the documents that stopped resolving"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Card   {card-id :id}  {:name "Failing Reindex Model", :type :model}
                     :model/Action {alive-id :id} {:name "Surviving Action", :model_id card-id, :type :query}
                     :model/Action {gone-id :id}  {:name "Deleted Action", :model_id card-id, :type :query}]
        (let [cascading (cascading-documents-of card-id)]
          ;; A raw delete, so the action's document is left for the reconcile to purge.
          (t2/query {:delete-from :action, :where [:= :id gone-id]})
          (mt/with-dynamic-fn-redefs [search.ingestion/ingest-updates! (fn [_messages]
                                                                         (throw (ex-info "reindex failed" {})))]
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"reindex failed"
                                  (search/reconcile-cascading-documents! cascading))))
          (is (= {:alive 1, :gone 0}
                 {:alive (indexed-count "action" alive-id)
                  :gone  (indexed-count "action" gone-id)})))))))

(deftest reconcile-check-failure-keeps-earlier-tombstones-test
  (testing "a survivor check that throws for a later chunk keeps the tombstones of the chunks before it"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Card   {card-id :id} {:name "Failing Check Model", :type :model}
                     :model/Action {gone-id :id} {:name "Deleted Action", :model_id card-id, :type :query}]
        (let [unchecked-id     Long/MAX_VALUE
              existing-doc-ids (mt/original-fn #'search.ingestion/existing-doc-ids)]
          ;; A raw delete, so the action's document is left for the reconcile to purge.
          (t2/query {:delete-from :action, :where [:= :id gone-id]})
          (mt/with-dynamic-fn-redefs [search.ingestion/existing-doc-ids (fn [search-model ids]
                                                                          (if (some #{unchecked-id} ids)
                                                                            (throw (ex-info "check failed" {}))
                                                                            (existing-doc-ids search-model ids)))]
            ;; A value var, not a function: with-dynamic-fn-redefs has nothing to intercept.
            ;; One id per chunk, and a sorted set so the deleted action's chunk is checked first.
            (with-redefs-fn {#'search.ingestion/reconcile-batch-size 1}
              #(is (thrown-with-msg? clojure.lang.ExceptionInfo #"check failed"
                                     (#'search.ingestion/apply-reconcile!
                                      {:search-model "action", :ids (sorted-set gone-id unchecked-id)})))))
          (is (= 0 (indexed-count "action" gone-id))))))))

(deftest cascade-enumeration-ceiling-test
  (testing "a fan-out past the ceiling is skipped rather than materialized"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Card   {card-id :id} {:name "Ceiling Model", :type :model}
                     :model/Action {_a :id}      {:name "Ceiling Action", :model_id card-id, :type :query}]
        (is (contains? (cascading-documents-of card-id) "action"))
        ;; A value var, not a function: with-dynamic-fn-redefs has nothing to intercept.
        (with-redefs [search.ingestion/max-enumerated-documents 0]
          (is (nil? (cascading-documents-of card-id))))))))

(deftest cascade-enumeration-asks-for-one-past-the-ceiling-test
  (testing "the enumeration query asks the database for at most one id past the ceiling"
    (let [queries (atom [])]
      (mt/with-dynamic-fn-redefs [mdb/streaming-reducible-query (fn [query] (swap! queries conj query) [])]
        ;; A value var, not a function: with-dynamic-fn-redefs has nothing to intercept.
        (with-redefs [search.ingestion/max-enumerated-documents 2]
          (search.ingestion/doc-ids "action" [:= 1 :this.model_id])))
      (is (=? [{:limit 3}] @queries)))))

(deftest cascade-enumeration-counts-documents-not-rows-test
  (testing "a document whose row a spec join repeats counts once toward the ceiling"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Card       {card-id :id} {:name "Twice Revised Card", :collection_id coll-id}]
      ;; Raw inserts, since the model's hooks keep a single `most_recent` revision.
      (t2/insert! (t2/table-name :model/Revision) (repeat 2 {:model       "Card"
                                                             :model_id    card-id
                                                             :object      "{}"
                                                             :user_id     (mt/user->id :rasta)
                                                             :timestamp   :%now
                                                             :most_recent true}))
      (try
        ;; A value var, not a function: with-dynamic-fn-redefs has nothing to intercept.
        (with-redefs [search.ingestion/max-enumerated-documents 1]
          (is (= #{card-id} (search.ingestion/doc-ids "card" [:= coll-id :this.collection_id]))))
        (finally
          (t2/delete! (t2/table-name :model/Revision) :model "Card" :model_id card-id))))))

(deftest reconcile-leaves-unenumerable-survivors-alone-test
  (testing "when the surviving documents cannot be enumerated, reconcile purges none of them"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Card   {card-id :id}   {:name "Unenumerable Model", :type :model}
                     :model/Action {action-id :id} {:name "Live Action", :model_id card-id, :type :query}]
        (let [cascading (cascading-documents-of card-id)]
          (is (contains? cascading "action"))
          ;; A value var, not a function: with-dynamic-fn-redefs has nothing to intercept.
          (with-redefs [search.ingestion/max-enumerated-documents 0]
            (search/reconcile-cascading-documents! cascading))
          (is (= 1 (indexed-count "action" action-id))))))))

(deftest model-index-delete-purges-indexed-entities-test
  (testing "deleting a model index purges the indexed-entity documents its cascade removed, by their compound ids"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Card {card-id :id} {:name "Indexed Model", :type :model}]
        (let [mi-id   (t2/insert-returning-pk! :model/ModelIndex {:model_id   card-id
                                                                  :pk_ref     (mt/$ids $venues.id)
                                                                  :value_ref  (mt/$ids $venues.name)
                                                                  :schedule   "0 0 0 * * ? *"
                                                                  :state      "indexed"
                                                                  :creator_id (mt/user->id :rasta)})
              indexed #(indexed-count "indexed-entity" (str mi-id ":1") (str mi-id ":2"))]
          (t2/insert! :model/ModelIndexValue [{:model_index_id mi-id, :model_pk 1, :name "Red Medicine"}
                                              {:model_index_id mi-id, :model_pk 2, :name "Stout Burgers"}])
          ;; ModelIndexValue carries no row-level search hook, so index its documents by hand.
          (search.ingestion/bulk-ingest! [["indexed-entity" [:= mi-id :this.model_index_id]]])
          (is (= 2 (indexed)))
          ;; model_index_value.model_index_id carries ON DELETE CASCADE, so the values go with no toucan statement.
          (t2/delete! :model/ModelIndex :id mi-id)
          (is (zero? (t2/count :model/ModelIndexValue :model_index_id mi-id)))
          (is (zero? (indexed))))))))

;;; Failure handling

(deftest rollback-discards-handoff-and-leaves-the-row-test
  (testing "a rolled-back delete discards its post-commit handoff, and the row survives"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Card {id :id} {}]
        (is (empty? (capture-enqueues!
                     #(is (thrown? clojure.lang.ExceptionInfo
                                   (t2/with-transaction [_conn]
                                     (t2/delete! :model/Card :id id)
                                     (throw (ex-info "boom" {}))))))))
        (is (t2/exists? :model/Card :id id))))))

(deftest failed-reindex-still-reconciles-cascades-test
  (testing "when the re-derivation of the deleted rows throws, the cascade reconcile still runs"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Card   {card-id :id}   {:name "Failing Reindex Model", :type :model}
                     :model/Action {action-id :id} {:name "Cascaded Action", :model_id card-id, :type :query}]
        (mt/with-dynamic-fn-redefs [search/bulk-update! (fn [_instances] (throw (ex-info "reindex failed" {})))]
          (t2/delete! :model/Card :id card-id))
        (is (= 0 (indexed-count "action" action-id)))))))

(deftest cascade-enumeration-failure-keeps-the-delete-test
  (testing "a search error while enumerating cascaded documents is logged, and the delete still succeeds"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Card {card-id :id} {:name "Enumeration Failure Model", :type :model}]
        (mt/with-dynamic-fn-redefs [search/cascading-documents (fn [_instances] (throw (ex-info "spec bug" {})))]
          (is (= 1 (t2/delete! :model/Card :id card-id))))
        (is (false? (t2/exists? :model/Card :id card-id))))))
  (testing "a database error inside the enumeration query leaves the delete able to run and commit"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Card {card-id :id} {:name "Enumeration SQL Error Model", :type :model}]
        ;; The bad column fails inside the enumeration's own nested transaction. On PostgreSQL, the delete below can
        ;; only run if that savepoint rolled back cleanly.
        (mt/with-dynamic-fn-redefs [search.db/spec-index-doc-ids-reducible
                                    (fn [& _]
                                      (mdb/streaming-reducible-query ["SELECT no_such_column FROM report_card"]))]
          (is (= 1 (t2/delete! :model/Card :id card-id))))
        (is (false? (t2/exists? :model/Card :id card-id)))))))

(defn- outcome-and-interrupt
  "Call `thunk`, returning its `:result` or `:thrown` exception, and whether it left this thread `:interrupted?`.
  The status is read, and cleared, before any assertion runs, since reporting an assertion clears it."
  [thunk]
  (let [outcome (try
                  {:result (thunk)}
                  (catch Throwable e
                    {:thrown e}))]
    (assoc outcome :interrupted? (Thread/interrupted))))

(deftest cascade-enumeration-interrupt-is-restored-test
  (testing "an interrupt while enumerating one search-model's cascades skips it and keeps the thread interrupted"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Card   {card-id :id} {:name "Interrupted Enumeration Model", :type :model}
                     :model/Action _             {:name "Unenumerated Action", :model_id card-id, :type :query}]
        (is (= {:result nil, :interrupted? true}
               (mt/with-dynamic-fn-redefs [search.ingestion/doc-ids (fn [_search-model _where-clause]
                                                                      (throw (InterruptedException. "interrupted")))]
                 (outcome-and-interrupt #(cascading-documents-of card-id)))))))))

(deftest dependents-interrupt-is-restored-test
  (testing "an interrupt in the capture dependents hook skips the enumeration and keeps the thread interrupted"
    (is (= {:result nil, :interrupted? true}
           (mt/with-dynamic-fn-redefs [search/cascading-documents (fn [_instances]
                                                                    (throw (InterruptedException. "interrupted")))]
             (outcome-and-interrupt #(dml-capture/dependents :model/Card [{:id 1}])))))))

(deftest reconcile-interrupt-stops-and-is-restored-test
  (testing "an interrupt while reconciling stops the remaining search-models and reaches the caller"
    (search.tu/with-appdb-search-if-available-without-fallback
      (let [checked (atom [])
            outcome (mt/with-dynamic-fn-redefs [search.ingestion/existing-doc-ids
                                                (fn [search-model _ids]
                                                  (swap! checked conj search-model)
                                                  (throw (InterruptedException. "interrupted")))]
                      (outcome-and-interrupt
                       #(search/reconcile-cascading-documents! {"action" #{1}, "indexed-entity" #{"1:1"}})))]
        (is (=? {:thrown       (partial instance? InterruptedException)
                 :interrupted? true}
                outcome))
        (is (= 1 (count @checked)))))))

(deftest capture-fields-failure-keeps-the-delete-test
  (testing "a search error while working out what to capture is logged, and the delete still succeeds uncaptured"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Card {id :id} {:name "Capture Fields Failure Card"}]
        (mt/with-dynamic-fn-redefs [search.spec/hook-where-fields (fn [_model] (throw (ex-info "spec bug" {})))]
          (is (= 1 (t2/delete! :model/Card :id id))))
        (is (false? (t2/exists? :model/Card :id id)))))))

(deftest one-search-model-failure-keeps-the-others-test
  (testing "an enumeration failure for one search-model leaves the others enumerated"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Card   {card-id :id} {:name "Partial Enumeration Model", :type :model}
                     :model/Action {_ :id}       {:name "Still Enumerated Action", :model_id card-id, :type :query}]
        (let [doc-ids (mt/original-fn #'search.ingestion/doc-ids)]
          (mt/with-dynamic-fn-redefs [search.ingestion/doc-ids (fn [search-model where-clause]
                                                                 (if (= "indexed-entity" search-model)
                                                                   (throw (ex-info "enumeration failed" {}))
                                                                   (doc-ids search-model where-clause)))]
            (is (contains? (cascading-documents-of card-id) "action")))))))
  (testing "a reconcile failure for one search-model leaves the others reconciled, and still reaches the caller"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Card   {card-id :id}   {:name "Partial Reconcile Model", :type :model}
                     :model/Action {action-id :id} {:name "Purged Action", :model_id card-id, :type :query}]
        (let [cascading        (array-map "indexed-entity" #{"0:0"}
                                          "action"         (get (cascading-documents-of card-id) "action"))
              existing-doc-ids (mt/original-fn #'search.ingestion/existing-doc-ids)]
          ;; A raw delete, so the action's document is left for the reconcile to purge.
          (t2/query {:delete-from :action, :where [:= :id action-id]})
          (mt/with-dynamic-fn-redefs [search.ingestion/existing-doc-ids (fn [search-model ids]
                                                                          (if (= "indexed-entity" search-model)
                                                                            (throw (ex-info "reconcile failed" {}))
                                                                            (existing-doc-ids search-model ids)))]
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"reconcile failed"
                                  (search/reconcile-cascading-documents! cascading))))
          (is (= 0 (indexed-count "action" action-id))))))))

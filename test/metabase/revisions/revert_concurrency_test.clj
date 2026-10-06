(ns metabase.revisions.revert-concurrency-test
  "A revert and a concurrent edit of the same entity: neither deadlocks, neither loses its change, and the history keeps
  the revision of each. The rows are committed, so that the other thread sees them."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.content-verification.core :as content-verification]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.revisions.core :as revisions]
   [metabase.revisions.db :as revisions.db]
   [metabase.revisions.models.revision :as revision]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- error-text [^Throwable e]
  (str/join " / " (keep ex-message (take 4 (iterate ex-cause e)))))

(defn- history
  "`[is_creation is_reversion name]` of each revision of `entity` `id`, newest first."
  [entity id]
  (mapv (juxt :is_creation :is_reversion (comp :name :object))
        (revisions/revisions entity id)))

(defn- revert-to-creation!
  "Reverts as `POST /api/revision/revert` does, with a current user: the model hooks publish the user id."
  [entity id]
  (mt/with-current-user (mt/user->id :crowberto)
    (revision/revert! {:id id :user-id (mt/user->id :crowberto) :entity entity
                       :revision-id (:id (last (revisions/revisions entity id)))})))

(defn- revert-to-creation-signalling!
  "[[revert-to-creation!]] in this thread. Delivers `reached` when the revert holds the lock of the revisions or has
  read the latest revision; with `row-held-by-edit?`, also when the revert starts to lock the entity row. Each of these
  steps comes before the first write of the revert, in any lock order."
  [entity id reached {:keys [row-held-by-edit?]}]
  (let [lock-entity     (mt/original-fn #'revisions.db/lock-entity!)
        lock-revisions  (mt/original-fn #'revisions.db/lock-revisions!)
        latest-revision (mt/original-fn #'revisions.db/latest-revision)]
    (mt/with-dynamic-fn-redefs [revisions.db/lock-entity!    (fn [& args]
                                                               ;; this lock waits for the edit, so signal before it
                                                               (when row-held-by-edit?
                                                                 (deliver reached true))
                                                               (u/prog1 (apply lock-entity args)
                                                                 (deliver reached true)))
                                revisions.db/lock-revisions! (fn [& args]
                                                               (u/prog1 (apply lock-revisions args)
                                                                 (deliver reached true)))
                                revisions.db/latest-revision (fn [& args]
                                                               (u/prog1 (apply latest-revision args)
                                                                 (deliver reached true)))]
      (revert-to-creation! entity id))))

(defn- edit-in-own-transaction!
  "In one transaction: if `row-locked` is given, lock the row, deliver `row-locked` and wait for `reached`; then rename
  the entity to \"Concurrent edit\". Returns the name that the transaction reads back after its update."
  [entity id {:keys [row-locked reached]}]
  (mt/with-current-user (mt/user->id :rasta)
    (t2/with-transaction [_]
      (when row-locked
        (t2/query {:select [:id] :from [(t2/table-name entity)] :where [:= :id id] :for :update})
        (deliver row-locked true)
        (deref reached 10000 :timeout))
      (t2/update! entity id {:name "Concurrent edit"})
      (t2/select-one-fn :name entity :id id))))

(defn edit-holds-row-during-revert!
  "An edit holds the row of `entity`, a revert to the creation starts, and the edit writes its change when the revert
  reaches its first lock or has read the latest revision. `with-entity` calls its argument with the id of a committed
  entity named \"X0\" and then renamed to \"X1\"."
  [entity with-entity]
  (with-entity
    (fn [id]
      (let [row-locked (promise)
            reached    (promise)
            edit-out   (atom nil)
            edit       (Thread. #(reset! edit-out (try {:ok (edit-in-own-transaction! entity id {:row-locked row-locked
                                                                                                 :reached    reached})}
                                                       (catch Throwable e {:error (error-text e)}))))
            _          (.start edit)
            _          (deref row-locked 10000 :timeout)
            revert     (try (revert-to-creation-signalling! entity id reached {:row-held-by-edit? true})
                            :ok
                            (catch Throwable e (str "error: " (error-text e))))]
        (.join edit 120000)
        (is (= :ok revert) "the revert succeeds")
        (is (= {:ok "Concurrent edit"} @edit-out) "the edit succeeds and reads its own change")
        (is (= [[false true "X0"] [false false "Concurrent edit"] [false false "X1"] [true false "X0"]]
               (history entity id))
            "the edit keeps its revision, and the reversion is the newest revision")
        (is (= "X0" (t2/select-one-fn :name entity :id id)))))))

(defn edit-during-revert!
  "A revert to the creation holds its locks, and an edit of the same `entity` starts. `with-entity` is as in
  [[edit-holds-row-during-revert!]]."
  [entity with-entity]
  (with-entity
    (fn [id]
      (let [locked    (promise)
            edit-out  (atom nil)
            edit      (Thread. #(do (deref locked 10000 :timeout)
                                    (reset! edit-out (try {:ok (edit-in-own-transaction! entity id {})}
                                                          (catch Throwable e {:error (error-text e)})))))
            _         (.start edit)
            real-lock (mt/original-fn #'revisions.db/lock-revisions!)
            once      (atom false)
            revert    (try (mt/with-dynamic-fn-redefs [revisions.db/lock-revisions!
                                                       (fn [& args]
                                                         (let [result (apply real-lock args)]
                                                           (when (compare-and-set! once false true)
                                                             (deliver locked true)
                                                             ;; time for the edit to start and wait for the revert
                                                             (Thread/sleep 1500))
                                                           result))]
                             (revert-to-creation! entity id))
                           :ok
                           (catch Throwable e (str "error: " (error-text e))))]
        (.join edit 120000)
        (is (= :ok revert) "the revert succeeds")
        (is (= {:ok "Concurrent edit"} @edit-out) "the edit succeeds and reads its own change")
        (is (= [[false false "Concurrent edit"] [false true "X0"] [false false "X1"] [true false "X0"]]
               (history entity id))
            "the edit waits for the revert, and its revision is the newest revision")
        (is (= "Concurrent edit" (t2/select-one-fn :name entity :id id)))))))

(defn- with-document
  [f]
  (let [coll (t2/insert-returning-pk! :model/Collection {:name (str "Revert concurrency " (random-uuid))})]
    (try
      (let [id (:id (mt/user-http-request :crowberto :post 200 "document"
                                          {:name "X0" :collection_id coll
                                           :document {:type "doc" :content [{:type "paragraph" :content [{:type "text" :text "v0"}]}]}}))]
        (try
          (mt/user-http-request :crowberto :put 200 (str "document/" id) {:name "X1"})
          (f id)
          (finally (t2/delete! :model/Document :id id))))
      (finally (t2/delete! :model/Collection :id coll)))))

(deftest document-edit-holds-row-during-revert-test
  (edit-holds-row-during-revert! :model/Document with-document))

(deftest document-edit-during-revert-test
  (edit-during-revert! :model/Document with-document))

(defn- table-query [table]
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id table)))))

(deftest verified-card-edit-and-revert-test
  (testing "A revert of a verified Card and a concurrent edit that unverifies it both succeed"
    (let [id (:id (mt/user-http-request :crowberto :post 200 "card"
                                        {:name "C0" :display "table" :visualization_settings {}
                                         :dataset_query (table-query :venues)}))]
      (try
        (mt/user-http-request :crowberto :put 200 (str "card/" id) {:dataset_query (table-query :checkins)})
        (content-verification/create-review! {:moderated_item_id id :moderated_item_type "card"
                                              :moderator_id (mt/user->id :crowberto) :status "verified"})
        (let [mod-locked (promise)
              reached    (promise)
              edit-out   (atom nil)
              edit       (Thread.
                          #(reset! edit-out
                                   (try
                                     ;; the order of a Card API edit: unverify (a moderation review), then the card row
                                     (t2/with-transaction [_]
                                       (content-verification/create-review! {:moderated_item_id id :moderated_item_type "card"
                                                                             :moderator_id (mt/user->id :rasta) :status nil
                                                                             :text "Unverified due to edit"})
                                       (deliver mod-locked true)
                                       (deref reached 10000 :timeout)
                                       (t2/update! :model/Card id {:name "Concurrent edit"})
                                       :ok)
                                     (catch Throwable e (str "error: " (error-text e))))))
              _          (.start edit)
              _          (deref mod-locked 10000 :timeout)
              revert     (try (revert-to-creation-signalling! :model/Card id reached {:row-held-by-edit? false})
                              :ok
                              (catch Throwable e (str "error: " (error-text e))))]
          (.join edit 120000)
          (is (= :ok revert) "the revert succeeds")
          (is (= :ok @edit-out) "the edit succeeds"))
        (finally
          (t2/delete! :model/ModerationReview :moderated_item_id id :moderated_item_type "card")
          (t2/delete! :model/Card :id id))))))

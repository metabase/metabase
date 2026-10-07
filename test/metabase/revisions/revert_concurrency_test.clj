(ns metabase.revisions.revert-concurrency-test
  "A revert and a concurrent write of the same or of another entity do not deadlock, and a revert that cannot commit
  fails. The rows are committed, so that the other thread sees them."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.content-verification.core :as content-verification]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.revisions.core :as revisions]
   [metabase.revisions.db :as revisions.db]
   [metabase.revisions.models.revision :as revision]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (java.sql SQLTransactionRollbackException)))

(set! *warn-on-reflection* true)

(defn- error-text [^Throwable e]
  (str/join " / " (keep ex-message (take 4 (iterate ex-cause e)))))

(defn- history
  "`[is_creation is_reversion name]` of each Revision of `entity` `id`, newest first."
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
  "[[revert-to-creation!]] in this thread. Delivers `reached` before the revert's first write: at the row lock (with
  `row-held-by-edit?`), the revisions lock, or the read of the latest Revision, whichever comes first."
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
  "In one transaction: if `row-locked` is given, lock the row, deliver `row-locked` and wait for `reached`; deliver
  `updating`, if given; then rename the entity to \"Concurrent edit\". Returns the name that the transaction reads back
  after its update, and whether a reversion of the entity is committed when the update returns."
  [entity id {:keys [row-locked reached updating]}]
  (mt/with-current-user (mt/user->id :rasta)
    (t2/with-transaction [_]
      (when row-locked
        (revisions.db/lock-entity! entity id)
        (deliver row-locked true)
        (deref reached 10000 :timeout))
      (some-> updating (deliver true))
      (t2/update! entity id {:name "Concurrent edit"})
      {:name       (t2/select-one-fn :name entity :id id)
       :reversion? (boolean (some :is_reversion (revisions/revisions entity id)))})))

(defn edit-holds-row-during-revert!
  "An edit holds the row of `entity`, a revert to the creation starts, and the edit writes its change when the revert
  reaches its first lock or has read the latest Revision. `with-entity` calls its argument with the id of a committed
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
        (is (= {:ok {:name "Concurrent edit" :reversion? false}} @edit-out)
            "the edit succeeds, reads its own change, and ends before the revert")
        (is (= [[false true "X0"] [false false "Concurrent edit"] [false false "X1"] [true false "X0"]]
               (history entity id))
            "the edit keeps its revision, and the reversion is the newest revision")
        (is (= "X0" (t2/select-one-fn :name entity :id id)))))))

(defn edit-during-revert!
  "A revert to the creation holds the row of `entity`, and an edit of the same entity starts its update. `with-entity`
  is as in [[edit-holds-row-during-revert!]]."
  [entity with-entity]
  (with-entity
    (fn [id]
      (let [row-held    (promise)
            updating    (promise)
            edit-out    (atom nil)
            edit        (Thread. #(reset! edit-out
                                          (try {:row-held (deref row-held 10000 :timeout)
                                                :ok       (edit-in-own-transaction! entity id {:updating updating})}
                                               (catch Throwable e {:error (error-text e)}))))
            _           (.start edit)
            lock-entity (mt/original-fn #'revisions.db/lock-entity!)
            revert      (try (mt/with-dynamic-fn-redefs [revisions.db/lock-entity! (fn [& args]
                                                                                     (u/prog1 (apply lock-entity args)
                                                                                       (deliver row-held true)
                                                                                       (deref updating 10000 :timeout)))]
                               (revert-to-creation! entity id))
                             :ok
                             (catch Throwable e (str "error: " (error-text e))))]
        (.join edit 120000)
        (is (= :ok revert) "the revert succeeds")
        (is (= {:row-held true :ok {:name "Concurrent edit" :reversion? true}} @edit-out)
            "the edit starts its update while the revert holds the row, and the reversion is committed when the update returns")
        (is (= [[false false "Concurrent edit"] [false true "X0"] [false false "X1"] [true false "X0"]]
               (history entity id))
            "the revision of the edit is the newest revision")
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
          (finally
            (t2/delete! :model/Document :id id)
            (t2/delete! :model/Revision :model "Document" :model_id id))))
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

(defn- in-thread
  "Runs `f` in a new thread. Returns a promise of `{:ok result}` or `{:error message}`."
  [f]
  (let [out (promise)]
    (.start (Thread. #(deliver out (try {:ok (f)}
                                        (catch Throwable e {:error (error-text e)})))))
    out))

(defn- revert-to-creation-holding!
  "[[revert-to-creation!]] in a new thread, which delivers `reached` when its first `lock-revisions!` returns and then
  waits for `release`. Returns the promise of [[in-thread]]."
  [entity id reached release]
  (let [lock-revisions (mt/original-fn #'revisions.db/lock-revisions!)
        once           (atom false)]
    (in-thread #(mt/with-dynamic-fn-redefs [revisions.db/lock-revisions! (fn [& args]
                                                                           (u/prog1 (apply lock-revisions args)
                                                                             (when (compare-and-set! once false true)
                                                                               (deliver reached true)
                                                                               (deref release 10000 :timeout))))]
                  (revert-to-creation! entity id)))))

(defn- newest-name [entity id]
  (last (first (history entity id))))

(deftest revert-and-edit-of-other-document-test
  (testing "a revert of one document and an API edit of another document"
    (with-document
      (fn [a]
        (with-document
          (fn [b]
            (let [reached (promise)
                  release (promise)
                  revert  (revert-to-creation-holding! :model/Document a reached release)
                  _       (deref reached 10000 :timeout)
                  edit    (in-thread #(mt/user-http-request :crowberto :put 200 (str "document/" b) {:name "Other edit"}))]
              ;; time for the edit to write its Revision, or to wait for the revert
              (deref edit 1500 nil)
              (deliver release true)
              (let [revert-out (deref revert 60000 :timeout)
                    edit-out   (deref edit 60000 :timeout)
                    row-name   (t2/select-one-fn :name :model/Document :id a)]
                (is (not= :timeout revert-out) "the revert ends")
                (is (not= :timeout edit-out) "the edit ends")
                (is (or (contains? revert-out :error) (= "X0" row-name))
                    "the revert fails or keeps its change")
                (is (= row-name (newest-name :model/Document a))
                    "the newest revision shows the name of the row")))))))))

(deftest reverts-of-two-documents-test
  (testing "two concurrent reverts of two documents"
    (with-document
      (fn [a]
        (with-document
          (fn [b]
            (let [[reached-a reached-b] [(promise) (promise)]
                  release               (promise)
                  revert-a              (revert-to-creation-holding! :model/Document a reached-a release)
                  revert-b              (revert-to-creation-holding! :model/Document b reached-b release)]
              (is (= [true true] [(deref reached-a 10000 :timeout) (deref reached-b 10000 :timeout)])
                  "both reverts hold their locks at the same time")
              (deliver release true)
              (doseq [[id revert] [[a revert-a] [b revert-b]]
                      :let [revert-out (deref revert 60000 :timeout)
                            row-name   (t2/select-one-fn :name :model/Document :id id)]]
                (is (not= :timeout revert-out) "the revert ends")
                (is (or (contains? revert-out :error) (= "X0" row-name))
                    "the revert fails or keeps its change")
                (is (= row-name (newest-name :model/Document id))
                    "the newest revision shows the name of the row")))))))))

(deftest revert-fails-when-the-revisions-listener-error-ends-its-transaction-test
  (testing "an error in the revisions listener that ends the revert's transaction (a deadlock on MySQL or MariaDB)"
    (with-document
      (fn [id]
        (let [unmark (mt/original-fn #'revisions.db/unmark-most-recent-revisions!)
              calls  (atom 0)
              before (history :model/Document id)
              out    (try
                       (mt/with-dynamic-fn-redefs [revisions.db/unmark-most-recent-revisions!
                                                   (fn [& args]
                                                     ;; the first call comes from the listener, during the update of the row
                                                     (if (= 1 (swap! calls inc))
                                                       (throw (SQLTransactionRollbackException.
                                                               "Deadlock found when trying to get lock" "40001" 1213))
                                                       (apply unmark args)))]
                         {:ok (revert-to-creation! :model/Document id)})
                       (catch Throwable e {:error (error-text e)}))]
          (is (contains? out :error) "the revert fails")
          (is (= "X1" (t2/select-one-fn :name :model/Document :id id)) "the row keeps its name")
          (is (= before (history :model/Document id)) "the history does not change"))))))

(deftest bookmark-insert-during-revert-test
  (testing "an insert of a bookmark of a document does not wait for a revert of the document"
    (when (= :postgres (mdb/db-type))
      (with-document
        (fn [id]
          (let [reached (promise)
                release (promise)
                revert  (revert-to-creation-holding! :model/Document id reached release)
                _       (deref reached 10000 :timeout)
                started (System/nanoTime)
                insert  (in-thread #(t2/insert! :model/DocumentBookmark {:user_id (mt/user->id :rasta) :document_id id}))
                during  (deref insert 1000 :timeout)
                ms      (quot (- (System/nanoTime) started) 1000000)]
            (deliver release true)
            (let [revert-out (deref revert 60000 :timeout)
                  insert-out (deref insert 60000 :timeout)]
              (t2/delete! :model/DocumentBookmark :document_id id)
              (is (not= :timeout during)
                  (str "the insert ends while the revert holds its locks; waited " ms " ms"))
              (is (contains? insert-out :ok))
              (is (contains? revert-out :ok)))))))))

(deftest revert-waits-for-delete-test
  (testing "a revert that waits for a delete of the same document"
    (with-document
      (fn [id]
        (let [deleted (promise)
              go      (promise)
              delete  (in-thread #(t2/with-transaction [_]
                                    (t2/delete! :model/Document :id id)
                                    (deliver deleted true)
                                    (deref go 10000 :timeout)
                                    :deleted))
              _       (deref deleted 10000 :timeout)
              reached (promise)
              lock    (mt/original-fn #'revisions.db/lock-entity!)
              revert  (in-thread #(mt/with-dynamic-fn-redefs [revisions.db/lock-entity! (fn [& args]
                                                                                          (deliver reached true)
                                                                                          (apply lock args))]
                                    (revert-to-creation! :model/Document id)))]
          (deref reached 10000 :timeout)
          ;; time for the revert to wait at the row lock
          (is (= :timeout (deref revert 1000 :timeout)) "the revert waits for the delete")
          (deliver go true)
          (let [revert-out (deref revert 60000 :timeout)]
            (is (= {:ok :deleted} (deref delete 60000 :timeout)))
            (is (nil? (t2/select-one :model/Document :id id)))
            (is (or (contains? revert-out :error) (nil? (:ok revert-out)))
                (str "the revert of a deleted document fails; revert returned: "
                     (pr-str (or (some-> (:ok revert-out) (select-keys [:id :is_reversion])) revert-out))))
            (is (not-any? second (history :model/Document id))
                "no reversion is recorded for a deleted document")))))))

(ns metabase.collections.db-test
  "The collection mutators take a proof as their only argument: this is the seam where a forgotten check cannot write.
  The writes to a Collection's contents take proofs cascaded from the Collection's own, keyed by its id."
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.collections.db :as collections.db]
   [metabase.collections.models.collection :as collection]
   [metabase.proof.core :as proof]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- collection-proof
  "A test-only proof for a write to Collection."
  [write]
  (proof/test-only (assoc write :model :model/Collection)))

(defn- collection-name [id]
  (t2/select-one-fn :name :model/Collection :id id))

(deftest update-collection!-test
  (mt/with-temp [:model/Collection {id :id} {:name "before"}]
    (let [update-proof (fn [changes]
                         (collection-proof {:operation :update, :subject id, :changes changes}))]
      (testing "with a matching proof, writes exactly the change set"
        (collections.db/update-collection! (update-proof {:name "after"}))
        (is (= "after" (collection-name id))))
      (testing "refuses anything that is not exactly a proof for this write"
        (doseq [[label value] [["nil" nil]
                               ["a hand-built value"
                                {:model     :model/Collection
                                 :operation :update
                                 :subject   id
                                 :changes   {:name "forged"}}]
                               ["a proof for another model"
                                (proof/test-only {:model     :model/Card
                                                  :operation :update
                                                  :subject   id
                                                  :changes   {:name "forged"}})]
                               ["a proof for another operation"
                                (collection-proof {:operation :delete, :subject id})]
                               ["a proof over a where-clause"
                                (collection-proof {:operation :update
                                                   :subject   [:= :id id]
                                                   :changes   {:name "forged"}})]
                               ["a proof issued under another user"
                                (binding [api/*current-user-id* (mt/user->id :rasta)]
                                  (update-proof {:name "forged"}))]]]
          (testing label
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"^Invalid proof"
                                  (collections.db/update-collection! value)))))
        (is (= "after" (collection-name id)))))))

(deftest insert-collection!-test
  (mt/with-model-cleanup [:model/Collection]
    (let [row {:name "inserted", :location "/"}]
      (testing "with a matching proof, inserts exactly the row"
        (let [inserted (collections.db/insert-collection! (collection-proof {:operation :create, :changes row}))]
          (is (=? {:name "inserted", :location "/"} inserted))
          (is (= "inserted" (collection-name (:id inserted))))))
      (testing "refuses anything that is not exactly a proof for this write"
        (doseq [[label value] [["nil" nil]
                               ["a hand-built value" {:model :model/Collection, :operation :create, :changes row}]
                               ["a proof for another model"
                                (proof/test-only {:model :model/Card, :operation :create, :changes row})]
                               ["a proof for another operation"
                                (collection-proof {:operation :update, :subject 1, :changes row})]]]
          (testing label
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"^Invalid proof"
                                  (collections.db/insert-collection! value)))))
        (is (= 1 (t2/count :model/Collection :name "inserted")))))))

(deftest delete-collection!-test
  (mt/with-temp [:model/Collection {id :id} {}]
    (testing "refuses anything that is not exactly a proof for this write"
      (doseq [[label value] [["nil" nil]
                             ["a hand-built value"
                              {:model :model/Collection, :operation :delete, :subject id}]
                             ["a proof for another model"
                              (proof/test-only {:model :model/Card, :operation :delete, :subject id})]
                             ["a proof for another operation"
                              (collection-proof {:operation :update, :subject id, :changes {}})]
                             ["a proof over a where-clause"
                              (collection-proof {:operation :delete, :subject [:= :id id]})]
                             ["a proof issued under another user"
                              (binding [api/*current-user-id* (mt/user->id :rasta)]
                                (collection-proof {:operation :delete, :subject id}))]]]
        (testing label
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"^Invalid proof"
                                (collections.db/delete-collection! value)))))
      (is (t2/exists? :model/Collection :id id)))
    (testing "with a matching proof, deletes exactly that row"
      (is (= 1 (collections.db/delete-collection! (collection-proof {:operation :delete, :subject id}))))
      (is (not (t2/exists? :model/Collection :id id))))))

(deftest clear-remote-synced-flags!-test
  (mt/with-temp [:model/Collection {id :id} {:is_remote_synced true}]
    (testing "refuses any change set but clearing the flag"
      (doseq [changes [{:is_remote_synced true} {:is_remote_synced false, :name "forged"} {:name "forged"}]]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"^Invalid proof"
                              (collections.db/clear-remote-synced-flags!
                               (collection-proof {:operation :update
                                                  :subject   [:= :is_remote_synced true]
                                                  :changes   changes})))))
      (is (true? (t2/select-one-fn :is_remote_synced :model/Collection :id id))))
    (testing "with the matching proof, clears it"
      (collections.db/clear-remote-synced-flags! (proof/test-only collection/clear-remote-synced-write))
      (is (false? (t2/select-one-fn :is_remote_synced :model/Collection :id id))))))

(deftest cascade-mutators-test
  (mt/with-temp [:model/Collection {a :id, :as coll-a} {}
                 :model/Collection {a-child :id} {:location (collection/children-location coll-a)}
                 :model/Collection {b :id} {}
                 :model/Card {card-in-a :id} {:collection_id a}
                 :model/Card {card-in-a-child :id} {:collection_id a-child}
                 :model/Card {card-in-b :id} {:collection_id b}]
    (let [operation-id (str (random-uuid))
          a-proof      (collection-proof {:operation :update
                                          :subject   a
                                          :changes   {:archive_operation_id operation-id
                                                      :archived_directly    true
                                                      :archived             true}})
          archived?    (fn [card-id] (t2/select-one-fn :archived :model/Card :id card-id))]
      (testing "the cascade proof derived from the collection's archive writes exactly the rows inside it and its descendants"
        ;; the contents are keyed by the operation id, which the Collections carry once the archive has marked them
        (collections.db/update-collection! a-proof)
        (collections.db/update-descendant-collections! (proof/cascade a-proof :model/Collection))
        (proof/apply-cascade! :model/Card (proof/cascade a-proof :model/Card))
        (is (true? (archived? card-in-a)))
        (is (true? (archived? card-in-a-child)))
        (is (false? (archived? card-in-b))))
      (testing "a content module's mutator refuses anything but a cascade proof for its model"
        (doseq [[label value] [["nil" nil]
                               ["the collection's own proof" a-proof]
                               ["a cascade proof for another model" (proof/cascade a-proof :model/Dashboard)]
                               ["a proof for one row by id"
                                (proof/test-only {:model     :model/Card
                                                  :operation :update
                                                  :subject   card-in-b
                                                  :changes   {:archived true}})]]]
          (testing label
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"^Invalid proof"
                                  (proof/apply-cascade! :model/Card value)))))
        (is (false? (archived? card-in-b))))
      (testing "a content module's mutator writes only the columns the cascade is for"
        (doseq [changes [{:name "forged"} {:archived true, :collection_id b}]]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"^Invalid proof.*other columns"
                                (proof/apply-cascade!
                                 :model/Card
                                 (proof/test-only {:model     :model/Card
                                                   :operation :update
                                                   :subject   [:= :collection_id a]
                                                   :changes   changes})))))
        (is (zero? (t2/count :model/Card :name "forged")))
        (is (= b (t2/select-one-fn :collection_id :model/Card :id card-in-b))))
      (testing "the descendant mutator refuses a proof for one row by id"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"^Invalid proof"
                              (collections.db/update-descendant-collections! a-proof)))))))

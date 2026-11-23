(ns metabase.documents.models.document-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.documents.models.document-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.test-utils :refer [personal-collection-id]]
   [metabase.documents.models.document :as document]
   [metabase.documents.schema :as documents.schema]
   [metabase.documents.test-util :as documents.tu]
   [metabase.events.core :as events]
   [metabase.events.test-util :as events.tu]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.permissions.data-permissions :as data-perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.serialization.core :as serialization]
   [metabase.stale-test :as stale-test]
   [metabase.staleness.core :as staleness]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.util :as tu]
   [metabase.users.models.user :as user]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest public-sharing-test
  (testing "Document's :public_uuid visibility based on public sharing setting"
    (testing "comes back if public sharing is enabled"
      (tu/with-temporary-setting-values [enable-public-sharing true]
        (mt/with-temp [:model/Document document {:public_uuid (str (random-uuid))}]
          (is (=? u/uuid-regex
                  (:public_uuid document))))))
    (testing "comes back as nil if public sharing is disabled"
      (tu/with-temporary-setting-values [enable-public-sharing false]
        (mt/with-temp [:model/Document document {:public_uuid (str (random-uuid))}]
          (is (= nil
                 (:public_uuid document))))))))

(deftest document-collection-sync-hook-triggers-on-collection-change-test
  (testing "Hook is called when document collection_id changes"
    (mt/with-temp
      [:model/Collection {old-collection-id :id} {:name "Old Collection"}
       :model/Collection {new-collection-id :id} {:name "New Collection"}
       :model/Document {document-id :id} {:collection_id old-collection-id
                                          :name "Test Document"}
       :model/Card {card1-id :id} {:name "Card 1"
                                   :document_id document-id
                                   :collection_id old-collection-id}
       :model/Card {card2-id :id} {:name "Card 2"
                                   :document_id document-id
                                   :collection_id old-collection-id}]
      ;; Update the document's collection_id
      (document/update-documents! [{:id document-id :collection_id new-collection-id}])
      ;; Verify that associated cards were updated to match the new collection
      (is (= new-collection-id (:collection_id (t2/select-one :model/Card :id card1-id))))
      (is (= new-collection-id (:collection_id (t2/select-one :model/Card :id card2-id)))))))

(deftest document-collection-sync-hook-handles-nil-collections-test
  (testing "Hook correctly handles nil collection values"
    (mt/with-temp
      [:model/Collection {collection-id :id} {:name "Test Collection"}
       :model/Document {document-id :id} {:collection_id collection-id
                                          :name "Test Document"}
       :model/Card {card-id :id} {:name "Card"
                                  :document_id document-id
                                  :collection_id collection-id}]
      ;; Move document to no collection (nil)
      (document/update-documents! [{:id document-id :collection_id nil}])
      ;; Verify that the card's collection_id was updated to nil
      (is (nil? (:collection_id (t2/select-one :model/Card :id card-id)))))))

(deftest document-collection-sync-hook-only-affects-cards-test
  (testing "Hook only updates cards with  matching document_id"
    (mt/with-temp
      [:model/Collection {old-collection-id :id} {:name "Old Collection"}
       :model/Collection {new-collection-id :id} {:name "New Collection"}
       :model/Document {document-id :id} {:collection_id old-collection-id
                                          :name "Test Document"}
       ;; Card that should be updated (correct type and document_id)
       :model/Card {in-document-card-id :id} {:name "In-Document Card"
                                              :type :question
                                              :document_id document-id
                                              :collection_id old-collection-id}
       ;; Card that should be updated (wrong type)
       :model/Card {question-card-id :id} {:name "Question Card"
                                           :type :model
                                           :collection_id old-collection-id}
       ;; Card that should NOT be updated (no document_id)
       :model/Card {regular-card-id :id} {:name "Regular Card"
                                          :collection_id old-collection-id}]
      ;; Update the document's collection_id
      (document/update-documents! [{:id document-id :collection_id new-collection-id}])
      ;; Verify only the correct card was updated
      (is (= new-collection-id (:collection_id (t2/select-one :model/Card :id in-document-card-id))))
      ;; Verify other cards were NOT updated
      (is (= old-collection-id (:collection_id (t2/select-one :model/Card :id question-card-id))))
      (is (= old-collection-id (:collection_id (t2/select-one :model/Card :id regular-card-id)))))))

(deftest personal-collection-edge-cases-test
  (testing "Personal collection handling"
    (binding [collection/*allow-deleting-personal-collections* true]
      (mt/with-model-cleanup [:model/Collection :model/User]
        (let [[{user-id :id}] (user/create-users! [{:first_name "Test" :last_name "User" :email "test@example.com"}])]
          (mt/with-temp [:model/Collection {regular-collection-id :id} {:name "Regular Collection"}
                         :model/Document {document-id :id} {:collection_id regular-collection-id
                                                            :name "Personal Test Document"}
                         :model/Card {card-id :id} {:name "Personal Card"
                                                    :document_id document-id
                                                    :collection_id regular-collection-id
                                                    :dataset_query (mt/mbql-query venues)}]
            (let [personal-coll-id (personal-collection-id user-id)]
              (testing "moving document to personal collection moves associated cards"
                (mt/with-current-user user-id
                  ;; As the personal collection owner, update should succeed
                  (document/update-documents! [{:id document-id :collection_id personal-coll-id}])
                  ;; Verify both document and card moved to personal collection
                  (is (= personal-coll-id (:collection_id (t2/select-one :model/Document :id document-id))))
                  (is (= personal-coll-id (:collection_id (t2/select-one :model/Card :id card-id))))))
              (testing "moving document from personal collection works"
                (mt/with-current-user user-id
                  ;; Move back to regular collection
                  (document/update-documents! [{:id document-id :collection_id regular-collection-id}])
                  ;; Verify both document and card moved back
                  (is (= regular-collection-id (:collection_id (t2/select-one :model/Document :id document-id))))
                  (is (= regular-collection-id (:collection_id (t2/select-one :model/Card :id card-id)))))))))))))

(defn- move-allowed?
  "Whether the current user may move the Document in `old-collection-id` to `new-collection-id`."
  [old-collection-id new-collection-id]
  (mt/with-temp [:model/Document document {:collection_id old-collection-id}]
    (mi/can-update? (t2/hydrate document :can_write) {:collection_id new-collection-id})))

(deftest can-update-collection-move-test
  (testing "moving a Document needs write access to both its Collection and the Collection it moves to"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {old-id :id} {}
                     :model/Collection {new-id :id} {}]
        (mt/with-model-cleanup [:model/User]
          (let [[{user-id :id}] (user/create-users! [{:email (mt/random-email)}])]
            (mt/with-current-user user-id
              (perms/grant-collection-readwrite-permissions! (perms/all-users-group) old-id)
              (is (false? (move-allowed? old-id new-id)))
              (perms/grant-collection-readwrite-permissions! (perms/all-users-group) new-id)
              (is (true? (move-allowed? old-id new-id))))
            (mt/with-current-user user-id
              (mt/with-temp [:model/Collection {other-id :id} {}
                             :model/Document document {:collection_id old-id}]
                (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                                      (api/update-check document {:collection_id other-id})))))))))))

(deftest can-update-root-collection-move-test
  (testing "moving a Document from or to the root Collection needs write access to the root Collection"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {coll-id :id} {}]
        (mt/with-model-cleanup [:model/User]
          (let [[{user-id :id}] (user/create-users! [{:email (mt/random-email)}])]
            (mt/with-current-user user-id
              (perms/grant-collection-readwrite-permissions! (perms/all-users-group) coll-id)
              (is (false? (move-allowed? coll-id nil)))
              (is (false? (move-allowed? nil coll-id)))
              (perms/grant-collection-readwrite-permissions! (perms/all-users-group) collection/root-collection)
              (is (true? (move-allowed? coll-id nil)))
              (is (true? (move-allowed? nil coll-id))))))))))

(deftest can-update-without-collection-move-test
  (testing "an update that keeps the Collection needs only write access to the Document"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Document document {:collection_id coll-id}]
        (mt/with-model-cleanup [:model/User]
          (let [[{user-id :id}] (user/create-users! [{:email (mt/random-email)}])]
            (mt/with-current-user user-id
              (perms/grant-collection-readwrite-permissions! (perms/all-users-group) coll-id)
              (is (true? (mi/can-update? (t2/hydrate document :can_write) {:name "New name"})))
              (is (true? (mi/can-update? (t2/hydrate document :can_write) {:collection_id coll-id}))))))))))

(deftest can-update-public-sharing-test
  (testing "only superusers change the public sharing columns of a Document"
    (mt/with-temp [:model/Document document {}]
      (letfn [(can-update? [user changes]
                (mt/with-current-user (mt/user->id user)
                  (mi/can-update? (t2/hydrate document :can_write) changes)))]
        (is (true? (can-update? :crowberto {:public_uuid (str (random-uuid))})))
        (is (false? (can-update? :rasta {:public_uuid (str (random-uuid))})))
        (is (false? (can-update? :rasta {:made_public_by_id (mt/user->id :rasta)})))
        (is (true? (can-update? :rasta {:name "New name"})))))))

(deftest can-create-test
  (testing "creating a Document needs write access to its Collection"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {coll-id :id} {}]
        (mt/with-model-cleanup [:model/User]
          (let [[{user-id :id}] (user/create-users! [{:email (mt/random-email)}])]
            (mt/with-current-user user-id
              (is (false? (mi/can-create? :model/Document {:collection_id coll-id})))
              (perms/grant-collection-readwrite-permissions! (perms/all-users-group) coll-id)
              (is (true? (mi/can-create? :model/Document {:collection_id coll-id}))))))))))

(deftest document-does-not-go-into-archived-collection-test
  (mt/with-temp [:model/Collection {archived-id :id} {:archived true}
                 :model/Document   document          {}]
    (testing "moving a Document that is not archived into an archived Collection is a 400"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"archived Collection"
                            (document/update-documents! [{:id (:id document) :collection_id archived-id}])))
      (is (nil? (t2/select-one-fn :collection_id :model/Document :id (:id document)))))
    (testing "a Document that stays where it is, or goes to the root, passes"
      (is (= 1 (t2/update! :model/Document :id (:id document) {:name "Renamed"})))
      (is (nil? (document/update-documents! [{:id (:id document) :collection_id nil}]))))))

(deftest document-schema-test
  (testing "the Document schema takes a non-blank name of at most 254 characters"
    (doseq [bad-name ["" "   " (apply str (repeat 255 "a"))]]
      (is (not (mr/validate ::documents.schema/document.update {:name bad-name}))))
    (is (mr/validate ::documents.schema/document.update {:name (apply str (repeat 254 "a"))})))
  (testing "the Document schema takes a body only when it is a ProseMirror node"
    (is (not (mr/validate ::documents.schema/document.update {:document {:content []}})))
    (is (mr/validate ::documents.schema/document.update {:document {:type "doc" :content []}}))))

(deftest collection-namespace-test
  (testing "a Document goes only in Collections of an allowed namespace"
    (mt/with-temp [:model/Collection {snippets-id :id} {:namespace "snippets"}
                   :model/Document {doc-id :id} {}]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"namespace"
                            (document/create-documents! [{:name "Document" :creator_id (mt/user->id :rasta) :content_type "application/json+vnd.prose-mirror" :document {:type "doc" :content []} :collection_id snippets-id}])))
      (is (not (t2/exists? :model/Document :collection_id snippets-id)))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"namespace"
                            (document/update-documents! [{:id doc-id :collection_id snippets-id}])))
      (is (nil? (t2/select-one-fn :collection_id :model/Document :id doc-id))))))

(deftest public-uuid-prefix-is-derived-test
  (testing "the public UUID prefix follows the public UUID and is not written alone"
    (mt/with-temp [:model/Document {doc-id :id} {}]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"follows its public UUID"
                            (t2/update! :model/Document :id doc-id {:public_uuid_prefix "abcdefgh"})))
      (let [uuid (str (random-uuid))]
        (t2/update! :model/Document :id doc-id {:public_uuid uuid})
        (is (= (subs uuid 0 8) (t2/select-one-fn :public_uuid_prefix :model/Document :id doc-id)))))))

(deftest cards-follow-collection-only-when-it-changes-test
  (testing "updating a Document leaves its Cards in their Collection unless its own Collection changes"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Collection {card-coll-id :id} {}
                   :model/Collection {new-coll-id :id} {}
                   :model/Document {doc-id :id} {:collection_id coll-id}
                   :model/Card {card-id :id} {:document_id doc-id :collection_id coll-id}]
      (t2/update! :model/Card :id card-id {:collection_id card-coll-id})
      (t2/update! :model/Document :id doc-id {:name "Renamed"})
      (is (= card-coll-id (t2/select-one-fn :collection_id :model/Card :id card-id)))
      (document/update-documents! [{:id doc-id :collection_id new-coll-id}])
      (is (= new-coll-id (t2/select-one-fn :collection_id :model/Card :id card-id))))))

(deftest hydrate-document-creator-test
  (testing "hydrates document creator correctly"
    (mt/with-temp [:model/User {user-id :id} {:first_name "John"
                                              :last_name "Doe"
                                              :email "john.doe@example.com"}
                   :model/Document {document-id :id} {:name "Test Document"
                                                      :creator_id user-id}]
      (let [hydrated-doc (t2/hydrate (t2/select-one :model/Document :id document-id) :creator)]
        (testing "creator is hydrated with correct user data"
          (is (some? (:creator hydrated-doc)))
          (is (= user-id (get-in hydrated-doc [:creator :id])))
          (is (= "John" (get-in hydrated-doc [:creator :first_name])))
          (is (= "Doe" (get-in hydrated-doc [:creator :last_name])))
          (is (= "john.doe@example.com" (get-in hydrated-doc [:creator :email]))))))))

(deftest hydrate-multiple-documents-creator-test
  (testing "hydrates creators for multiple documents efficiently"
    (mt/with-temp [:model/User {user1-id :id} {:first_name "Alice"
                                               :last_name "Smith"
                                               :email "alice@example.com"}
                   :model/User {user2-id :id} {:first_name "Bob"
                                               :last_name "Jones"
                                               :email "bob@example.com"}
                   :model/Document {doc1-id :id} {:name "Document 1"
                                                  :creator_id user1-id}
                   :model/Document {doc2-id :id} {:name "Document 2"
                                                  :creator_id user2-id}
                   :model/Document {doc3-id :id} {:name "Document 3"
                                                  :creator_id user1-id}] ; Same creator as doc1
      (let [documents (t2/select :model/Document :id [:in [doc1-id doc2-id doc3-id]])
            hydrated-docs (t2/hydrate documents :creator)]
        (testing "all documents have their creators hydrated"
          (is (= 3 (count hydrated-docs)))
          (doseq [doc hydrated-docs]
            (is (some? (:creator doc)))
            (is (some? (get-in doc [:creator :id])))
            (is (some? (get-in doc [:creator :first_name])))
            (is (some? (get-in doc [:creator :last_name])))
            (is (some? (get-in doc [:creator :email])))))
        (testing "creators are correctly matched to documents"
          (let [doc1 (first (filter #(= doc1-id (:id %)) hydrated-docs))
                doc2 (first (filter #(= doc2-id (:id %)) hydrated-docs))
                doc3 (first (filter #(= doc3-id (:id %)) hydrated-docs))]
            (is (= user1-id (get-in doc1 [:creator :id])))
            (is (= "Alice" (get-in doc1 [:creator :first_name])))
            (is (= user2-id (get-in doc2 [:creator :id])))
            (is (= "Bob" (get-in doc2 [:creator :first_name])))
            (is (= user1-id (get-in doc3 [:creator :id])))
            (is (= "Alice" (get-in doc3 [:creator :first_name])))))))))

(deftest hydrate-document-cards-test
  (testing "hydrates document cards correctly"
    (mt/with-temp [:model/Document {document-id :id} {:name "Test Document"}
                   :model/Card {card1-id :id} {:name "Card 1"
                                               :dataset_query (mt/mbql-query venues {:limit 5})
                                               :document_id document-id}
                   :model/Card {card2-id :id} {:name "Card 2"
                                               :dataset_query (mt/mbql-query venues {:limit 10})
                                               :document_id document-id}]
      (let [hydrated-doc (t2/hydrate (t2/select-one :model/Document :id document-id) :cards)]
        (testing "cards are hydrated as a map keyed by card ID"
          (is (map? (:cards hydrated-doc)))
          (is (= 2 (count (:cards hydrated-doc))))
          (is (contains? (:cards hydrated-doc) card1-id))
          (is (contains? (:cards hydrated-doc) card2-id)))
        (testing "cards contain correct data"
          (is (= "Card 1" (get-in hydrated-doc [:cards card1-id :name])))
          (is (= "Card 2" (get-in hydrated-doc [:cards card2-id :name])))
          (is (= document-id (get-in hydrated-doc [:cards card1-id :document_id])))
          (is (= document-id (get-in hydrated-doc [:cards card2-id :document_id]))))))))

(deftest hydrate-document-cards-excludes-archived-test
  (testing "hydrated cards exclude archived cards"
    (mt/with-temp [:model/Document {document-id :id} {:name "Test Document"}
                   :model/Card {active-card-id :id} {:name "Active Card"
                                                     :dataset_query (mt/mbql-query venues {:limit 5})
                                                     :document_id document-id
                                                     :archived false}
                   :model/Card {archived-card-id :id} {:name "Archived Card"
                                                       :dataset_query (mt/mbql-query venues {:limit 5})
                                                       :document_id document-id
                                                       :archived true}]
      (let [hydrated-doc (t2/hydrate (t2/select-one :model/Document :id document-id) :cards)]
        (testing "only active cards are included"
          (is (= 1 (count (:cards hydrated-doc))))
          (is (contains? (:cards hydrated-doc) active-card-id))
          (is (not (contains? (:cards hydrated-doc) archived-card-id))))))))

(deftest hydrate-multiple-documents-cards-test
  (testing "hydrates cards for multiple documents efficiently"
    (mt/with-temp [:model/Document {doc1-id :id} {:name "Document 1"}
                   :model/Document {doc2-id :id} {:name "Document 2"}
                   :model/Document {doc3-id :id} {:name "Document 3"}
                   :model/Card {card1-id :id} {:name "Card 1"
                                               :dataset_query (mt/mbql-query venues {:limit 5})
                                               :document_id doc1-id}
                   :model/Card {card2-id :id} {:name "Card 2"
                                               :dataset_query (mt/mbql-query venues {:limit 5})
                                               :document_id doc1-id}
                   :model/Card {card3-id :id} {:name "Card 3"
                                               :dataset_query (mt/mbql-query venues {:limit 5})
                                               :document_id doc2-id}]
      (let [documents (t2/select :model/Document :id [:in [doc1-id doc2-id doc3-id]])
            hydrated-docs (t2/hydrate documents :cards)]
        (testing "all documents have cards field"
          (is (= 3 (count hydrated-docs)))
          (doseq [doc hydrated-docs]
            (is (map? (:cards doc)))))
        (testing "cards are correctly matched to documents"
          (let [doc1 (first (filter #(= doc1-id (:id %)) hydrated-docs))
                doc2 (first (filter #(= doc2-id (:id %)) hydrated-docs))
                doc3 (first (filter #(= doc3-id (:id %)) hydrated-docs))]
            (testing "document 1 has two cards"
              (is (= 2 (count (:cards doc1))))
              (is (contains? (:cards doc1) card1-id))
              (is (contains? (:cards doc1) card2-id)))
            (testing "document 2 has one card"
              (is (= 1 (count (:cards doc2))))
              (is (contains? (:cards doc2) card3-id)))
            (testing "document 3 has no cards"
              (is (empty? (:cards doc3))))))))))

(deftest document-collection-position-field-handling-test
  (testing "Document model supports collection_position field"
    (mt/with-temp [:model/Collection {collection-id :id} {:name "Test Collection"}
                   :model/Document {document-id :id} {:name "Positioned Document"
                                                      :collection_id collection-id
                                                      :collection_position 5}]
      (let [document (t2/select-one :model/Document :id document-id)]
        (testing "collection_position is stored and retrieved correctly"
          (is (= 5 (:collection_position document)))))
      (testing "collection_position can be updated"
        (t2/update! :model/Document :id document-id {:collection_position 10})
        (let [updated-document (t2/select-one :model/Document :id document-id)]
          (is (= 10 (:collection_position updated-document)))))
      (testing "collection_position can be set to nil"
        (t2/update! :model/Document :id document-id {:collection_position nil})
        (let [updated-document (t2/select-one :model/Document :id document-id)]
          (is (nil? (:collection_position updated-document))))))))

;;; ------------------------------------------------- Serialization Tests -------------------------------------------

(deftest document-serdes-dependencies-test
  (testing "Document dependencies method works correctly"
    (testing "with collection and creator"
      (let [document {:collection_id 123
                      :creator_id 456
                      :serdes/meta [{:model "Document"}]}
            deps (first (serialization/import-dependencies :model/Document [document]))]
        (is (= #{[:model/Collection 123]}
               deps))))))

(deftest document-serdes-smartlink-single-reference-test
  (testing "single smartLink card reference"
    (let [document {:collection_id 123
                    :creator_id 456
                    :document {:type "doc"
                               :content [{:type "paragraph"
                                          :content [{:type "smartLink"
                                                     :attrs {:entityId [{:model "Card" :id 789}]
                                                             :model "card"}}]}]}
                    :content_type "application/json+vnd.prose-mirror"
                    :serdes/meta [{:model "Document"}]}
          deps (first (serialization/import-dependencies :model/Document [document]))]
      (is (contains? deps [:model/Card 789]))
      (is (contains? deps [:model/Collection 123])))))

(deftest document-serdes-smartlink-multiple-references-test
  (testing "multiple smartLink references of different types"
    (let [document {:collection_id 123
                    :creator_id 456
                    :document {:type "doc"
                               :content [{:type "paragraph"
                                          :content [{:type "smartLink"
                                                     :attrs {:entityId [{:model "Card" :id 789}]
                                                             :model "card"}}
                                                    {:type "smartLink"
                                                     :attrs {:entityId [{:model "Dashboard" :id 456}]
                                                             :model "dashboard"}}
                                                    {:type "smartLink"
                                                     :attrs {:entityId [{:model "Database" :id "db"} {:model "Table" :id "t"}]
                                                             :model "table"}}]}]}
                    :content_type "application/json+vnd.prose-mirror"
                    :serdes/meta [{:model "Document"}]}
          deps (first (serialization/import-dependencies :model/Document [document]))]
      (is (contains? deps [:model/Card 789]))
      (is (contains? deps [:model/Dashboard 456]))
      (is (contains? deps [:model/Table ["db" nil "t"]]))
      (is (contains? deps [:model/Collection 123])))))

(deftest document-serdes-smartlink-nested-structure-test
  (testing "nested smartLink in complex prose mirror structure"
    (let [document {:collection_id 123
                    :creator_id 456
                    :document {:type "doc"
                               :content [{:type "paragraph"
                                          :content [{:type "text" :text "Some text"}]}
                                         {:type "bulletList"
                                          :content [{:type "listItem"
                                                     :content [{:type "paragraph"
                                                                :content [{:type "smartLink"
                                                                           :attrs {:entityId [{:model "Card" :id 999}]
                                                                                   :model "card"}}]}]}]}]}
                    :content_type "application/json+vnd.prose-mirror"
                    :serdes/meta [{:model "Document"}]}
          deps (first (serialization/import-dependencies :model/Document [document]))]
      (is (contains? deps [:model/Card 999]))
      (is (contains? deps [:model/Collection 123])))))

(deftest document-serdes-smartlink-no-smartlinks-test
  (testing "document with no smartLinks"
    (let [document {:collection_id 123
                    :creator_id 456
                    :document {:type "doc"
                               :content [{:type "paragraph"
                                          :content [{:type "text" :text "Plain text only"}]}]}
                    :content_type "application/json+vnd.prose-mirror"
                    :serdes/meta [{:model "Document"}]}
          deps (first (serialization/import-dependencies :model/Document [document]))]
      (is (= #{[:model/Collection 123]}
             deps)))))

(deftest document-serdes-smartlink-unknown-model-test
  (testing "unknown smartLink model type is ignored"
    (let [document {:collection_id 123
                    :creator_id 456
                    :document {:type "doc"
                               :content [{:type "paragraph"
                                          :content [{:type "smartLink"
                                                     :attrs {:entityId [{:model "Unknown" :id 789}]
                                                             :model "unknown-model"}}
                                                    {:type "smartLink"
                                                     :attrs {:entityId [{:model "Card" :id 456}]
                                                             :model "card"}}]}]}
                    :content_type "application/json+vnd.prose-mirror"
                    :serdes/meta [{:model "Document"}]}
          deps (first (serialization/import-dependencies :model/Document [document]))]
      (is (contains? deps [:model/Card 456]))
      (is (= #{[:model/Card 456] [:model/Collection 123]} deps)))))

(deftest document-serdes-smartlink-missing-entity-id-test
  (testing "smartLink with missing entityId is ignored"
    (let [document {:collection_id 123
                    :creator_id 456
                    :document {:type "doc"
                               :content [{:type "paragraph"
                                          :content [{:type "smartLink"
                                                     :attrs {:model "card"}}
                                                    {:type "smartLink"
                                                     :attrs {:entityId [{:model "Card" :id 456}]
                                                             :model "card"}}]}]}
                    :content_type "application/json+vnd.prose-mirror"
                    :serdes/meta [{:model "Document"}]}
          deps (first (serialization/import-dependencies :model/Document [document]))]
      (is (contains? deps [:model/Card 456]))
      (is (= 2 (count deps)))))) ; collection and one valid card

(deftest document-serdes-smartlink-duplicate-references-test
  (testing "duplicate smartLink references are deduplicated"
    (let [document {:collection_id 123
                    :creator_id 456
                    :document {:type "doc"
                               :content [{:type "paragraph"
                                          :content [{:type "smartLink"
                                                     :attrs {:entityId [{:model "Card" :id 789}]
                                                             :model "card"}}
                                                    {:type "smartLink"
                                                     :attrs {:entityId [{:model "Card" :id 789}]
                                                             :model "card"}}]}]}
                    :content_type "application/json+vnd.prose-mirror"
                    :serdes/meta [{:model "Document"}]}
          deps (first (serialization/import-dependencies :model/Document [document]))]
      (is (contains? deps [:model/Card 789]))
      (is (= 2 (count deps)))))) ; collection and one unique card

(deftest document-serdes-smartlink-empty-content-test
  (testing "empty document content"
    (let [document {:collection_id 123
                    :creator_id 456
                    :document {:type "doc"
                               :content []}
                    :content_type "application/json+vnd.prose-mirror"
                    :serdes/meta [{:model "Document"}]}
          deps (first (serialization/import-dependencies :model/Document [document]))]
      (is (= #{[:model/Collection 123]}
             deps)))))

(deftest document-serdes-smartlink-missing-model-test
  (testing "smartLink with missing model is ignored"
    (let [document {:collection_id 123
                    :creator_id 456
                    :document {:type "doc"
                               :content [{:type "paragraph"
                                          :content [{:type "smartLink"
                                                     :attrs {:entityId [{:model "Card" :id 789}]}}
                                                    {:type "smartLink"
                                                     :attrs {:entityId [{:model "Card" :id 456}]
                                                             :model "card"}}]}]}
                    :content_type "application/json+vnd.prose-mirror"
                    :serdes/meta [{:model "Document"}]}
          deps (first (serialization/import-dependencies :model/Document [document]))]
      (is (contains? deps [:model/Card 456]))
      (is (= 2 (count deps)))))) ; collection and one valid card

(deftest document-serdes-smartlink-nil-attrs-test
  (testing "smartLink with nil attrs is ignored"
    (let [document {:collection_id 123
                    :creator_id 456
                    :document {:type "doc"
                               :content [{:type "paragraph"
                                          :content [{:type "smartLink"
                                                     :attrs nil}
                                                    {:type "smartLink"
                                                     :attrs {:entityId [{:model "Card" :id 456}]
                                                             :model "card"}}]}]}
                    :content_type "application/json+vnd.prose-mirror"
                    :serdes/meta [{:model "Document"}]}
          deps (first (serialization/import-dependencies :model/Document [document]))]
      (is (contains? deps [:model/Card 456]))
      (is (= 2 (count deps)))))) ; collection and one valid card

(deftest document-serdes-smartlink-mixed-content-test
  (testing "mix of smartLinks and other node types"
    (let [document {:collection_id 123
                    :creator_id 456
                    :document {:type "doc"
                               :content [{:type "paragraph"
                                          :content [{:type "text" :text "Check out this "}
                                                    {:type "smartLink"
                                                     :attrs {:entityId [{:model "Card" :id 789}]
                                                             :model "card"}}
                                                    {:type "text" :text " and this "}
                                                    {:type "smartLink"
                                                     :attrs {:entityId [{:model "Dashboard" :id 456}]
                                                             :model "dashboard"}}]}
                                         {:type "heading"
                                          :attrs {:level 2}
                                          :content [{:type "text" :text "Section with table"}]}
                                         {:type "table"
                                          :content [{:type "tableRow"
                                                     :content [{:type "tableCell"
                                                                :content [{:type "paragraph"
                                                                           :content [{:type "smartLink"
                                                                                      :attrs {:entityId [{:model "Database" :id "db"} {:model "Table" :id "t"}]
                                                                                              :model "table"}}]}]}]}]}]}
                    :content_type "application/json+vnd.prose-mirror"
                    :serdes/meta [{:model "Document"}]}
          deps (first (serialization/import-dependencies :model/Document [document]))]
      (is (contains? deps [:model/Card 789]))
      (is (contains? deps [:model/Dashboard 456]))
      (is (contains? deps [:model/Table ["db" nil "t"]]))
      (is (contains? deps [:model/Collection 123]))
      (is (= 4 (count deps)))))) ; 3 smartLinks + collection

(deftest document-serdes-smartlink-non-prose-mirror-test
  (testing "non-prose-mirror content type documents don't extract smartLinks"
    (let [document {:collection_id 123
                    :creator_id 456
                    :document {:type "doc"
                               :content [{:type "smartLink"
                                          :attrs {:entityId [{:model "Card" :id 456}]
                                                  :model "card"}}]}
                    :content_type "application/json" ; Not prose-mirror
                    :serdes/meta [{:model "Document"}]}
          deps (first (serialization/import-dependencies :model/Document [document]))]
      (is (= #{[:model/Collection 123]} deps)))))

(defn- export-dependencies [document-id]
  (first (serialization/export-dependencies :model/Document [(t2/select-one :model/Document :id document-id)])))

(deftest document-serdes-export-dependencies-embedded-cards-test
  (testing "Document export dependencies includes embedded cards"
    (mt/with-temp [:model/Document {document-id :id} {:document {:type "doc"
                                                                 :content [{:type "cardEmbed"
                                                                            :attrs {:id 456}}
                                                                           {:type "cardEmbed"
                                                                            :attrs {:id 789}}]}
                                                      :content_type "application/json+vnd.prose-mirror"}]
      (let [deps (export-dependencies document-id)]
        (is (= #{[:model/Card 456]
                 [:model/Card 789]}
               deps))))))

(deftest document-serdes-export-dependencies-smart-links-test
  (testing "Document export dependencies includes smart links"
    (mt/with-temp [:model/Document {document-id :id} {:document {:type "doc"
                                                                 :content [{:type "smartLink"
                                                                            :attrs {:entityId 456
                                                                                    :model "card"}}
                                                                           {:type "smartLink"
                                                                            :attrs {:entityId 789
                                                                                    :model "dashboard"}}]}
                                                      :content_type "application/json+vnd.prose-mirror"}]
      (let [deps (export-dependencies document-id)]
        (is (= #{[:model/Card 456]
                 [:model/Dashboard 789]}
               deps))))))

(deftest document-serdes-export-dependencies-mixed-content-test
  (testing "Document export dependencies includes both embedded cards and smart links"
    (mt/with-temp [:model/Document {document-id :id} {:document {:type "doc"
                                                                 :content [{:type "cardEmbed"
                                                                            :attrs {:id 111}}
                                                                           {:type "smartLink"
                                                                            :attrs {:entityId 222
                                                                                    :model "card"}}
                                                                           {:type "smartLink"
                                                                            :attrs {:entityId 333
                                                                                    :model "table"}}]}
                                                      :content_type "application/json+vnd.prose-mirror"}]
      (let [deps (export-dependencies document-id)]
        (is (= #{[:model/Card 111]
                 [:model/Card 222]
                 [:model/Table 333]}
               deps))))))

(deftest document-serdes-export-dependencies-empty-document-test
  (testing "Document export dependencies handles document with no embedded content"
    (mt/with-temp [:model/Document {document-id :id} {:document {:type "doc"
                                                                 :content [{:type "paragraph"
                                                                            :content [{:type "text" :text "Plain text only"}]}]}
                                                      :content_type "application/json+vnd.prose-mirror"}]
      (let [deps (export-dependencies document-id)]
        (is (= #{} deps))))))

(deftest document-serdes-export-dependencies-unknown-smart-link-model-test
  (testing "Document export dependencies ignores smart links with unknown model types"
    (mt/with-temp [:model/Document {document-id :id} {:document {:type "doc"
                                                                 :content [{:type "smartLink"
                                                                            :attrs {:entityId 456
                                                                                    :model "card"}}
                                                                           {:type "smartLink"
                                                                            :attrs {:entityId 789
                                                                                    :model "unknown-model"}}]}
                                                      :content_type "application/json+vnd.prose-mirror"}]
      (let [deps (export-dependencies document-id)]
        (is (= #{[:model/Card 456]}
               deps))
        (is (not (contains? deps [:model/Unknown 789])))))))

(deftest document-serdes-export-dependencies-duplicate-references-test
  (testing "Document export dependencies handles duplicate references correctly"
    (mt/with-temp [:model/Document {document-id :id} {:document {:type "doc"
                                                                 :content [{:type "cardEmbed"
                                                                            :attrs {:id 456}}
                                                                           {:type "smartLink"
                                                                            :attrs {:entityId 456
                                                                                    :model "card"}}]}
                                                      :content_type "application/json+vnd.prose-mirror"}]
      (let [deps (export-dependencies document-id)]
        (is (= #{[:model/Card 456]}
               deps))
        (is (= 1 (count deps)))))))

(deftest document-serdes-export-dependencies-non-prose-mirror-test
  (testing "Document export dependencies handles non-prose-mirror documents"
    (mt/with-temp [:model/Document {document-id :id} {:document {:some "other format"}
                                                      :content_type "application/json"}] ; Not prose-mirror
      (is (empty? (export-dependencies document-id))))))

(deftest document-serdes-export-dependencies-all-model-types-test
  (testing "Document export dependencies correctly maps all supported smart link model types"
    (mt/with-temp [:model/Document {document-id :id} {:document {:type "doc"
                                                                 :content [{:type "smartLink"
                                                                            :attrs {:entityId 111
                                                                                    :model "card"}}
                                                                           {:type "smartLink"
                                                                            :attrs {:entityId 222
                                                                                    :model "dashboard"}}
                                                                           {:type "smartLink"
                                                                            :attrs {:entityId 333
                                                                                    :model "table"}}]}
                                                      :content_type "application/json+vnd.prose-mirror"}]
      (let [deps (export-dependencies document-id)]
        (is (= #{[:model/Card 111]
                 [:model/Dashboard 222]
                 [:model/Table 333]}
               deps))
        (is (contains? deps [:model/Card 111]))
        (is (contains? deps [:model/Dashboard 222]))
        (is (contains? deps [:model/Table 333]))))))

(deftest update-publishes-lifecycle-event-test
  (testing "updating a Document through the model publishes its update event with the previous row"
    (mt/with-temp [:model/Document {doc-id :id} {:name "Test Document"}]
      (let [events-published (atom [])]
        (with-redefs [events/publish-event! (fn [topic event]
                                              (swap! events-published conj [topic event]))]
          (document/update-documents! [{:id doc-id :name "Updated Name"}]))
        (is (=? [[:event/document-update {:changes [{:object          {:id doc-id :name "Updated Name"}
                                                     :previous-object {:id doc-id :name "Test Document"}}]}]]
                (filterv (comp #{:event/document-update} first) @events-published)))))))

(deftest never-viewed-document-reports-null-activity-anchor
  (testing "a never-viewed document's activity anchor is NULL, not its last_viewed_at storage default
            (NOT NULL default current_timestamp) — the never-used arm (view_count = 0) stays
            distinguishable downstream"
    (mt/with-temp [:model/Document {viewed-id :id} (stale-test/stale-document {:name       "viewed long ago"
                                                                               :view_count 5})
                   :model/Document {never-id :id} {:name       "never viewed"
                                                   :created_at (stale-test/datetime-months-ago 7)}]
      (let [rows   (t2/query ((staleness/candidates-fn :model/Document)
                              {:collection-ids #{nil}
                               :cutoff-date    (stale-test/date-months-ago 6)}))
            anchor (fn [id] (:last_used_at (first (filter #(= id (:id %)) rows))))]
        (testing "a viewed-but-stale document keeps its real anchor"
          (is (some? (anchor viewed-id))))
        (testing "a never-viewed document (flagged via the never-used arm) reports NULL"
          (is (nil? (anchor never-id))))))))

(defn- export-document-ast
  "Run a document row through the serdes `:document` export transform and return the exported AST."
  [document]
  (first ((get-in (serialization/spec :model/Document) [:transform :document :export])
          serialization/app-db-store [document] [(:document document)] {})))

(deftest document-serdes-static-card-embed-test
  (testing "A static (snapshot-backed) cardEmbed"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Card       {card-id :id} {:collection_id coll-id}]
      (let [node (-> {:content_type "application/json+vnd.prose-mirror"
                      :document     {:type    "doc"
                                     :content [{:type  "cardEmbed"
                                                :attrs {:id               card-id
                                                        :stored_result_id 987654321}}]}}
                     export-document-ast
                     :content
                     first)]
        (testing "still rewrites its Card :id to a serdes path — the ephemeral Card is a real serdes entity"
          (is (vector? (get-in node [:attrs :id])))
          (is (= "Card" (:model (first (get-in node [:attrs :id]))))))
        (testing "drops :stored_result_id — a raw local id for a row that is not a serdes entity, which would resolve to an unrelated snapshot on import"
          (is (not (contains? (:attrs node) :stored_result_id))))))))

(deftest document-serdes-live-card-embed-keeps-attrs-test
  (testing "A live cardEmbed exports its :id as a serdes path and is otherwise untouched"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Card       {card-id :id} {:collection_id coll-id}]
      (let [node (-> {:content_type "application/json+vnd.prose-mirror"
                      :document     {:type    "doc"
                                     :content [{:type  "cardEmbed"
                                                :attrs {:id card-id :_id "abc"}}]}}
                     export-document-ast
                     :content
                     first)]
        (is (= "Card" (:model (first (get-in node [:attrs :id])))))
        (is (= "abc" (get-in node [:attrs :_id])))))))

(defn- import-document-ast
  "Run an exported AST back through the serdes `:document` import transform."
  [document]
  (first ((get-in (serialization/spec :model/Document) [:transform :document :import])
          serialization/app-db-store [document] [(:document document)] {:create-missing? true})))

(deftest document-serdes-card-embed-round-trips-test
  (testing "a cardEmbed's Card id survives export and comes back on import"
    (mt/with-temp [:model/Collection {coll-id :id}  {}
                   :model/Card       {card-id :id} {:collection_id coll-id}]
      (let [exported (export-document-ast
                      {:content_type "application/json+vnd.prose-mirror"
                       :document     {:type    "doc"
                                      :content [{:type  "cardEmbed"
                                                 :attrs {:id card-id}}]}})
            imported (import-document-ast
                      {:content_type "application/json+vnd.prose-mirror"
                       :document     exported})]
        (testing "export rewrites the id to a serdes path"
          (is (vector? (get-in exported [:content 0 :attrs :id]))))
        (testing "import rewrites it back to this instance's Card id — on the serialized form the id
                  is a serdes path, so any guard that expects a raw integer skips the node and leaves
                  the path in place"
          (is (= card-id (get-in imported [:content 0 :attrs :id]))))))))

(deftest document-writes-statement-count-test
  (testing "Creating, moving, archiving and deleting Documents takes the same number of statements for any number of them"
    (mt/with-temp [:model/Collection {from-id :id} {}
                   :model/Collection {to-id :id}   {}]
      (mt/with-model-cleanup [:model/Document]
        (let [create     (fn [n] (document/create-documents! (for [i (range n)] {:name (str "Document " i) :creator_id (mt/user->id :rasta) :content_type "application/json+vnd.prose-mirror" :document {:type "doc" :content []} :collection_id from-id})))
              statements (fn [n f]
                           (let [documents (create n)]
                             (t2/with-call-count [call-count]
                               (f documents)
                               (call-count))))
              updater    (fn [changes] (fn [documents] (document/update-documents! (mapv (fn [row-id] (assoc changes :id row-id)) (mapv :id documents)))))]
          (testing "creating"
            (create 1)
            (is (= (t2/with-call-count [call-count] (create 2) (call-count))
                   (t2/with-call-count [call-count] (create 6) (call-count)))))
          (testing "moving"
            (statements 1 (updater {:collection_id to-id}))
            (is (= (statements 2 (updater {:collection_id to-id})) (statements 6 (updater {:collection_id to-id})))))
          (testing "archiving"
            (statements 1 (updater {:archived true}))
            (is (= (statements 2 (updater {:archived true})) (statements 6 (updater {:archived true})))))
          (testing "deleting"
            (statements 1 #(document/delete-documents! (mapv :id %)))
            (is (= (statements 2 #(document/delete-documents! (mapv :id %)))
                   (statements 6 #(document/delete-documents! (mapv :id %)))))))))))

(deftest create-documents-with-different-columns-test
  (mt/with-model-cleanup [:model/Document]
    (let [creator-id (mt/user->id :rasta)
          documents  (document/create-documents! [{:name "Plain" :creator_id creator-id :content_type "application/json+vnd.prose-mirror"}
                                                  {:name "Archived" :creator_id creator-id :archived true
                                                   :content_type "application/json+vnd.prose-mirror"}])]
      (is (= ["Plain" "Archived"] (map :name documents)))
      (is (= [false true] (map #(t2/select-one-fn :archived :model/Document :id (:id %)) documents))))))

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (mt/with-temp [:model/Collection {live :id}  {}
                 :model/Collection {other :id} {}]
    (mt/with-model-cleanup [:model/Document :model/Card]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [rows    (fn [n] (mapv (fn [_] {:name (mt/random-name) :collection_id live :creator_id (mt/user->id :rasta)
                                             :document (documents.tu/text->prose-mirror-ast "text") :content_type "application/json+vnd.prose-mirror"})
                                    (range n)))
              fresh!  (fn [n]
                        (let [ids (mapv :id (document/create-documents! (rows n)))]
                          (doseq [id ids]
                            (t2/insert! :model/Card (assoc (mt/with-temp-defaults :model/Card) :document_id id :collection_id live)))
                          ids))
              update! (fn [prepare changes n]
                        (let [ids (fresh! n)]
                          (prepare (take-nth 2 ids))
                          (events.tu/statement-count! #(document/update-documents! (mapv (fn [id] (assoc changes :id id)) ids)))))
              counted (fn [f]
                        (f 1)
                        (is (= (f 2) (f 6))))]
          (testing "creating documents"
            (counted (fn [n] (let [rows (rows n)] (events.tu/statement-count! #(document/create-documents! rows))))))
          (testing "updating columns, some already holding the new value"
            (counted (partial update!
                                      (fn [ids] (document/update-documents! (mapv (fn [id] {:id id :name "Same"}) ids)))
                                      {:name "Same"})))
          (testing "archiving documents and their cards, some already archived"
            (counted (partial update!
                                        (fn [ids] (document/update-documents! (mapv (fn [id] {:id id :archived true}) ids)))
                                        {:archived true})))
          (testing "restoring documents and their cards, some already live"
            (counted (partial update!
                                        (fn [ids] (document/update-documents! (mapv (fn [id] {:id id :archived true}) ids)))
                                        {:archived false})))
          (testing "moving documents and their cards, some already in the Collection"
            (counted (partial update!
                                        (fn [ids] (document/update-documents! (mapv (fn [id] {:id id :collection_id other}) ids)))
                                        {:collection_id other})))
          (testing "deleting documents"
            (counted (fn [n] (let [ids (fresh! n)] (events.tu/statement-count! #(document/delete-documents! ids))))))
          (testing "counting views"
            (counted (fn [n] (let [ids (fresh! n)] (events.tu/statement-count! #(document/increment-view-counts! {3 ids})))))))))))

(deftest document-with-cards-statement-counts-do-not-grow-with-cards-test
  (mt/with-model-cleanup [:model/Document :model/Card]
    (mt/with-current-user (mt/user->id :crowberto)
      (let [mp      (mt/metadata-provider)
            query   (lib/query mp (lib.metadata/table mp (mt/id :venues)))
            cards   (fn [n]
                      (into {} (map (fn [i] [(- (inc i)) {:name (mt/random-name) :dataset_query query :display "table"
                                                          :visualization_settings {}}]))
                            (range n)))
            body    (fn [n] {:name     (mt/random-name)
                             :document (documents.tu/cards->prose-mirror-ast (map (comp - inc) (range n)))
                             :cards    (cards n)})
            counted (fn [f]
                      (f 1)
                      (is (= (f 2) (f 6))))]
        (testing "creating a document with the new cards it embeds"
          (counted (fn [n] (let [body (body n)] (events.tu/statement-count! #(document/create-document-with-cards! body))))))
        (testing "updating a document with the new cards it embeds"
          (counted (fn [n]
                     (let [existing (t2/select-one :model/Document :id (document/create-document-with-cards! {:name (mt/random-name) :document (documents.tu/text->prose-mirror-ast "text")}))
                           body     (select-keys (body n) [:document :cards])]
                       (events.tu/statement-count! #(document/update-document-with-cards! existing body))))))
        (testing "creating a document that embeds cards copied from another card"
          (mt/with-temp [:model/Card {source-id :id} {}]
            (counted (fn [n]
                       (let [body (update (body n) :cards update-vals #(assoc % :source_card_id source-id))]
                         (events.tu/statement-count! #(document/create-document-with-cards! body)))))))))))

(defn- refusal
  "The status and message of the exception `f` throws, nil when it throws none."
  [f]
  (try
    (f)
    nil
    (catch clojure.lang.ExceptionInfo e
      {:status (:status-code (ex-data e)) :message (ex-message e)})))

(def ^:private generic-403 "You don't have permissions to do that.")
(def ^:private query-403 "You cannot save this Question because you do not have permissions to run its query.")
(def ^:private field-403 "You must have data permissions to add a parameter referencing this Field.")

(defn- documents-and-cards
  "The numbers of Documents and Cards."
  []
  [(t2/count :model/Document) (t2/count :model/Card)])

(deftest document-cards-checks-before-the-write-test
  (mt/with-model-cleanup [:model/Document :model/Card]
    (mt/with-temp-copy-of-db
      (mt/with-no-data-perms-for-all-users!
        (data-perms/set-table-permission! (perms-group/all-users) (mt/id :venues) :perms/view-data :unrestricted)
        (data-perms/set-table-permission! (perms-group/all-users) (mt/id :venues) :perms/create-queries :query-builder)
        (mt/with-temp [:model/Collection {write-id :id}  {}
                       :model/Collection {read-id :id}   {}
                       :model/Card       {secret-id :id} {:collection_id (u/the-id (collection/user->personal-collection (mt/user->id :crowberto)))}]
          (perms/grant-collection-readwrite-permissions! (perms/all-users-group) write-id)
          (perms/grant-collection-read-permissions! (perms/all-users-group) read-id)
          (let [mp          (mt/metadata-provider)
                venues      (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                orders      (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                good        (fn [] {:name (mt/random-name) :dataset_query venues :display "table" :visualization_settings {}})
                create!     (fn [collection-id cards]
                              (mt/with-test-user :rasta
                                (refusal #(let [body {:name          (mt/random-name)
                                                      :collection_id collection-id
                                                      :document      (documents.tu/cards->prose-mirror-ast (keys cards))
                                                      :cards         cards}]
                                            (document/check-creating-document-cards! body)
                                            (document/create-document-with-cards! body)))))
                three       (fn [second-card third-card] {-1 (good) -2 second-card -3 third-card})
                orders-card (fn [] (assoc (good) :dataset_query orders))
                field-card  (fn [] (assoc (good) :parameters [{:id "p" :type :category :name "p" :slug "p"
                                                               :target [:dimension [:field (mt/id :orders :total) nil]]}]))
                refused     (fn [expected cards & [collection-id]]
                              (let [before (documents-and-cards)]
                                (is (= expected (create! (or collection-id write-id) cards)))
                                (is (= before (documents-and-cards)) "nothing is written")))]
            (testing "cards the user may create are not refused"
              (let [before (documents-and-cards)]
                (is (nil? (create! write-id (three (good) (good)))))
                (is (= [(inc (first before)) (+ 3 (second before))] (documents-and-cards)))))
            (testing "the statements of the checks do not grow with the cards"
              (let [counted (fn [n]
                              (let [cards (into {} (map (fn [i] [(- (inc i)) (good)])) (range n))
                                    body  {:collection_id write-id :document (documents.tu/cards->prose-mirror-ast (keys cards)) :cards cards}]
                                (mt/with-test-user :rasta
                                  (events.tu/statement-count! #(document/check-creating-document-cards! body)))))]
                (counted 1)
                (is (= (counted 2) (counted 6)))))
            (testing "cards in a collection the user cannot write"
              (refused {:status 403 :message generic-403} (three (good) (good)) read-id))
            (testing "a card whose query reads a table the user cannot query"
              (refused {:status 403 :message query-403} (three (orders-card) (good))))
            (testing "a card with a native query the user has no native permission for"
              (refused {:status 403 :message query-403}
                       (three (assoc (good) :dataset_query (lib/native-query mp "SELECT 1")) (good))))
            (testing "a card whose parameter draws values from a card the user cannot read"
              (refused {:status 403 :message generic-403}
                       (three (good)
                              (assoc (good) :parameters [{:id "p" :type :category :name "p" :slug "p"
                                                          :values_source_type   :card
                                                          :values_source_config {:card_id     secret-id
                                                                                 :value_field (mt/$ids $venues.name)}}]))))
            (testing "a card whose parameter targets a field the user cannot see"
              (refused {:status 403 :message field-403} (three (field-card) (good))))
            (testing "a card copied from a card the user cannot read"
              (refused {:status 403 :message generic-403} (three (assoc (good) :source_card_id secret-id) (good))))
            (testing "the first card in order that the user may not create gives the error"
              (refused {:status 403 :message query-403} (three (orders-card) (field-card)))
              (refused {:status 403 :message field-403} (three (field-card) (orders-card)))
              (refused {:status 403 :message generic-403} (three (assoc (good) :source_card_id secret-id) (orders-card)))
              (refused {:status 403 :message query-403} (three (orders-card) (assoc (good) :source_card_id secret-id))))))))))

(deftest update-documents-for-import-test
  (testing "an import writes different columns to each Document"
    (mt/with-temp [:model/Document {a :id} {}
                   :model/Document {b :id} {}]
      (let [rows [{:id a :name "Imported A"} {:id b :name "Imported B" :collection_position 3}]]
        (document/update-documents! rows {:writer :import})
        (is (= ["Imported A" "Imported B"] (mapv #(t2/select-one-fn :name :model/Document :id %) [a b])))
        (is (= 3 (t2/select-one-fn :collection_position :model/Document :id b)))))))

(def ^:private ^:dynamic *update-events* nil)

(events/derive! ::document-update-capture :metabase/event)
(events/derive! :event/document-update ::document-update-capture)

(methodical/defmethod events/publish-event! ::document-update-capture
  [_topic event]
  (when *update-events*
    (swap! *update-events* conj event)))

(deftest archived-directly-follows-parents-through-plain-update-test
  (testing "a plain t2/update! of archived derives archived_directly in the statement from the Collection and the restore"
    (mt/with-temp [:model/Collection {live :id}     {}
                   :model/Collection {archived :id} {:archived true}
                   :model/Document   {a :id}        {:collection_id live}
                   :model/Document   {b :id}        {:collection_id archived}
                   :model/Document   {c :id}        {}]
      (t2/update! :model/Document :id [:in [a b c]] {:archived true})
      (is (= [true false true] (mapv #(t2/select-one-fn :archived_directly :model/Document :id %) [a b c])))
      (t2/update! :model/Document :id [:in [a b c]] {:archived false})
      (is (= [false false false] (mapv #(t2/select-one-fn :archived_directly :model/Document :id %) [a b c])))))
  (testing "the update event carries the stored value"
    (mt/with-temp [:model/Document {a :id} {}]
      (binding [*update-events* (atom [])]
        (document/update-documents! [{:id a :archived true}])
        (is (= [true] (mapv #(-> % :object :archived_directly) (mapcat :changes @*update-events*))))))))

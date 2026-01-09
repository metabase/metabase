(ns metabase.documents.revisions.integration-test
  "Integration tests for Document revision history including API endpoints, events, and permissions."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.documents.revisions.impl]
   [metabase.events.core :as events]
   [metabase.revisions.models.revision :as revision]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(def ^:private rasta-revision-info
  (delay {:id (mt/user->id :rasta)
          :first_name "Rasta"
          :last_name "Toucan"
          :common_name "Rasta Toucan"}))

(defn- create-document-revision!
  "Helper function to create a Document revision manually for testing."
  [document-id is-creation? user]
  (revision/push-revision!
   {:object (t2/select-one :model/Document :id document-id)
    :entity :model/Document
    :id document-id
    :user-id (mt/user->id user)
    :is-creation? is-creation?}))

(defn- get-document-revisions
  "Helper function to get revisions for a Document via API."
  [document-id]
  (mt/user-http-request :rasta :get 200 (format "revision/document/%d" document-id)))

(deftest document-create-event-triggers-revision-test
  (testing "Document creation triggers revision creation via events"
    (mt/with-temp [:model/Document {doc-id :id, :as document} {:name "Test Document"
                                                               :document {:type "doc" :content [{:type "paragraph" :content [{:type "text" :text "Hello World"}]}]}
                                                               :creator_id (mt/user->id :crowberto)}]
      (events/publish-event! :event/document-create {:object document :user-id (mt/user->id :crowberto)})
      (let [revision (t2/select-one :model/Revision :model "Document" :model_id doc-id)]
        (is revision "Revision should be created")
        (is (= "Document" (:model revision)))
        (is (= doc-id (:model_id revision)))
        (is (= (mt/user->id :crowberto) (:user_id revision)))
        (is (:is_creation revision))
        (is (not (:is_reversion revision)))
        (testing "serialized object excludes metadata fields"
          (let [object (:object revision)]
            (is (= "Test Document" (:name object)))
            (is (= {:type "doc" :content [{:type "paragraph" :content [{:type "text" :text "Hello World"}]}]} (:document object)))
            (is (not (contains? object :id)))
            (is (not (contains? object :creator_id)))
            (is (not (contains? object :created_at)))
            (is (not (contains? object :updated_at)))
            (is (not (contains? object :collection_id)))))))))

(deftest document-update-event-triggers-revision-test
  (testing "Document update triggers revision creation via events"
    (mt/with-temp [:model/Document {doc-id :id, :as document} {:name "Original Document"
                                                               :document {:type "doc" :content [{:type "paragraph" :content [{:type "text" :text "Original content"}]}]}
                                                               :creator_id (mt/user->id :crowberto)}]
      (let [updated-document (assoc document
                                    :name "Updated Document"
                                    :document {:type "doc" :content [{:type "paragraph" :content [{:type "text" :text "Updated content"}]}]})]
        (events/publish-event! :event/document-update {:object updated-document :user-id (mt/user->id :rasta)})
        (let [revision (t2/select-one :model/Revision :model "Document" :model_id doc-id :user_id (mt/user->id :rasta))]
          (is revision "Revision should be created for update")
          (is (= "Document" (:model revision)))
          (is (= doc-id (:model_id revision)))
          (is (= (mt/user->id :rasta) (:user_id revision)))
          (is (not (:is_creation revision)))
          (is (not (:is_reversion revision)))
          (testing "serialized object contains updated data"
            (let [object (:object revision)]
              (is (= "Updated Document" (:name object)))
              (is (= {:type "doc" :content [{:type "paragraph" :content [{:type "text" :text "Updated content"}]}]} (:document object))))))))))

(deftest document-revision-api-endpoints-test
  (testing "Document revision API endpoints work correctly"
    (mt/with-temp [:model/Document {doc-id :id} {:name "Test Document"
                                                 :document {:type "doc" :content [{:type "paragraph" :content [{:type "text" :text "Initial content"}]}]}
                                                 :creator_id (mt/user->id :rasta)}]
      (create-document-revision! doc-id true :rasta)

      (testing "GET /api/revision/document/:id returns Document revisions"
        (let [revisions (get-document-revisions doc-id)]
          (is (= 1 (count revisions)))
          (let [revision (first revisions)]
            (is (:is_creation revision))
            (is (not (:is_reversion revision)))
            (is (= "created this." (:description revision)))
            (is (=? @rasta-revision-info (:user revision)))
            (is (= config/mb-version-string (:metabase_version revision))))))

      (testing "Multiple revisions are returned in correct order"
        (t2/update! :model/Document doc-id {:name "Updated Document"})
        (create-document-revision! doc-id false :rasta)

        (let [revisions (get-document-revisions doc-id)]
          (is (= 2 (count revisions)))
          (let [[latest-revision creation-revision] revisions]
            (is (not (:is_creation latest-revision)))
            (is (:is_creation creation-revision))
            (is (= "created this." (:description creation-revision)))
            (is (not= "created this." (:description latest-revision)))))))))

(deftest document-reversion-api-test
  (testing "Document reversion via API works correctly"
    (mt/with-temp [:model/Document {doc-id :id} {:name "Original Document"
                                                 :document {:type "doc" :content [{:type "paragraph" :content [{:type "text" :text "Original content"}]}]}
                                                 :creator_id (mt/user->id :rasta)}]
      (create-document-revision! doc-id true :rasta)

      (testing "Document can be updated and reverted"
        (t2/update! :model/Document doc-id {:name "Updated Document"
                                            :document {:type "doc" :content [{:type "paragraph" :content [{:type "text" :text "Updated content"}]}]}})
        (create-document-revision! doc-id false :rasta)

        (let [revisions (revision/revisions :model/Document doc-id)
              [_ {original-revision-id :id}] revisions]

          (testing "Revert via API endpoint"
            (let [revert-response (mt/user-http-request :rasta :post "revision/revert"
                                                        {:entity :document
                                                         :id doc-id
                                                         :revision_id original-revision-id})]
              (is (:is_reversion revert-response))
              (is (= "reverted to an earlier version." (:description revert-response)))
              (is (=? @rasta-revision-info (:user revert-response)))))

          (testing "Document state is restored"
            (let [reverted-document (t2/select-one :model/Document :id doc-id)]
              (is (= "Original Document" (:name reverted-document)))
              (is (= {:type "doc" :content [{:type "paragraph" :content [{:type "text" :text "Original content"}]}]}
                     (:document reverted-document)))))

          (testing "Reversion creates new revision entry"
            (let [final-revisions (get-document-revisions doc-id)]
              (is (= 3 (count final-revisions)))
              (let [latest-revision (first final-revisions)]
                (is (:is_reversion latest-revision))
                (is (= "reverted to an earlier version." (:description latest-revision)))))))))))

(deftest document-revision-permission-checks-test
  (testing "Document revision API respects permissions"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection collection {:name "Private collection"}
                     :model/Document document {:collection_id (u/the-id collection)
                                               :name "Private document"
                                               :document {:type "doc" :content []}
                                               :creator_id (mt/user->id :crowberto)}]
        (create-document-revision! (:id document) true :crowberto)
        (t2/update! :model/Document (:id document) {:name "Updated Private Document"})
        (create-document-revision! (:id document) false :crowberto)

        (let [document-id (u/the-id document)
              [_ {prev-rev-id :id}] (revision/revisions :model/Document document-id)]

          (testing "User without permissions cannot access revisions"
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :get 403 (format "revision/document/%d" document-id)))))

          (testing "User without permissions cannot revert"
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :post 403 "revision/revert"
                                         {:entity :document
                                          :id document-id
                                          :revision_id prev-rev-id})))))))))

(deftest document-revision-cross-boundary-integration-test
  (testing "Document revisions integrate properly with OSS revision system"
    (mt/with-temp [:model/Document {doc-id :id} {:name "Cross-boundary Document"
                                                 :document {:type "doc" :content [{:type "paragraph" :content [{:type "text" :text "Enterprise content"}]}]}
                                                 :creator_id (mt/user->id :rasta)}]

      (testing "Document revisions work with OSS revision/revisions function"
        (create-document-revision! doc-id true :rasta)
        (let [revisions (revision/revisions :model/Document doc-id)]
          (is (seq revisions))
          (is (= 1 (count revisions)))
          (let [revision (first revisions)]
            (is (= doc-id (:model_id revision)))
            (is (= "Document" (:model revision))))))

      (testing "Document revisions work with OSS revision API routes"
        (let [revisions-response (mt/user-http-request :rasta :get (format "revision/document/%d" doc-id))]
          (is (seq revisions-response))
          (is (every? #(contains? % :is_creation) revisions-response))
          (is (every? #(contains? % :description) revisions-response))))

      (testing "Document reversion integrates with OSS revert endpoint"
        (t2/update! :model/Document doc-id {:name "Modified Document"})
        (create-document-revision! doc-id false :rasta)

        (let [[_ {original-rev-id :id}] (revision/revisions :model/Document doc-id)
              revert-response (mt/user-http-request :rasta :post "revision/revert"
                                                    {:entity :document
                                                     :id doc-id
                                                     :revision_id original-rev-id})]
          (is (:is_reversion revert-response))
          (let [reverted-doc (t2/select-one :model/Document :id doc-id)]
            (is (= "Cross-boundary Document" (:name reverted-doc)))))))))

(deftest document-revision-event-handler-integration-test
  (testing "Document revision events are published and handled correctly"
    (let [original-event events/publish-event!
          events-received (atom [])]
      (with-redefs [events/publish-event! (fn [topic event]
                                            (swap! events-received conj [topic event])
                                            (original-event topic event))]
        (mt/with-temp [:model/Document {doc-id :id, :as document} {:name "Event Test Document"
                                                                   :document {:type "doc" :content []}
                                                                   :creator_id (mt/user->id :rasta)}]

          (testing "Create event triggers revision creation"
            (events/publish-event! :event/document-create {:object document :user-id (mt/user->id :rasta)})
            (let [revision (t2/select-one :model/Revision :model "Document" :model_id doc-id)]
              (is revision)
              (is (:is_creation revision))))

          (testing "Update event triggers revision creation"
            (let [updated-document (assoc document :name "Updated Event Document")]
              (events/publish-event! :event/document-update {:object updated-document :user-id (mt/user->id :rasta)})
              (let [revisions (t2/select :model/Revision :model "Document" :model_id doc-id {:order-by [[:id :desc]]})]
                (is (= 2 (count revisions)))
                (let [latest-revision (first revisions)]
                  (is (not (:is_creation latest-revision)))
                  (is (= "Updated Event Document" (get-in latest-revision [:object :name])))))))

          (testing "Events were published correctly"
            (is (>= (count @events-received) 2))
            (is (some #(= :event/document-create (first %)) @events-received))
            (is (some #(= :event/document-update (first %)) @events-received))))))))

(deftest document-revision-diff-and-descriptions-test
  (testing "Document revision diffs and descriptions work correctly"
    (mt/with-temp [:model/Document {doc-id :id} {:name "Original Title"
                                                 :document {:type "doc" :content [{:type "paragraph" :content [{:type "text" :text "Original content"}]}]}
                                                 :creator_id (mt/user->id :rasta)}]
      (create-document-revision! doc-id true :rasta)

      (testing "Name change produces correct diff and description"
        (t2/update! :model/Document doc-id {:name "Updated Title"})
        (create-document-revision! doc-id false :rasta)

        (let [revisions (get-document-revisions doc-id)
              update-revision (first revisions)]
          (is (= "Original Title" (get-in update-revision [:diff :before :name])))
          (is (= "Updated Title" (get-in update-revision [:diff :after :name])))
          (is (str/includes? (:description update-revision) "renamed"))))

      (testing "Content change produces diff"
        (t2/update! :model/Document doc-id {:document {:type "doc" :content [{:type "paragraph" :content [{:type "text" :text "New content"}]}]}})
        (create-document-revision! doc-id false :rasta)

        (let [revisions (get-document-revisions doc-id)
              content-revision (first revisions)]
          (is (= {:content [{:content [{:text "Original content"}]}]}
                 (get-in content-revision [:diff :before :document])))
          (is (= {:content [{:content [{:text "New content"}]}]}
                 (get-in content-revision [:diff :after :document]))))))))

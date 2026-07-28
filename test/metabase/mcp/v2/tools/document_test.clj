(ns metabase.mcp.v2.tools.document-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.mcp.v2.tools.content :as v2.content]
   [metabase.mcp.v2.tools.document :as v2.document]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- call
  "Invoke the document_write handler directly (unrestricted scopes) and return the decoded
   payload map. Teaching errors surface as thrown ex-infos, matching how the registry treats
   handler exceptions."
  [args]
  (-> (v2.document/document-write-tool args {:token-scopes nil})
      (get-in [:content 0 :text])
      json/decode+kw))

(defn- with-tool-documents
  "Call `f` with a `created!` fn that records a payload's document id for cleanup; deletes the
   recorded documents (with their comments and owned cards) afterward. Documents made through
   the tool are real rows, not `with-temp` fixtures."
  [f]
  (let [ids      (atom #{})
        created! (fn [payload]
                   (when-let [id (:id payload)]
                     (swap! ids conj id))
                   payload)]
    (try
      (f created!)
      (finally
        (doseq [id @ids]
          (t2/delete! :model/Comment :target_type "document" :target_id id)
          (t2/delete! :model/Card :document_id id)
          (t2/delete! :model/Document :id id))))))

(deftest create-clones-card-test
  (mt/with-temp [:model/Card {card-id :id} {:name "Orders card"
                                            :dataset_query (mt/mbql-query orders)}]
    (mt/with-current-user (mt/user->id :crowberto)
      (with-tool-documents
        (fn [created!]
          (let [payload (created! (call {:method           "create"
                                         :name             "Clone test"
                                         :content_markdown (str "Intro paragraph.\n\n{% card id=" card-id " %}")}))
                cloned-id (some-> (re-find #"\{% card id=(\d+)" (:content_markdown payload)) second parse-long)]
            (testing "the embedded foreign card is cloned and the response shows the clone's id"
              (is (pos-int? cloned-id))
              (is (not= card-id cloned-id))
              (is (= (:id payload) (t2/select-one-fn :document_id :model/Card :id cloned-id))))
            (testing "the original card is untouched"
              (is (nil? (t2/select-one-fn :document_id :model/Card :id card-id))))
            (testing "get_content returns the same Markdown body the tool returned"
              (is (= (:content_markdown payload)
                     (:markdown (#'v2.content/fetch-document (:id payload))))))))))))

(deftest dangling-card-embed-test
  (mt/with-current-user (mt/user->id :crowberto)
    (testing "a card token referencing a nonexistent card is a collapsed not-found, not a silent dangling embed"
      (is (thrown-with-msg? Exception #"Card 992342344 not found"
                            (call {:method           "create"
                                   :name             "Dangling"
                                   :content_markdown "{% card id=992342344 %}"}))))))

(deftest unreadable-card-embed-collapses-test
  (mt/with-temp [:model/Collection {coll-id :id} {}
                 :model/Card {card-id :id} {:name          "Hidden"
                                            :collection_id coll-id
                                            :dataset_query (mt/mbql-query orders)}]
    (perms/revoke-collection-permissions! (perms-group/all-users) coll-id)
    (mt/with-current-user (mt/user->id :rasta)
      (testing "an unreadable card collapses into the same not-found error as a missing one"
        (is (thrown-with-msg? Exception #"not found — it may not exist, or you may not have access"
                              (call {:method           "create"
                                     :name             "No peeking"
                                     :content_markdown (str "{% card id=" card-id " %}")})))))))

(deftest edits-preserve-untouched-ids-and-report-orphans-test
  (mt/with-current-user (mt/user->id :crowberto)
    (with-tool-documents
      (fn [created!]
        (let [payload (created! (call {:method           "create"
                                       :name             "Edit test"
                                       :content_markdown "## Heading\n\nEdit me please.\n\nLeave me alone."}))
              doc-id  (:id payload)
              blocks  (fn [] (:content (t2/select-one-fn :document :model/Document :id doc-id)))
              id-of   (fn [bs pred] (some #(when (pred %) (get-in % [:attrs :_id])) bs))
              before  (blocks)
              heading-id (id-of before #(= "heading" (:type %)))
              edited-id  (id-of before #(str/includes? (str (get-in % [:content 0 :text])) "Edit me"))]
          (t2/insert! :model/Comment {:target_type     "document"
                                      :target_id       doc-id
                                      :child_target_id edited-id
                                      :content         {:type "doc" :content []}
                                      :creator_id      (mt/user->id :crowberto)})
          (let [updated (call {:method "update"
                               :id     doc-id
                               :edits  [{:old_str "Edit me please." :new_str "Edited!"}]})
                after   (blocks)]
            (testing "untouched blocks keep their node ids"
              (is (= heading-id (id-of after #(= "heading" (:type %)))))
              (is (some #(= "Leave me alone." (get-in % [:content 0 :text])) after)))
            (testing "the edited block gets a fresh id and its comment thread is reported orphaned"
              (is (not= edited-id (id-of after #(str/includes? (str (get-in % [:content 0 :text])) "Edited"))))
              (is (= [{:child_target_id edited-id :comment_count 1}]
                     (:orphaned_comment_threads updated))))))))))

(deftest rename-and-metadata-only-update-test
  (mt/with-current-user (mt/user->id :crowberto)
    (with-tool-documents
      (fn [created!]
        (let [payload  (created! (call {:method           "create"
                                        :name             "Old name"
                                        :content_markdown "Stable body."}))
              doc-id   (:id payload)
              doc-before (t2/select-one-fn :document :model/Document :id doc-id)]
          (testing "edits: [] with name renames without touching the document column"
            (let [renamed (call {:method "update" :id doc-id :edits [] :name "New name"})]
              (is (= "New name" (:name renamed)))
              (is (= "Stable body." (:content_markdown renamed)))
              (is (= doc-before (t2/select-one-fn :document :model/Document :id doc-id)))
              (is (= [] (:orphaned_comment_threads renamed)))))
          (testing "edits: [] with archived trashes and restores"
            (is (true? (:archived (call {:method "update" :id doc-id :edits [] :archived true}))))
            (is (false? (:archived (call {:method "update" :id doc-id :edits [] :archived false}))))
            (is (= doc-before (t2/select-one-fn :document :model/Document :id doc-id)))))))))

(deftest edit-matching-errors-test
  (mt/with-current-user (mt/user->id :crowberto)
    (with-tool-documents
      (fn [created!]
        (let [doc-id (:id (created! (call {:method           "create"
                                           :name             "Match test"
                                           :content_markdown "beta one\n\nbeta two"})))]
          (testing "0 matches is a teaching error"
            (is (thrown-with-msg? Exception #"matches 0 places"
                                  (call {:method "update" :id doc-id
                                         :edits [{:old_str "NOPE" :new_str "x"}]}))))
          (testing ">1 matches without replace_all is a teaching error"
            (is (thrown-with-msg? Exception #"matches 2 places"
                                  (call {:method "update" :id doc-id
                                         :edits [{:old_str "beta" :new_str "x"}]}))))
          (testing "replace_all replaces every occurrence"
            (let [updated (call {:method "update" :id doc-id
                                 :edits [{:old_str "beta" :new_str "gamma" :replace_all true}]})]
              (is (= "gamma one\n\ngamma two" (:content_markdown updated)))))
          (testing "a replacement containing old_str does not loop and replaces each occurrence once"
            (let [updated (call {:method "update" :id doc-id
                                 :edits [{:old_str "gamma" :new_str "gamma gamma" :replace_all true}]})]
              (is (= "gamma gamma one\n\ngamma gamma two" (:content_markdown updated))))))))))

(deftest method-shape-errors-test
  (mt/with-current-user (mt/user->id :crowberto)
    (with-tool-documents
      (fn [created!]
        (let [doc-id (:id (created! (call {:method           "create"
                                           :name             "Shape test"
                                           :content_markdown "Body."})))]
          (testing "cross-method keys on create fail loudly"
            (are [args re] (thrown-with-msg? Exception re (call (merge {:method           "create"
                                                                        :name             "n"
                                                                        :content_markdown "x"}
                                                                       args)))
              {:edits [{:old_str "a" :new_str "b"}]} #"edits only apply"
              {:id doc-id}                           #"id only applies"
              {:archived true}                       #"archived only applies"))
          (testing "update requires exactly one of content_markdown | edits"
            (is (thrown-with-msg? Exception #"not both"
                                  (call {:method "update" :id doc-id
                                         :content_markdown "x" :edits []})))
            (is (thrown-with-msg? Exception #"exactly one of content_markdown"
                                  (call {:method "update" :id doc-id})))))))))

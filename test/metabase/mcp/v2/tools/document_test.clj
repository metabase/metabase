(ns metabase.mcp.v2.tools.document-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.tools.content :as v2.content]
   [metabase.mcp.v2.tools.document :as v2.document]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.util :as u]
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

(deftest edits-preserve-comment-anchors-test
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
            (testing "the rewritten block keeps its id, so its comment thread stays anchored"
              (is (= edited-id (id-of after #(str/includes? (str (get-in % [:content 0 :text])) "Edited"))))
              (is (= [] (:orphaned_comment_threads updated))))))))))

(deftest edits-report-orphans-only-for-deleted-blocks-test
  (mt/with-current-user (mt/user->id :crowberto)
    (with-tool-documents
      (fn [created!]
        (let [payload (created! (call {:method           "create"
                                       :name             "Delete test"
                                       :content_markdown "Keep me.\n\nDelete me.\n\nKeep me too."}))
              doc-id  (:id payload)
              blocks  (:content (t2/select-one-fn :document :model/Document :id doc-id))
              id-of   (fn [pred] (some #(when (pred %) (get-in % [:attrs :_id])) blocks))
              doomed  (id-of #(= "Delete me." (get-in % [:content 0 :text])))]
          (t2/insert! :model/Comment {:target_type     "document"
                                      :target_id       doc-id
                                      :child_target_id doomed
                                      :content         {:type "doc" :content []}
                                      :creator_id      (mt/user->id :crowberto)})
          (let [updated (call {:method "update"
                               :id     doc-id
                               :edits  [{:old_str "\n\nDelete me." :new_str ""}]})]
            (testing "a block the edit removed reports its thread orphaned"
              (is (= [{:child_target_id doomed :comment_count 1}]
                     (:orphaned_comment_threads updated))))
            (is (= "Keep me.\n\nKeep me too." (:content_markdown updated)))))))))

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

(defn- write-error
  "The error text `document_write` returns for `args`, called through the registry rather than the
   handler directly — the tool's own Malli schema is only applied at that seam, and these are
   arguments the schema is meant to reject. `nil` when the call succeeded."
  [args]
  (let [result (registry/call-tool nil "test-session" "document_write" args)]
    (when (:isError result)
      (-> result :content first :text))))

(deftest rejected-argument-values-are-teaching-errors-test
  (testing "an argument the tool accepts but the write path cannot use must come back as an error
           naming the fix. Left to fall through it surfaces as the generic sanitized \"Internal
           error\", which tells an agent nothing about what to send instead — the tool schema was
           looser than the schema the model layer enforces."
    (mt/with-current-user (mt/user->id :crowberto)
      (with-tool-documents
        (fn [created!]
          (let [doc-id (:id (created! (call {:method "create" :name "Arg validation"
                                             :content_markdown "Body."})))
                nonexistent 999999999]
            (testing "collection_position must be a positive int — it is a 1-based pin position"
              (are [args] (re-find #"(?i)greater than zero|positive" (str (write-error args)))
                {:method "create" :name "x" :content_markdown "y" :collection_position 0}
                {:method "create" :name "x" :content_markdown "y" :collection_position -1}
                {:method "update" :id doc-id :edits [] :collection_position 0}
                {:method "update" :id doc-id :edits [] :collection_position -3}))
            (testing "a non-positive collection_id cannot name a collection"
              (are [args] (re-find #"(?i)greater than zero|positive" (str (write-error args)))
                {:method "create" :name "x" :content_markdown "y" :collection_id 0}
                {:method "create" :name "x" :content_markdown "y" :collection_id -1}
                {:method "update" :id doc-id :edits [] :collection_id -1}))
            (testing "a well-formed but nonexistent collection_id is a collapsed not-found, not an
                     internal error — the shape is valid, so only a lookup can catch it"
              (are [args] (re-find #"(?i)not found" (str (write-error args)))
                {:method "create" :name "x" :content_markdown "y" :collection_id nonexistent}
                {:method "update" :id doc-id :edits [] :collection_id nonexistent}))
            (testing "values the write path can actually use are untouched"
              (is (nil? (write-error {:method "update" :id doc-id :edits [] :collection_position 2})))
              (is (nil? (write-error {:method "update" :id doc-id :edits [] :collection_id "root"}))))))))))

(def ^:private cost-model-line
  "A line with several occurrences of a common letter — many matches per KB, which is what makes
   replace_all expensive: it re-serializes the whole document once per occurrence."
  "the quick brown fox jumped over the lazy sleeping dog")

(deftest replace-all-refuses-work-it-cannot-afford-test
  (testing "replace_all costs one full re-serialization per occurrence, so its cost is
           matches x document size. A one- or two-character old_str maximises both at once (matches
           are bounded by document size, so a short needle grows with it), which turns an ~85-byte
           request into minutes of single-threaded CPU on a large document. The existing iteration
           cap does not help: it is 100 + 2 x matches, always above the number of iterations
           actually taken, because it guards non-convergence rather than volume."
    (mt/with-current-user (mt/user->id :crowberto)
      (with-tool-documents
        (fn [created!]
          ;; ~64KB with ~7200 matches of "e". Sized so that carrying the rewrite out is
          ;; unmistakably slow (~14s measured) rather than merely slower.
          (let [big (created! (call {:method "create" :name "Costly"
                                     :content_markdown (str/join "\n\n" (repeat 1200 cost-model-line))}))]
            (testing "an over-budget replace_all is refused, naming the cost and the way forward"
              (let [timer   (u/start-timer)
                    ;; `write-error` returns nil on success, so a completed rewrite cannot be
                    ;; mistaken for a refusal — asserting against a stringified payload would pass
                    ;; vacuously, since the payload itself contains the word "content_markdown".
                    err     (write-error {:method "update" :id (:id big)
                                          :edits [{:old_str "e" :new_str "3" :replace_all true}]})
                    elapsed (u/since-ms timer)]
                (is (some? err) "should be refused, not carried out")
                (when err
                  (is (re-find #"(?i)replace_all" err))
                  (is (re-find #"content_markdown" err)
                      "should point at the single-pass alternative"))
                ;; The guard has to price the call without performing it — one serialization, not
                ;; one per match. Carrying this one out measures ~14s, so a 5s ceiling separates
                ;; "refused up front" from "did the work first".
                (is (< elapsed 5000)
                    (format "refusal should not do the work it is refusing (took %.0fms)" (double elapsed)))))
            (testing "a realistic replace_all is well under budget and still runs"
              (let [doc (created! (call {:method "create" :name "Modest"
                                         :content_markdown (str/join "\n\n" (repeat 20 "the widget shipped"))}))
                    out (call {:method "update" :id (:id doc)
                               :edits [{:old_str "widget" :new_str "gadget" :replace_all true}]})]
                (is (not (str/includes? (:content_markdown out) "widget")))
                (is (= 20 (count (re-seq #"gadget" (:content_markdown out)))))))))))))

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

(ns metabase.mcp.v2.tools.document-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.documents.core :as documents]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.mcp.v2.registry :as registry]
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

(defn- orders-query
  "A Lib query over ORDERS — a runnable `:dataset_query` for fixtures that only need the card to
   have one. Lib rather than `mt/mbql-query`, which is deprecated since 0.61.0."
  []
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id :orders)))))

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

;; TODO(slice-11/content): restore once `metabase.mcp.v2.tools.content/fetch-document` lands —
;; this test calls it via `(#'v2.content/fetch-document ...)` to compare the tool's echo against a
;; concise get_content read. See DEC-0001 and .private/decisions in the mcp-v2-foundation sidecar.
#_(deftest create-clones-card-test
    (mt/with-temp [:model/Card {card-id :id} {:name "Orders card"
                                              :dataset_query (orders-query)}]
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
                       (:content_markdown (#'v2.content/fetch-document (:id payload))))))))))))

(deftest create-collection-target-test
  (mt/with-current-user (mt/user->id :crowberto)
    (with-tool-documents
      (fn [created!]
        (let [create! (fn [args]
                        (created! (call (merge {:method "create" :content_markdown "Body."} args))))]
          (testing "GHY-4218: an omitted collection_id saves to the caller's personal collection"
            (is (= (:id (collection/user->personal-collection (mt/user->id :crowberto)))
                   (t2/select-one-fn :collection_id :model/Document
                                     :id (:id (create! {:name "document-test personal"}))))))
          (testing "GHY-4218: collection_id \"root\" still saves to the root collection"
            (is (nil? (t2/select-one-fn :collection_id :model/Document
                                        :id (:id (create! {:name "document-test root"
                                                           :collection_id "root"}))))))
          (testing "GHY-4218: an explicit collection_id is unaffected"
            (mt/with-temp [:model/Collection {coll-id :id} {}]
              (is (= coll-id
                     (t2/select-one-fn :collection_id :model/Document
                                       :id (:id (create! {:name "document-test explicit"
                                                          :collection_id coll-id}))))))))))))

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
                                            :dataset_query (orders-query)}]
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

(def ^:private unrenderable-body
  "A stored body holding a block type the Markdown serializer has no rendering for — what a
   document written by a newer frontend, or by a REST caller (`[:document :any]`), looks like to
   this tool."
  {:type    "doc"
   :content [{:type "mysteryBlock" :attrs {:_id "m1"}}
             {:type "paragraph" :attrs {:_id "p1"} :content [{:type "text" :text "After."}]}]})

(deftest unrenderable-body-does-not-fail-a-committed-write-test
  (mt/with-current-user (mt/user->id :crowberto)
    (with-tool-documents
      (fn [created!]
        (let [doc-id (:id (created! (call {:method           "create"
                                           :name             "Old name"
                                           :content_markdown "Stable body."})))]
          (t2/update! :model/Document doc-id {:document unrenderable-body})
          (testing "a metadata-only update lands and is reported as the success it is — the write
                   commits before the response is built, so a body this tool can't render must not
                   turn a completed write into a failed call"
            (let [renamed (call {:method "update" :id doc-id :edits [] :name "New name"})]
              (is (= "New name" (:name renamed)))
              (is (= "New name" (t2/select-one-fn :name :model/Document :id doc-id)))))
          (testing "content_markdown is omitted rather than degraded — the next edit's old_str is
                   matched against that exact text, so text that isn't the serialization is worse
                   than none"
            (let [renamed (call {:method "update" :id doc-id :edits [] :name "Newer name"})]
              (is (not (contains? renamed :content_markdown)))
              (is (string? (:content_markdown_unavailable renamed)))))
          (testing "an edit against a body that can't be serialized still fails, and fails before
                   writing anything — there is no current Markdown for old_str to match"
            (is (thrown-with-msg? Exception #"Cannot serialize unknown block node type"
                                  (call {:method "update" :id doc-id
                                         :edits  [{:old_str "After." :new_str "Changed."}]})))
            (is (= "Newer name" (t2/select-one-fn :name :model/Document :id doc-id)))
            (is (= unrenderable-body (t2/select-one-fn :document :model/Document :id doc-id)))))))))

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

(deftest edit-replacement-is-literal-text-not-markdown-test
  (testing "a replacement that looks like Markdown syntax stays literal text — it does not reopen the
           block as a list/heading, lose characters to a consumed marker, or change the block's id"
    (mt/with-current-user (mt/user->id :crowberto)
      (with-tool-documents
        (fn [created!]
          (let [payload (created! (call {:method "create" :name "Literal" :content_markdown "x x x x x"}))
                doc-id  (:id payload)
                block-id (fn [] (-> (t2/select-one-fn :document :model/Document :id doc-id)
                                    :content first :attrs :_id))
                id-before (block-id)]
            (testing "* as a replace_all replacement: still one paragraph, all five survive, id kept"
              (let [updated (call {:method "update" :id doc-id
                                   :edits [{:old_str "x" :new_str "*" :replace_all true}]})
                    stored  (t2/select-one-fn :document :model/Document :id doc-id)]
                (is (= "\\* \\* \\* \\* \\*" (:content_markdown updated))
                    "the serialized body escapes each * as literal text — no marker was consumed")
                (is (= ["paragraph"] (mapv :type (:content stored)))
                    "the paragraph did not become a bulletList")
                (is (= id-before (-> stored :content first :attrs :_id))
                    "a text-only edit kept the block's id, so anchored comments stay put")))))))))

(defn- write-error
  "The error text `document_write` returns for `args`, called through the registry rather than the
   handler directly — the tool's own Malli schema is only applied at that seam, and these are
   arguments the schema is meant to reject. `nil` when the call succeeded."
  [args]
  (let [result (registry/call-tool nil "test-session" "document_write" args)]
    (when (:isError result)
      (-> result :content first :text))))

(defn- written-smart-link-attrs
  "The smartLink attrs of a document written through the tool, read back from the stored AST — the
   `label`/`href` an editor would render. Goes through the tool rather than `md/parse` because
   resolving those is a permission decision and so lives in the tool, not in the Markdown layer."
  [created! body]
  (let [payload (created! (call {:method "create" :name "smart link probe" :content_markdown body}))]
    (->> (tree-seq :content :content (t2/select-one-fn :document :model/Document :id (:id payload)))
         (keep #(when (= "smartLink" (:type %)) (:attrs %)))
         vec)))

(deftest smart-link-resolution-is-permission-checked-test
  (testing "an entity token pointing at content the caller can't read resolves to nothing, so its
           name never crosses the permission boundary — a document writer must not be able to use
           smart links to enumerate the names of content they have no access to"
    (mt/with-temp [:model/Collection {secret-id :id}   {:name "Top Secret Collection"}
                   :model/Dashboard  {hidden-id :id}   {:name "CONFIDENTIAL Layoffs" :collection_id secret-id}
                   :model/Collection {open-id :id}     {:name "Shared Reports"}
                   :model/Card       {readable-id :id} {:name          "Open Question"
                                                        :collection_id open-id
                                                        :dataset_query (orders-query)}]
      (perms/revoke-collection-permissions! (perms-group/all-users) secret-id)
      (perms/grant-collection-read-permissions! (perms-group/all-users) open-id)
      (with-tool-documents
        (fn [created!]
          (mt/with-current-user (mt/user->id :rasta)
            (testing "an unreadable target is indistinguishable from a dangling id"
              (is (= [{:entityId hidden-id :model "dashboard" :label nil :href "/"}
                      {:entityId secret-id :model "collection" :label nil :href "/"}]
                     (written-smart-link-attrs
                      created!
                      (format "{%% entity id=\"%d\" model=\"dashboard\" %%} and {%% entity id=\"%d\" model=\"collection\" %%}"
                              hidden-id secret-id)))))
            (testing "a readable target still resolves its label and href"
              (is (= [{:entityId readable-id :model "card" :label "Open Question"
                       :href (str "/question/" readable-id)}]
                     (written-smart-link-attrs created!
                                               (format "{%% entity id=\"%d\" model=\"card\" %%}" readable-id)))))
            (testing "user mentions still resolve — :model/User has no can-read? and a name is not
                     gated outside sandboxing, so the mention picker's behaviour is preserved"
              (is (= [{:entityId (mt/user->id :crowberto) :model "user" :label "Crowberto Corv" :href "/"}]
                     (written-smart-link-attrs created!
                                               (format "{%% entity id=\"%d\" model=\"user\" %%}"
                                                       (mt/user->id :crowberto)))))))
          (testing "an admin resolves what a non-admin could not"
            (mt/with-current-user (mt/user->id :crowberto)
              (is (= [{:entityId hidden-id :model "dashboard" :label "CONFIDENTIAL Layoffs"
                       :href (str "/dashboard/" hidden-id)}]
                     (written-smart-link-attrs created!
                                               (format "{%% entity id=\"%d\" model=\"dashboard\" %%}"
                                                       hidden-id)))))))))))

(deftest edit-keeps-the-label-of-a-smart-link-the-editor-cannot-read-test
  (testing "editing other text in a block must not wipe the label of a smart link pointing at
           content the editor can't read. The `{% entity %}` token carries only id and model, so a
           re-parsed block's link has no label until it is resolved from the row — and an editor
           who can't read that row resolves nothing. Treating that as \"no label\" writes the blank
           back for everyone, including the people who can see the target."
    (mt/with-temp [:model/Collection {secret-id :id} {:name "Top Secret Collection"}
                   :model/Card       {hidden-id :id} {:name          "CONFIDENTIAL Revenue"
                                                      :collection_id secret-id
                                                      :dataset_query (orders-query)}
                   :model/Card       {unseen-id :id} {:name          "CONFIDENTIAL Headcount"
                                                      :collection_id secret-id
                                                      :dataset_query (orders-query)}
                   :model/Collection {shared-id :id} {:name "Shared Reports"}]
      ;; `shared-id` needs no grant: a new collection is already all-users read-write, which is
      ;; what lets rasta edit the document while the card stays out of reach.
      (perms/revoke-collection-permissions! (perms-group/all-users) secret-id)
      (with-tool-documents
        (fn [created!]
          (let [payload    (mt/with-current-user (mt/user->id :crowberto)
                             (created!
                              (call {:method           "create"
                                     :name             "Smart link label"
                                     :collection_id    shared-id
                                     :content_markdown (str "Intro. See {% entity id=\"" hidden-id
                                                            "\" model=\"card\" %} for detail.")})))
                doc-id     (:id payload)
                link-attrs (fn []
                             (->> (tree-seq :content :content
                                            (t2/select-one-fn :document :model/Document :id doc-id))
                                  (some #(when (= "smartLink" (:type %)) (:attrs %)))))
                resolved   {:entityId hidden-id
                            :model    "card"
                            :label    "CONFIDENTIAL Revenue"
                            :href     (str "/question/" hidden-id)}]
            (testing "a writer who can read the target stores its label"
              (is (= resolved (link-attrs))))
            (let [updated (mt/with-current-user (mt/user->id :rasta)
                            (call {:method "update" :id doc-id
                                   :edits  [{:old_str "Intro." :new_str "Introduction."}]}))]
              (testing "the edit lands"
                (is (str/starts-with? (:content_markdown updated) "Introduction.")))
              (testing "and the link the editor never touched keeps its label and href"
                (is (= resolved (link-attrs))))
              (testing "without handing that editor the name they cannot read — labels live in the
                       AST, never in the Markdown, which is what makes carrying one forward safe"
                (is (not (str/includes? (:content_markdown updated) "CONFIDENTIAL")))))
            (testing "the fallback only keeps a label the document already had — a link the editor
                     adds to something they can't read resolves to nothing, so this cannot be used
                     to acquire a name"
              (mt/with-current-user (mt/user->id :rasta)
                (call {:method "update" :id doc-id
                       :edits  [{:old_str "for detail."
                                 :new_str (str "for detail, and {% entity id=\"" unseen-id
                                               "\" model=\"card\" %} too.")}]}))
              (is (= {:entityId unseen-id :model "card" :label nil :href "/"}
                     (->> (tree-seq :content :content
                                    (t2/select-one-fn :document :model/Document :id doc-id))
                          (some #(when (= unseen-id (get-in % [:attrs :entityId])) (:attrs %)))))))))))))

(deftest smart-link-labels-are-not-resolved-by-the-markdown-layer-test
  (testing "parse leaves label/href at their defaults — the Markdown namespace performs no lookup,
           which is what keeps the documents module free of a permissions dependency"
    (is (= [{:entityId 1 :model "dashboard" :label nil :href "/"}]
           (->> (tree-seq :content :content (documents/parse "see {% entity id=\"1\" model=\"dashboard\" %}"))
                (keep #(when (= "smartLink" (:type %)) (:attrs %)))
                vec)))))

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

(deftest write-scope-is-not-a-read-scope-test
  (testing "GHY-4217: a document body is content, so a write must not hand it back to a token whose
            read scopes get_content would refuse. `edits: []` is the documented way to touch nothing,
            which made it a clean read oracle over any document the caller could write to."
    (mt/with-model-cleanup [:model/Document]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [existing (documents/create-document!
                        {:name          "someone elses doc"
                         :document      (documents/parse "PRE-EXISTING SECRET")
                         :collection_id nil})
              call!    (fn [scopes]
                         (-> (registry/call-tool scopes nil "document_write"
                                                 {:method "update" :id (:id existing) :edits []})
                             :content first :text))]
          (testing "without the read scope the body is withheld, leaving the minimal ack"
            (let [txt (call! #{"agent:content:write"})]
              (is (not (re-find #"PRE-EXISTING SECRET" txt)))
              (is (re-find #"agent:content:read" txt))))
          (testing "with it, the body comes back as before — the write still reports its result"
            (let [txt (call! #{"agent:content:write" "agent:content:read"})]
              (is (re-find #"PRE-EXISTING SECRET" txt)))))))))

(deftest clear-unsets-collection-position-test
  (testing "GHY-4191: a null cannot mean \"unset this\" — the boundary strips nulls because strict
            clients fill every declared property with one — so `clear` names the property instead.
            collection_position is the only unsettable field here: collection_id has the \"root\"
            sentinel, and name and the body are required rather than clearable."
    (mt/with-model-cleanup [:model/Document]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [doc   (documents/create-document!
                     {:name                "pinned doc"
                      :document            (documents/parse "body")
                      :collection_id       nil
                      :collection_position 1})
              call! (fn [args]
                      (registry/call-tool #{"agent:content:write" "agent:content:read"} nil
                                          "document_write"
                                          (merge {:method "update" :id (:id doc)} args)))]
          (is (= 1 (t2/select-one-fn :collection_position :model/Document :id (:id doc)))
              "precondition: the document is pinned")
          (testing "a null leaves it alone, as it does everywhere else"
            (call! {:edits [] :collection_position nil})
            (is (= 1 (t2/select-one-fn :collection_position :model/Document :id (:id doc)))))
          (testing "clear unsets it"
            (call! {:edits [] :clear ["collection_position"]})
            (is (nil? (t2/select-one-fn :collection_position :model/Document :id (:id doc)))))
          (testing "a property outside the clearable set is refused at the boundary"
            (let [txt (-> (call! {:edits [] :clear ["name"]}) :content first :text)]
              (is (re-find #"clear" txt))
              (is (= "pinned doc" (t2/select-one-fn :name :model/Document :id (:id doc)))))))))))

;; TODO(slice-11/content): restore once the `get_content` tool lands — this test calls it via
;; `registry/call-tool ... "get_content"` to compare the write echo against a concise read. See
;; DEC-0001 and .private/decisions in the mcp-v2-foundation sidecar.
#_(deftest write-echo-and-read-name-the-body-alike-test
    (testing "the write echo and a concise get_content read call the body `content_markdown`. They
              used to disagree — the read said `markdown` — so an agent doing the read-modify-write
              this tool's `edits`/`old_str` design encourages had to rename the field in between."
      (mt/with-model-cleanup [:model/Document]
        (mt/with-current-user (mt/user->id :crowberto)
          (let [echo (-> (registry/call-tool #{"agent:content:write" "agent:content:read"} nil
                                             "document_write"
                                             {:method "create" :name "shared name"
                                              :content_markdown "BODY TEXT"})
                         :content first :text json/decode+kw)
                read (-> (registry/call-tool #{"agent:content:read"} nil "get_content"
                                             {:items [{:type "document" :id (:id echo)}]})
                         :content first :text json/decode+kw :results first)]
            (is (= "BODY TEXT" (:content_markdown echo)))
            (is (= (:content_markdown echo) (:content_markdown read)))
            (testing "and neither side still carries the old key"
              (is (not (contains? echo :markdown)))
              (is (not (contains? read :markdown)))))))))

(deftest ^:parallel tools-list-discoverability-test
  (testing "a dynamically-registered client can discover and call document_write. Registration is
            not enough on its own: the tool's scope also has to reach the DCR default grant, or the
            client lists a tool every call then 403s on."
    (let [grant (set (registry/registered-scopes))
          named (fn [scopes] (some #(= "document_write" (:name %)) (registry/list-tools scopes)))]
      (testing "its scope is in the default grant"
        (is (contains? grant "agent:content:write")))
      (testing "so a default-grant client sees it"
        (is (named grant)))
      (testing "and it is hidden from a token holding only the read scope"
        (is (not (named #{"agent:content:read"}))))
      (testing "the manifest carries a description and an input schema that advertises `clear`"
        (let [tool (first (filter #(= "document_write" (:name %)) (registry/list-tools grant)))]
          (is (seq (:description tool)))
          (is (get-in tool [:inputSchema :properties :clear])))))))

;; Closes the inherited finding from slice 09a's review (.private/findings/slice-09a/parallel-review.md,
;; DEC-0001): create-document!/update-document!/clone-cards-in-document! enforce permissions by
;; docstring only, and this tool is their first direct caller. This test asserts DB state — no
;; Document row created, no laundered Card clone persisted — rather than only the :isError status,
;; per the review's explicit test-gap callout.
(deftest permission-denied-write-leaves-no-db-trace-test
  (mt/with-temp [:model/Collection {locked-id :id} {:name "Locked down"}
                 :model/Card       {card-id :id}   {:name          "Someone else's card"
                                                    :collection_id locked-id
                                                    :dataset_query (orders-query)}]
    (perms/revoke-collection-permissions! (perms-group/all-users) locked-id)
    (mt/with-current-user (mt/user->id :rasta)
      (testing "create into a collection the caller cannot write to is refused before any row lands"
        (let [before-doc-count (t2/count :model/Document)
              before-card-count (t2/count :model/Card)]
          (is (thrown? Exception
                       (call {:method           "create"
                              :name             "Should not exist"
                              :content_markdown "body"
                              :collection_id    locked-id})))
          (testing "no Document row was created"
            (is (= before-doc-count (t2/count :model/Document))))
          (testing "no card was cloned as a side effect of the refused write"
            (is (= before-card-count (t2/count :model/Card))))))
      (testing "update of a document the caller can read but not write is refused, and the embedded
               foreign card is not cloned into it — a document read-check passing must not launder
               a write the caller has no permission for. `read-only-id` is granted read-only (not
               revoked entirely) so this isolates write-check from the read-check `get-document`
               already runs — without the distinct grant, revoking all access would make the
               update 404 at the read step, before write-check is ever reached."
        (mt/with-temp [:model/Collection {read-only-id :id} {:name "Read only for rasta"}]
          (perms/revoke-collection-permissions! (perms-group/all-users) read-only-id)
          (perms/grant-collection-read-permissions! (perms-group/all-users) read-only-id)
          (mt/with-current-user (mt/user->id :crowberto)
            (with-tool-documents
              (fn [created!]
                (let [payload (created! (call {:method           "create"
                                               :name             "Owner's doc"
                                               :collection_id    read-only-id
                                               :content_markdown "Body."}))
                      doc-id  (:id payload)]
                  (mt/with-current-user (mt/user->id :rasta)
                    (let [before-card-count (t2/count :model/Card)]
                      (is (thrown? Exception
                                   (call {:method           "update"
                                          :id               doc-id
                                          :content_markdown (str "See {% card id=" card-id " %}")})))
                      (testing "the document body was not modified"
                        (is (= "Body." (:markdown (documents/serialize
                                                   (t2/select-one-fn :document :model/Document :id doc-id))))))
                      (testing "the referenced card was not cloned"
                        (is (= before-card-count (t2/count :model/Card)))))))))))))))

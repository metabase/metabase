(ns metabase.mcp.v2.tools.collection-test
  "Contract tests for the `collection_write` v2 MCP tool (GHY-4148), driven through
   [[metabase.mcp.v2.registry/call-tool]] — the same seam the JSON-RPC route uses — so scope
   gating, `drop-nil-args`, Malli validation, and teaching-error conversion are exercised for
   free. Collection domain semantics (parent inheritance, descendant path rewriting, trash
   mechanics, the permission predicates themselves) are owned by
   `metabase.collections-rest.api-test` and the model tests; this suite pins the tool's contract
   on top of them."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.mcp.v2.registry :as registry]
   ;; Registers the tool the assertions below drive, and the :collection projection its echo is built from.
   [metabase.mcp.v2.tools.collection :as tools.collection]
   [metabase.mcp.v2.tools.content :as tools.content]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(comment tools.collection/keep-me tools.content/keep-me)

;;; ------------------------------------------------- Harness ------------------------------------------------------

(defn- call-tool!
  "Drive `collection_write` as `user` (test-user keyword or user id) with bearer-style `scopes`
   (nil = internal caller, which bypasses the scope gate)."
  ([user args] (call-tool! user nil args))
  ([user scopes args]
   (mt/with-current-user (if (keyword? user) (mt/user->id user) user)
     (registry/call-tool scopes nil "collection_write" args))))

(defn- tool-result
  "Decoded success payload of a tool response; throws when the call errored, so a tool-level
   error can never masquerade as a result."
  [response]
  (when (:isError response)
    (throw (ex-info (str "tool call failed: " (-> response :content first :text))
                    {:response response})))
  (-> response :content first :text json/decode+kw))

(defn- tool-error
  "Tool-level error text of a tool response; throws when the call succeeded, so a passing call
   can never satisfy an error assertion."
  [response]
  (when-not (:isError response)
    (throw (ex-info "expected a tool error, got success" {:response response})))
  (-> response :content first :text))

(defn- create!
  "Create a collection through the tool as `user`, returning the echo payload."
  [user args]
  (tool-result (call-tool! user (merge {:method "create"} args))))

;;; -------------------------------------------------- Create ------------------------------------------------------

(deftest create-happy-path-test
  (mt/with-model-cleanup [:model/Collection]
    (let [payload (create! :crowberto {:name "Agent Collection" :description "made by an agent"})
          coll    (t2/select-one :model/Collection :id (:id payload))]
      (testing "the collection is really there, at the root"
        (is (= "Agent Collection" (:name coll)))
        (is (= "made by an agent" (:description coll)))
        (is (= "/" (:location coll)))
        (is (false? (:archived coll))))
      (testing "the echo is the concise read projection plus entity_id, url, and the two write args
                the concise projection omits"
        (is (= #{:id :name :description :location :archived :entity_id :url :authority_level :namespace}
               (set (keys payload))))
        (is (= (:entity_id coll) (:entity_id payload)))
        (is (str/ends-with? (:url payload) (str "/collection/" (:id coll)))))
      (testing "a plain collection echoes both as null rather than omitting them"
        (is (nil? (:authority_level payload)))
        (is (nil? (:namespace payload)))))))

(def ^:private echo-only-keys
  "Echo fields that are deliberately not in the concise read projection, so a field-for-field
   comparison against a concise read has to set them aside."
  [:entity_id :url :authority_level :namespace])

(deftest echo-matches-concise-read-test
  (testing "the write echo and a concise get_content read agree field-for-field, so an agent that
            just wrote doesn't need a follow-up read to know what it has"
    (mt/with-model-cleanup [:model/Collection]
      (let [payload (create! :crowberto {:name "Round trip" :description "same both ways"})
            read    (mt/with-current-user (mt/user->id :crowberto)
                      (-> (registry/call-tool nil nil "get_content"
                                              {:items [{:type "collection" :id (:id payload)}]})
                          tool-result :results first))
            shared  (apply dissoc payload echo-only-keys)]
        (is (= shared (select-keys read (keys shared))))))))

(deftest create-requires-name-test
  (is (re-find #"`name` is required when method is \"create\""
               (tool-error (call-tool! :crowberto {:method "create" :description "no name"})))))

(deftest create-nests-under-parent-test
  (mt/with-model-cleanup [:model/Collection]
    (mt/with-temp [:model/Collection parent {:name "Parent"}]
      (testing "a numeric parent_id nests"
        (let [payload (create! :crowberto {:name "Child by id" :parent_id (:id parent)})]
          (is (= (str "/" (:id parent) "/")
                 (t2/select-one-fn :location :model/Collection :id (:id payload))))))
      (testing "an entity_id parent_id nests identically"
        (let [payload (create! :crowberto {:name "Child by eid" :parent_id (:entity_id parent)})]
          (is (= (str "/" (:id parent) "/")
                 (t2/select-one-fn :location :model/Collection :id (:id payload))))))
      (testing "parent_id \"root\" is the root collection, same as omitting it"
        (let [payload (create! :crowberto {:name "Child at root" :parent_id "root"})]
          (is (= "/" (t2/select-one-fn :location :model/Collection :id (:id payload)))))))))

(deftest create-accepts-namespace-test
  (mt/with-model-cleanup [:model/Collection]
    (testing "namespace puts the collection in an independent hierarchy (snippet folders)"
      (let [payload (create! :crowberto {:name "Agent Snippet Folder" :namespace "snippets"})]
        (is (= "snippets" (name (t2/select-one-fn :namespace :model/Collection :id (:id payload)))))
        (testing "and the echo confirms it, so the agent needn't re-read to know it landed"
          (is (= "snippets" (:namespace payload))))))))

(deftest create-rejects-update-only-args-test
  (doseq [[k v] {:archived true :id 1}]
    (testing (str "`" (name k) "` on create is a teaching error, not silently ignored")
      (is (re-find (re-pattern (str "`" (name k) "` applies to method \"update\" only"))
                   (tool-error (call-tool! :crowberto {:method "create" :name "x" k v})))))))

(deftest create-requires-write-perms-on-parent-test
  (testing "a user cannot create inside someone else's personal collection"
    (let [crowbertos (t2/select-one-fn :id :model/Collection :personal_owner_id (mt/user->id :crowberto))]
      (is (tool-error (call-tool! :rasta {:method "create" :name "Snooping" :parent_id crowbertos})))))
  (testing "but can create inside their own"
    (mt/with-model-cleanup [:model/Collection]
      (let [personal-id (t2/select-one-fn :id :model/Collection :personal_owner_id (mt/user->id :rasta))
            payload     (create! :rasta {:name "Rasta's subfolder" :parent_id personal-id})]
        (is (= (str "/" personal-id "/")
               (t2/select-one-fn :location :model/Collection :id (:id payload))))))))

;;; -------------------------------------------------- Update ------------------------------------------------------

(deftest update-renames-test
  (mt/with-temp [:model/Collection coll {:name "Before" :description "old"}]
    (let [payload (tool-result (call-tool! :crowberto {:method "update" :id (:id coll)
                                                       :name "After" :description "new"}))]
      (is (= "After" (:name payload)))
      (is (= "After" (t2/select-one-fn :name :model/Collection :id (:id coll))))
      (is (= "new" (t2/select-one-fn :description :model/Collection :id (:id coll)))))))

(deftest update-moves-test
  (mt/with-temp [:model/Collection parent {:name "New parent"}
                 :model/Collection coll   {:name "Mover"}]
    (testing "parent_id moves the collection"
      (tool-result (call-tool! :crowberto {:method "update" :id (:id coll) :parent_id (:id parent)}))
      (is (= (str "/" (:id parent) "/")
             (t2/select-one-fn :location :model/Collection :id (:id coll)))))
    (testing "parent_id \"root\" moves it back out to the root"
      (tool-result (call-tool! :crowberto {:method "update" :id (:id coll) :parent_id "root"}))
      (is (= "/" (t2/select-one-fn :location :model/Collection :id (:id coll)))))))

(deftest update-move-requires-write-perms-on-new-parent-test
  (testing "moving needs write access to the destination, not just to the collection being moved —
            the create path checks this, and the move path checks it separately"
    (mt/with-temp [:model/Collection coll {:name "Rasta's to move"
                                           :location (str "/" (t2/select-one-fn
                                                               :id :model/Collection
                                                               :personal_owner_id (mt/user->id :rasta)) "/")}]
      (let [crowbertos (t2/select-one-fn :id :model/Collection :personal_owner_id (mt/user->id :crowberto))]
        ;; Assert on the permission message, not merely that something failed: rasta can read the
        ;; collection being moved, so a not-found collapse here would mean the destination check
        ;; had stopped running.
        (is (re-find #"don't have permissions"
                     (tool-error (call-tool! :rasta {:method "update" :id (:id coll) :parent_id crowbertos}))))
        (testing "and the collection stays put"
          (is (not= (str "/" crowbertos "/")
                    (t2/select-one-fn :location :model/Collection :id (:id coll)))))))))

(deftest update-restores-into-a-new-parent-test
  (testing "archived: false with parent_id restores the collection somewhere new — the one path where
            archive-or-unarchive-collection! consumes parent_id, rather than move-collection!"
    (mt/with-temp [:model/Collection parent {:name "Somewhere else"}
                   :model/Collection coll   {:name "Trashed then relocated"}]
      (tool-result (call-tool! :crowberto {:method "update" :id (:id coll) :archived true}))
      (is (true? (t2/select-one-fn :archived :model/Collection :id (:id coll))))
      (let [payload (tool-result (call-tool! :crowberto {:method "update" :id (:id coll)
                                                         :archived false :parent_id (:id parent)}))]
        (is (false? (:archived payload)))
        (is (false? (t2/select-one-fn :archived :model/Collection :id (:id coll))))
        (is (= (str "/" (:id parent) "/")
               (t2/select-one-fn :location :model/Collection :id (:id coll))))))))

(deftest update-archives-and-restores-test
  (mt/with-temp [:model/Collection coll {:name "Trashable"}]
    (testing "archived: true trashes"
      (let [payload (tool-result (call-tool! :crowberto {:method "update" :id (:id coll) :archived true}))]
        (is (true? (:archived payload)))
        (is (true? (t2/select-one-fn :archived :model/Collection :id (:id coll))))))
    (testing "archived: false restores"
      (let [payload (tool-result (call-tool! :crowberto {:method "update" :id (:id coll) :archived false}))]
        (is (false? (:archived payload)))
        (is (false? (t2/select-one-fn :archived :model/Collection :id (:id coll))))))))

(deftest update-leaves-archived-alone-when-omitted-test
  (testing "an update that doesn't mention archived must not resurrect a trashed collection — the REST
            endpoint's schema defaults archived to false, and the tool must not inherit that"
    (mt/with-temp [:model/Collection coll {:name "Stays trashed" :archived true}]
      (tool-result (call-tool! :crowberto {:method "update" :id (:id coll) :name "Renamed in the trash"}))
      (is (true? (t2/select-one-fn :archived :model/Collection :id (:id coll)))))))

(deftest update-requires-id-test
  (is (re-find #"`id` is required when method is \"update\""
               (tool-error (call-tool! :crowberto {:method "update" :name "nope"})))))

(deftest update-rejects-namespace-test
  (mt/with-temp [:model/Collection coll {:name "Fixed namespace"}]
    (is (re-find #"`namespace` applies to method \"create\" only"
                 (tool-error (call-tool! :crowberto {:method "update" :id (:id coll) :namespace "snippets"}))))))

(deftest update-by-entity-id-test
  (mt/with-temp [:model/Collection coll {:name "By eid"}]
    (tool-result (call-tool! :crowberto {:method "update" :id (:entity_id coll) :name "Renamed by eid"}))
    (is (= "Renamed by eid" (t2/select-one-fn :name :model/Collection :id (:id coll))))))

(deftest update-unknown-id-collapses-to-not-found-test
  (testing "a nonexistent id and an unreadable one give the same answer"
    (is (re-find #"not found" (tool-error (call-tool! :crowberto {:method "update" :id 13371337 :name "x"}))))
    (mt/with-temp [:model/Collection coll {:name "Crowberto's personal subfolder"
                                           :location (str "/" (t2/select-one-fn
                                                               :id :model/Collection
                                                               :personal_owner_id (mt/user->id :crowberto)) "/")}]
      (is (re-find #"not found" (tool-error (call-tool! :rasta {:method "update" :id (:id coll) :name "x"})))))))

(deftest invalid-method-test
  (testing "an unknown method never reaches the handler — the args schema rejects it"
    (is (str/starts-with? (tool-error (call-tool! :crowberto {:method "delete" :id 1}))
                          "Invalid arguments"))))

;;; --------------------------------------------- authority_level --------------------------------------------------

(deftest authority-level-create-test
  (mt/with-model-cleanup [:model/Collection]
    (testing "an admin on an instance with the feature can create an official collection"
      (mt/with-premium-features #{:official-collections}
        (let [payload (create! :crowberto {:name "Official" :authority_level "official"})]
          (is (= :official (t2/select-one-fn :authority_level :model/Collection :id (:id payload))))
          (testing "and the echo confirms it"
            (is (= "official" (:authority_level payload)))))))
    (testing "without the feature it is refused"
      (mt/with-premium-features #{}
        (is (tool-error (call-tool! :crowberto {:method "create" :name "Not official"
                                                :authority_level "official"})))))
    (testing "a non-admin is refused even with the feature"
      (mt/with-premium-features #{:official-collections}
        (let [personal-id (t2/select-one-fn :id :model/Collection :personal_owner_id (mt/user->id :rasta))]
          (is (tool-error (call-tool! :rasta {:method "create" :name "Rasta official"
                                              :parent_id personal-id
                                              :authority_level "official"}))))))))

(deftest authority-level-update-test
  (testing "an admin on an instance with the feature can mark an existing collection official"
    (mt/with-temp [:model/Collection coll {:name "To be blessed"}]
      (mt/with-premium-features #{:official-collections}
        (let [payload (tool-result (call-tool! :crowberto {:method "update" :id (:id coll)
                                                           :authority_level "official"}))]
          (is (= :official (t2/select-one-fn :authority_level :model/Collection :id (:id coll))))
          (testing "and the echo confirms it"
            (is (= "official" (:authority_level payload))))))))
  (testing "without the feature the change is refused"
    (mt/with-temp [:model/Collection coll {:name "Stays plain"}]
      (mt/with-premium-features #{}
        (is (tool-error (call-tool! :crowberto {:method "update" :id (:id coll)
                                                :authority_level "official"})))
        (is (nil? (t2/select-one-fn :authority_level :model/Collection :id (:id coll)))))))
  (testing "re-sending the level a collection already has is a no-op, not a feature check"
    (mt/with-temp [:model/Collection coll {:name "Already official" :authority_level "official"}]
      (mt/with-premium-features #{}
        (tool-result (call-tool! :crowberto {:method "update" :id (:id coll) :authority_level "official"}))
        (is (= :official (t2/select-one-fn :authority_level :model/Collection :id (:id coll))))))))

;;; --------------------------------------------------- Scopes -----------------------------------------------------

(deftest scope-gating-test
  (mt/with-model-cleanup [:model/Collection]
    (testing "a bearer token without the create scope cannot call the tool at all"
      (is (= "Insufficient scope to call tool: collection_write"
             (tool-error (call-tool! :crowberto #{"agent:search"} {:method "create" :name "x"})))))
    (testing "the create scope creates"
      (is (int? (:id (tool-result (call-tool! :crowberto #{"agent:collection:create"}
                                              {:method "create" :name "Scoped create"}))))))
    (testing "the create scope alone cannot update — the method-level gate refuses it"
      (is (re-find #"Insufficient scope to call collection_write with method: update"
                   (tool-error (call-tool! :crowberto #{"agent:collection:create"}
                                           {:method "update" :id 13371337 :name "x"})))))
    (testing "the update scope passes the method gate — the identical call reaches the id lookup"
      (is (re-find #"not found"
                   (tool-error (call-tool! :crowberto #{"agent:collection:create" "agent:collection:update"}
                                           {:method "update" :id 13371337 :name "x"})))))
    (testing "the wildcard the metabot permission bucket grants covers both"
      (is (re-find #"not found"
                   (tool-error (call-tool! :crowberto #{"agent:collection:*"}
                                           {:method "update" :id 13371337 :name "x"})))))))

(deftest write-scopes-grantable-test
  (testing "GHY-4148: the scopes the tool checks are advertised, so a token can actually be granted them"
    (is (every? (registry/registered-scopes)
                #{"agent:collection:create" "agent:collection:update"}))))

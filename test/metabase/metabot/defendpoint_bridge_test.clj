(ns metabase.metabot.defendpoint-bridge-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.defendpoint-bridge :as bridge]
   [metabase.metabot.scope :as scope]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(deftest manifest-includes-collection-tools-test
  (testing "the four annotated collection endpoints show up in the manifest"
    (let [names (bridge/manifest-tool-names)]
      (is (contains? names "list_collections"))
      (is (contains? names "get_collection"))
      (is (contains? names "list_collection_items"))
      (is (contains? names "create_collection")))))

(deftest endpoint-tools-shape-test
  (testing "endpoint-tools returns tool defs with the keys the agent loop expects"
    (binding [scope/*current-user-scope* #{"agent:collection:*"}]
      (let [tools (bridge/endpoint-tools #{"list_collections" "get_collection"})]
        (is (= #{"list_collections" "get_collection"} (set (keys tools))))
        (doseq [[_ tool-def] tools]
          (is (string? (:tool-name tool-def)))
          (is (string? (:doc tool-def)))
          (is (map? (:schema tool-def)))
          (is (= "object" (get-in tool-def [:schema :type])))
          (is (fn? (:fn tool-def))))))))

(deftest endpoint-tools-scope-filtering-test
  (testing "scope-restricted tools are excluded when the user lacks the scope"
    (binding [scope/*current-user-scope* #{}]
      (let [tools (bridge/endpoint-tools #{"list_collections" "create_collection"})]
        (is (empty? tools)
            "no scopes ⇒ no bridge tools"))))
  (testing "read scope grants list/get tools but not create"
    (binding [scope/*current-user-scope* #{"agent:collection:read"}]
      (let [tools (bridge/endpoint-tools #{"list_collections" "create_collection"})]
        (is (contains? tools "list_collections"))
        (is (not (contains? tools "create_collection")))))))

(deftest list-collections-happy-path-test
  (testing "list_collections returns the visible collections for the current user"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Collection _ {:name "Bridge POC Marketing"}]
        (binding [scope/*current-user-scope* #{"agent:collection:*"}]
          (let [tools  (bridge/endpoint-tools #{"list_collections"})
                tool   (get tools "list_collections")
                result ((:fn tool) {:q "bridge poc marketing"})]
            (is (string? (:output result)))
            (is (some #(= "Bridge POC Marketing" (:name %))
                      (:structured-output result))
                "the seeded collection appears in the structured output")
            (testing "instructions are appended for LLM consumption"
              (is (some? (:instructions result))))))))))

(deftest list-collections-limit-test
  (testing "list_collections respects the limit cap"
    (mt/with-current-user (mt/user->id :crowberto)
      (binding [scope/*current-user-scope* #{"agent:collection:*"}]
        (let [tool   (get (bridge/endpoint-tools #{"list_collections"}) "list_collections")
              result ((:fn tool) {:limit 1})]
          (is (= 1 (count (:structured-output result)))
              "limit caps the result to N rows"))))))

(deftest get-collection-not-found-test
  (testing "missing collection produces a readable error, not a stack trace"
    (mt/with-current-user (mt/user->id :crowberto)
      (binding [scope/*current-user-scope* #{"agent:collection:*"}]
        (let [tool   (get (bridge/endpoint-tools #{"get_collection"}) "get_collection")
              result ((:fn tool) {:id 999999999})]
          (is (re-find #"(?i)error" (:output result))))))))

(deftest path-interpolation-test
  (testing "path placeholders fail loudly when arguments are missing"
    (mt/with-current-user (mt/user->id :crowberto)
      (binding [scope/*current-user-scope* #{"agent:collection:*"}]
        (let [tool   (get (bridge/endpoint-tools #{"get_collection"}) "get_collection")
              result ((:fn tool) {})]
          (is (re-find #"(?i)error.*id" (:output result))))))))

(deftest output-structured-payload-is-json-encodable-test
  (testing "the LLM-visible :output is a JSON string we can round-trip"
    (mt/with-current-user (mt/user->id :crowberto)
      (binding [scope/*current-user-scope* #{"agent:collection:*"}]
        (let [tool   (get (bridge/endpoint-tools #{"list_collections"}) "list_collections")
              result ((:fn tool) {:limit 1})
              [_ encoded] (re-find #"(?s)Result.*?:\n(.*)" (:output result))]
          (is (some? encoded))
          (is (sequential? (json/decode encoded))))))))

;;; ----------------------------------------------------------------------------
;;; Phase 2: vector :tool, :fields allowlist enforcement, :feature gating
;;; ----------------------------------------------------------------------------

(deftest manifest-includes-phase2-update-tools-test
  (testing "the multi-intent :tool vector splits PUT /collection/:id and PUT /card/:id into intent-narrow tools"
    (let [names (bridge/manifest-tool-names)]
      (is (contains? names "update_collection"))
      (is (contains? names "move_collection"))
      (is (contains? names "update_card"))
      (is (contains? names "move_card")))))

(deftest update-collection-input-schema-is-narrowed-test
  (testing ":fields restricts the LLM-visible inputSchema"
    (binding [scope/*current-user-scope* #{"agent:collection:*"}]
      (let [tool       (get (bridge/endpoint-tools #{"update_collection"}) "update_collection")
            properties (set (keys (get-in tool [:schema :properties])))]
        (is (= #{:id :name :description :authority_level :type} properties)
            "only the route :id and the four allow-listed body fields should be exposed")
        (is (not (contains? properties :parent_id))
            "parent_id belongs to move_collection, not update_collection")
        (is (not (contains? properties :archived))
            "archived is not exposed by either intent in Phase 2")))))

(deftest move-collection-input-schema-is-narrowed-test
  (binding [scope/*current-user-scope* #{"agent:collection:*"}]
    (let [tool       (get (bridge/endpoint-tools #{"move_collection"}) "move_collection")
          properties (set (keys (get-in tool [:schema :properties])))]
      (is (= #{:id :parent_id} properties)))))

(deftest bridge-strips-disallowed-keys-before-handler-test
  (testing "extra LLM-supplied keys are filtered out at the bridge boundary, never reaching the handler"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Bridge Filter Test"}]
        (binding [scope/*current-user-scope* #{"agent:collection:*"}]
          (let [tool   (get (bridge/endpoint-tools #{"update_collection"}) "update_collection")
                ;; The LLM sneaks `archived` in even though it's not in the tool schema.
                _      ((:fn tool) {:id          coll-id
                                    :name        "Bridge Filter Test (renamed)"
                                    :archived    true
                                    :parent_id   1})
                after  (t2/select-one [:model/Collection :name :archived] coll-id)]
            (is (= "Bridge Filter Test (renamed)" (:name after))
                "the rename did happen — allow-listed fields go through")
            (is (false? (boolean (:archived after)))
                "the bridge stripped :archived before the handler ever saw it")))))))

(deftest verify-card-feature-gating-test
  (testing "verify_card surfaces the :feature on its manifest entry"
    (when (some #(= "verify_card" (:name %))
                (:tools (#'bridge/manifest)))
      (let [entry (first (filter #(= "verify_card" (:name %))
                                 (:tools (#'bridge/manifest))))]
        (is (= :content-verification (:feature entry))))))
  (testing "endpoint-tools omits feature-gated tools when the feature is off"
    (binding [scope/*current-user-scope* #{"agent:moderation:*"}]
      (with-redefs [premium-features/has-feature? (constantly false)]
        (is (not (contains? (bridge/endpoint-tools #{"verify_card"}) "verify_card"))
            "feature off ⇒ tool filtered out"))
      (with-redefs [premium-features/has-feature? (constantly true)]
        ;; Only assert presence when the EE namespace is actually loaded; on OSS-only
        ;; classpaths the namespace isn't loaded and the tool isn't bridgeable.
        (when (find-ns 'metabase-enterprise.content-verification.api.moderation-review)
          (is (contains? (bridge/endpoint-tools #{"verify_card"}) "verify_card")))))))

(deftest profile-validation-tolerates-missing-ee-tools-test
  (testing "manifest-tool-names includes EE-feature-gated names so OSS profile registration doesn't reject them"
    (is (contains? (bridge/manifest-tool-names) "verify_card")
        "verify_card must be considered a valid endpoint-tool name regardless of EE classpath presence")))

(deftest update-card-renames-through-bridge-test
  (testing "update_card mutates name/description/display via the bridge"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card {card-id :id} {:name "Bridge Card Initial"}]
        (binding [scope/*current-user-scope* #{"agent:card:*"}]
          (let [tool   (get (bridge/endpoint-tools #{"update_card"}) "update_card")
                _      ((:fn tool) {:id          card-id
                                    :name        "Bridge Card Renamed"
                                    :description "via update_card"})
                after  (t2/select-one [:model/Card :name :description] card-id)]
            (is (= "Bridge Card Renamed" (:name after)))
            (is (= "via update_card" (:description after)))))))))

(deftest move-card-changes-collection-id-test
  (testing "move_card moves a card between collections via the bridge"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Collection {dest-id :id} {:name "Bridge Move Destination"}
                     :model/Card       {card-id :id} {:name "Bridge Move Card"}]
        (binding [scope/*current-user-scope* #{"agent:card:*"}]
          (let [tool   (get (bridge/endpoint-tools #{"move_card"}) "move_card")
                _      ((:fn tool) {:id            card-id
                                    :collection_id dest-id})
                after  (t2/select-one [:model/Card :collection_id] card-id)]
            (is (= dest-id (:collection_id after)))))))))

(deftest update-collection-renames-through-bridge-test
  (testing "update_collection renames a collection via the bridge"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Bridge Collection A"}]
        (binding [scope/*current-user-scope* #{"agent:collection:*"}]
          (let [tool   (get (bridge/endpoint-tools #{"update_collection"}) "update_collection")
                _      ((:fn tool) {:id          coll-id
                                    :name        "Bridge Collection A (renamed)"
                                    :description "now described"})
                after  (t2/select-one [:model/Collection :name :description] coll-id)]
            (is (= "Bridge Collection A (renamed)" (:name after)))
            (is (= "now described" (:description after)))))))))

(deftest move-collection-reparents-through-bridge-test
  (testing "move_collection sets a new parent via the bridge"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Collection {parent-id :id} {:name "Bridge Parent"}
                     :model/Collection {child-id  :id} {:name "Bridge Child"}]
        (binding [scope/*current-user-scope* #{"agent:collection:*"}]
          (let [tool   (get (bridge/endpoint-tools #{"move_collection"}) "move_collection")
                _      ((:fn tool) {:id        child-id
                                    :parent_id parent-id})
                after  (t2/select-one [:model/Collection :location] child-id)]
            (is (re-find (re-pattern (str "/" parent-id "/")) (:location after))
                "the child collection's location should now contain the new parent's id")))))))

;;; ----------------------------------------------------------------------------
;;; Cache-invalidation hints (`entity_changed` data parts)
;;;
;;; The bridge bypasses the FE's HTTP path, so RTK Query mutation lifecycles
;;; never fire. To keep caches in sync, mutating tools attach `entity_changed`
;;; data parts which the FE handler in `metabase/metabot/state/actions.ts`
;;; consumes to invalidate tags and (for the QB-current card) soft-reload.
;;; ----------------------------------------------------------------------------

(defn- entity-changes-for-result
  [tool-name body]
  (#'bridge/entity-changes-for-result tool-name body))

(deftest entity-changed-emitted-for-card-mutations-test
  (testing "update_card response → one entity_changed part for the card"
    (let [parts (entity-changes-for-result "update_card" {:id 42 :name "X"})]
      (is (= 1 (count parts)))
      (is (= "entity_changed" (:data-type (first parts))))
      (is (= {:entity_type "card" :id 42}
             (:data (first parts))))))
  (testing "move_card preserves :collection_id (including nil for moves to root)"
    (let [parts (entity-changes-for-result "move_card" {:id 42 :collection_id 7})]
      (is (= {:entity_type "card" :id 42 :collection_id 7}
             (:data (first parts)))))
    (let [parts (entity-changes-for-result "move_card" {:id 42 :collection_id nil})]
      (is (contains? (:data (first parts)) :collection_id)
          "nil collection_id is kept so the FE invalidates the root collection")
      (is (nil? (get-in (first parts) [:data :collection_id]))))))

(deftest entity-changed-emitted-for-collection-mutations-test
  (testing "update_collection / move_collection / create_collection produce a collection part"
    (doseq [tool-name ["update_collection" "move_collection" "create_collection"]]
      (let [parts (entity-changes-for-result tool-name {:id 99 :parent_id 7 :name "X"})]
        (is (= 1 (count parts)))
        (is (= {:entity_type "collection" :id 99 :parent_id 7}
               (:data (first parts)))
            (str tool-name " should describe the collection that changed")))))
  (testing "move_collection to root keeps :parent_id nil"
    (let [parts (entity-changes-for-result "move_collection" {:id 99 :parent_id nil})]
      (is (contains? (:data (first parts)) :parent_id))
      (is (nil? (get-in (first parts) [:data :parent_id]))))))

(deftest entity-changed-emitted-for-verify-card-test
  (testing "verify_card response → entity_changed for the moderated card"
    (let [parts (entity-changes-for-result "verify_card"
                                           {:moderated_item_id 42
                                            :moderated_item_type :card
                                            :status "verified"})]
      (is (= 1 (count parts)))
      (is (= {:entity_type "card" :id 42}
             (:data (first parts))))))
  (testing "verify_card targeting a dashboard maps to entity_type \"dashboard\""
    (let [parts (entity-changes-for-result "verify_card"
                                           {:moderated_item_id 7
                                            :moderated_item_type "dashboard"
                                            :status "verified"})]
      (is (= {:entity_type "dashboard" :id 7}
             (:data (first parts)))))))

(deftest entity-changed-skipped-for-read-tools-test
  (testing "read-only tools produce no entity_changed data parts"
    (is (nil? (entity-changes-for-result "list_collections" [{:id 1} {:id 2}])))
    (is (nil? (entity-changes-for-result "get_collection" {:id 1 :name "X"})))
    (is (nil? (entity-changes-for-result "list_collection_items" {:data []})))))

(deftest entity-changed-flows-through-bridge-tool-test
  (testing "a successful bridge tool call attaches data-parts for the FE"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Collection {dest-id :id} {:name "Bridge Cache Hint Dest"}
                     :model/Card       {card-id :id} {:name          "Bridge Cache Hint Card"
                                                      :dataset_query (mt/mbql-query orders {:limit 1})}]
        (binding [scope/*current-user-scope* #{"agent:card:*"}]
          (let [tool   (get (bridge/endpoint-tools #{"move_card"}) "move_card")
                result ((:fn tool) {:id card-id :collection_id dest-id})
                part   (some-> result :data-parts first)]
            (is (some? part) "move_card should attach an entity_changed data part")
            (is (= "entity_changed" (:data-type part)))
            (is (= {:entity_type "card" :id card-id :collection_id dest-id}
                   (:data part))
                "the data part identifies the card and its new collection")))))))

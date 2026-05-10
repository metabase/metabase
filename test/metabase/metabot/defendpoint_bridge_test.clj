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
  ([tool-name body]
   (#'bridge/entity-changes-for-result tool-name nil body))
  ([tool-name arguments body]
   (#'bridge/entity-changes-for-result tool-name arguments body)))

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

;;; ----------------------------------------------------------------------------
;;; Archive + copy: destructive / lifecycle operations
;;; ----------------------------------------------------------------------------

(deftest manifest-includes-archive-and-copy-tools-test
  (testing "archive_card, archive_collection, and copy_card are exposed via the bridge"
    (let [names (bridge/manifest-tool-names)]
      (is (contains? names "archive_card"))
      (is (contains? names "archive_collection"))
      (is (contains? names "copy_card")))))

(deftest archive-card-allowlist-narrows-input-schema-test
  (testing "archive_card's inputSchema exposes :archived but not :name / :collection_id"
    (binding [scope/*current-user-scope* #{"agent:card:*"}]
      (let [tool (get (bridge/endpoint-tools #{"archive_card"}) "archive_card")
            ks   (set (map keyword (keys (get-in tool [:schema :properties]))))]
        (is (contains? ks :id)        "the path id is always exposed")
        (is (contains? ks :archived)  ":fields [:archived] is exposed")
        (is (not (contains? ks :name))
            ":name belongs to update_card, not archive_card")
        (is (not (contains? ks :collection_id))
            ":collection_id belongs to move_card, not archive_card"))))
  (testing "even if the LLM passes a forbidden key, the bridge strips it before dispatch"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card {card-id :id} {:name "Bridge Archive Allowlist Card"}]
        (binding [scope/*current-user-scope* #{"agent:card:*"}]
          (let [tool   (get (bridge/endpoint-tools #{"archive_card"}) "archive_card")
                _      ((:fn tool) {:id       card-id
                                    :archived true
                                    :name     "Should-Be-Stripped"})
                after  (t2/select-one [:model/Card :name :archived] card-id)]
            (is (true? (:archived after)))
            (is (= "Bridge Archive Allowlist Card" (:name after))
                "name was stripped by the inputSchema allowlist before dispatch")))))))

(deftest archive-card-trashes-and-restores-test
  (testing "archive_card with archived=true moves a card to the Trash"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card {card-id :id} {:name "Bridge Archive Card"}]
        (binding [scope/*current-user-scope* #{"agent:card:*"}]
          (let [tool   (get (bridge/endpoint-tools #{"archive_card"}) "archive_card")
                _      ((:fn tool) {:id card-id :archived true})
                after  (t2/select-one [:model/Card :archived] card-id)]
            (is (true? (:archived after))))))))
  (testing "archive_card with archived=false restores from the Trash"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card {card-id :id} {:name     "Bridge Restore Card"
                                                :archived true}]
        (binding [scope/*current-user-scope* #{"agent:card:*"}]
          (let [tool   (get (bridge/endpoint-tools #{"archive_card"}) "archive_card")
                _      ((:fn tool) {:id card-id :archived false})
                after  (t2/select-one [:model/Card :archived] card-id)]
            (is (false? (:archived after)))))))))

(deftest archive-collection-trashes-test
  (testing "archive_collection with archived=true moves a collection to the Trash"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Bridge Archive Collection"}]
        (binding [scope/*current-user-scope* #{"agent:collection:*"}]
          (let [tool   (get (bridge/endpoint-tools #{"archive_collection"}) "archive_collection")
                _      ((:fn tool) {:id coll-id :archived true})
                after  (t2/select-one [:model/Collection :archived] coll-id)]
            (is (true? (:archived after)))))))))

(deftest copy-card-creates-a-new-card-test
  (testing "copy_card creates a new card and returns its hydrated row"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card {card-id :id} {:name          "Bridge Copy Source"
                                                :dataset_query (mt/mbql-query orders {:limit 1})}]
        (binding [scope/*current-user-scope* #{"agent:card:*"}]
          (let [tool      (get (bridge/endpoint-tools #{"copy_card"}) "copy_card")
                result    ((:fn tool) {:id card-id})
                new-card  (:structured-output result)]
            (is (map? new-card))
            (is (integer? (:id new-card)))
            (is (not= card-id (:id new-card))
                "copy_card returns a freshly created card, not the original")
            (is (re-find #"^Copy of " (:name new-card))
                "the new card's name follows the 'Copy of …' pattern")))))))

(deftest entity-changed-emitted-for-archive-and-copy-test
  (testing "archive_card → entity_changed for the card (with :collection_id when present)"
    (let [parts (entity-changes-for-result "archive_card"
                                           {:id 42 :collection_id 7 :archived true})]
      (is (= {:entity_type "card" :id 42 :collection_id 7}
             (:data (first parts))))))
  (testing "archive_collection → entity_changed for the collection"
    (let [parts (entity-changes-for-result "archive_collection"
                                           {:id 99 :parent_id 7 :archived true})]
      (is (= {:entity_type "collection" :id 99 :parent_id 7}
             (:data (first parts))))))
  (testing "copy_card → entity_changed for the new card so the destination collection refreshes"
    (let [parts (entity-changes-for-result "copy_card"
                                           {:id 4321 :collection_id 17 :name "Copy of X"})]
      (is (= {:entity_type "card" :id 4321 :collection_id 17}
             (:data (first parts)))))))

;;; ----------------------------------------------------------------------------
;;; Dashboard tools (Tier 1 from notes/bot-1453/adding-dashboards.md)
;;; ----------------------------------------------------------------------------

(deftest manifest-includes-dashboard-tools-test
  (testing "the seven Tier 1 dashboard endpoints surface as tools"
    (let [names (bridge/manifest-tool-names)]
      (is (contains? names "create_dashboard"))
      (is (contains? names "update_dashboard"))
      (is (contains? names "move_dashboard"))
      (is (contains? names "archive_dashboard"))
      (is (contains? names "copy_dashboard"))
      (is (contains? names "create_dashboard_public_link"))
      (is (contains? names "delete_dashboard_public_link")))))

(deftest update-dashboard-input-schema-is-narrowed-test
  (testing ":fields restricts update_dashboard to name/description/width/cache_ttl"
    (binding [scope/*current-user-scope* #{"agent:dashboard:*"}]
      (let [tool       (get (bridge/endpoint-tools #{"update_dashboard"}) "update_dashboard")
            properties (set (map keyword (keys (get-in tool [:schema :properties]))))]
        (is (= #{:id :name :description :width :cache_ttl} properties)
            "only the path :id and the four allow-listed fields should be exposed")
        (is (not (contains? properties :collection_id))
            ":collection_id belongs to move_dashboard")
        (is (not (contains? properties :archived))
            ":archived belongs to archive_dashboard")
        (is (not (contains? properties :dashcards))
            ":dashcards is not exposed in Tier 1")))))

(deftest archive-dashboard-input-schema-is-narrowed-test
  (binding [scope/*current-user-scope* #{"agent:dashboard:*"}]
    (let [tool       (get (bridge/endpoint-tools #{"archive_dashboard"}) "archive_dashboard")
          properties (set (map keyword (keys (get-in tool [:schema :properties]))))]
      (is (= #{:id :archived} properties)))))

(deftest move-dashboard-input-schema-is-narrowed-test
  (binding [scope/*current-user-scope* #{"agent:dashboard:*"}]
    (let [tool       (get (bridge/endpoint-tools #{"move_dashboard"}) "move_dashboard")
          properties (set (map keyword (keys (get-in tool [:schema :properties]))))]
      (is (= #{:id :collection_id} properties)))))

(deftest create-dashboard-creates-a-dashboard-test
  (testing "create_dashboard creates a new dashboard via the bridge"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Bridge Dashboard Coll"}]
        (binding [scope/*current-user-scope* #{"agent:dashboard:*"}]
          (let [tool   (get (bridge/endpoint-tools #{"create_dashboard"}) "create_dashboard")
                result ((:fn tool) {:name          "Bridge Dashboard"
                                    :description   "made via the bridge"
                                    :collection_id coll-id})
                body   (:structured-output result)]
            (is (integer? (:id body)))
            (is (= "Bridge Dashboard" (:name body)))
            (is (= coll-id (:collection_id body)))))))))

(deftest update-dashboard-renames-through-bridge-test
  (testing "update_dashboard mutates name/description/width via the bridge"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Bridge Dashboard Initial"}]
        (binding [scope/*current-user-scope* #{"agent:dashboard:*"}]
          (let [tool  (get (bridge/endpoint-tools #{"update_dashboard"}) "update_dashboard")
                _     ((:fn tool) {:id          dash-id
                                   :name        "Bridge Dashboard Renamed"
                                   :description "via update_dashboard"
                                   :width       "full"})
                after (t2/select-one [:model/Dashboard :name :description :width] dash-id)]
            (is (= "Bridge Dashboard Renamed" (:name after)))
            (is (= "via update_dashboard" (:description after)))
            (is (= "full" (:width after)))))))))

(deftest update-dashboard-strips-disallowed-keys-test
  (testing "the bridge filters extra keys before dispatch — :archived can't sneak through update_dashboard"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Bridge Dashboard Filter"}]
        (binding [scope/*current-user-scope* #{"agent:dashboard:*"}]
          (let [tool  (get (bridge/endpoint-tools #{"update_dashboard"}) "update_dashboard")
                _     ((:fn tool) {:id       dash-id
                                   :name     "Bridge Dashboard Filter (renamed)"
                                   :archived true})
                after (t2/select-one [:model/Dashboard :name :archived] dash-id)]
            (is (= "Bridge Dashboard Filter (renamed)" (:name after))
                "the rename should land — :name is allow-listed")
            (is (false? (boolean (:archived after)))
                "the bridge stripped :archived; only archive_dashboard exposes it")))))))

(deftest move-dashboard-changes-collection-id-test
  (testing "move_dashboard reparents a dashboard via the bridge"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Collection {dest-id :id} {:name "Bridge Move Dashboard Dest"}
                     :model/Dashboard  {dash-id :id} {:name "Bridge Move Dashboard"}]
        (binding [scope/*current-user-scope* #{"agent:dashboard:*"}]
          (let [tool  (get (bridge/endpoint-tools #{"move_dashboard"}) "move_dashboard")
                _     ((:fn tool) {:id            dash-id
                                   :collection_id dest-id})
                after (t2/select-one [:model/Dashboard :collection_id] dash-id)]
            (is (= dest-id (:collection_id after)))))))))

(deftest archive-dashboard-trashes-and-restores-test
  (testing "archive_dashboard with archived=true moves a dashboard to the Trash"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Bridge Archive Dashboard"}]
        (binding [scope/*current-user-scope* #{"agent:dashboard:*"}]
          (let [tool  (get (bridge/endpoint-tools #{"archive_dashboard"}) "archive_dashboard")
                _     ((:fn tool) {:id dash-id :archived true})
                after (t2/select-one [:model/Dashboard :archived] dash-id)]
            (is (true? (:archived after))))))))
  (testing "archive_dashboard with archived=false restores from the Trash"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Dashboard {dash-id :id} {:name     "Bridge Restore Dashboard"
                                                     :archived true}]
        (binding [scope/*current-user-scope* #{"agent:dashboard:*"}]
          (let [tool  (get (bridge/endpoint-tools #{"archive_dashboard"}) "archive_dashboard")
                _     ((:fn tool) {:id dash-id :archived false})
                after (t2/select-one [:model/Dashboard :archived] dash-id)]
            (is (false? (:archived after)))))))))

(deftest copy-dashboard-creates-a-new-dashboard-test
  (testing "copy_dashboard duplicates a dashboard via the bridge"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Dashboard {src-id :id} {:name "Bridge Copy Source Dashboard"}]
        (binding [scope/*current-user-scope* #{"agent:dashboard:*"}]
          (let [tool      (get (bridge/endpoint-tools #{"copy_dashboard"}) "copy_dashboard")
                result    ((:fn tool) {:from-dashboard-id src-id
                                       :name              "Bridge Copy Result"})
                new-dash  (:structured-output result)]
            (is (map? new-dash))
            (is (integer? (:id new-dash)))
            (is (not= src-id (:id new-dash))
                "copy_dashboard returns a freshly created dashboard, not the original")
            (is (= "Bridge Copy Result" (:name new-dash)))))))))

(deftest entity-changed-emitted-for-dashboard-mutations-test
  (testing "create/update/move/archive/copy each emit a dashboard entity_changed part"
    (doseq [tool-name ["create_dashboard"
                       "update_dashboard"
                       "move_dashboard"
                       "archive_dashboard"
                       "copy_dashboard"]]
      (let [parts (entity-changes-for-result tool-name {:id 7 :collection_id 3 :name "X"})]
        (is (= 1 (count parts)))
        (is (= "entity_changed" (:data-type (first parts))))
        (is (= {:entity_type "dashboard" :id 7 :collection_id 3}
               (:data (first parts)))
            (str tool-name " should describe the dashboard that changed")))))
  (testing "move_dashboard to root keeps :collection_id nil"
    (let [parts (entity-changes-for-result "move_dashboard" {:id 7 :collection_id nil})]
      (is (contains? (:data (first parts)) :collection_id))
      (is (nil? (get-in (first parts) [:data :collection_id]))))))

(deftest entity-changed-emitted-for-public-link-tools-test
  (testing "public-link tools emit a dashboard entity_changed with public_link_changed: true"
    (testing "create_dashboard_public_link uses :dashboard-id from arguments (kebab-case path param)"
      (let [parts (entity-changes-for-result "create_dashboard_public_link"
                                             {:dashboard-id 42}
                                             {:uuid "abc"})]
        (is (= 1 (count parts)))
        (is (= "entity_changed" (:data-type (first parts))))
        (is (= {:entity_type "dashboard" :id 42 :public_link_changed true}
               (:data (first parts))))))
    (testing "delete_dashboard_public_link works with a nil body (204 response)"
      (let [parts (entity-changes-for-result "delete_dashboard_public_link"
                                             {:dashboard-id 42}
                                             nil)]
        (is (= 1 (count parts)))
        (is (= {:entity_type "dashboard" :id 42 :public_link_changed true}
               (:data (first parts))))))
    (testing "snake_case dashboard_id is also accepted (defensive)"
      (let [parts (entity-changes-for-result "create_dashboard_public_link"
                                             {:dashboard_id 42}
                                             {:uuid "abc"})]
        (is (= {:entity_type "dashboard" :id 42 :public_link_changed true}
               (:data (first parts))))))
    (testing "missing dashboard id ⇒ no parts (rather than throwing)"
      (is (nil? (entity-changes-for-result "create_dashboard_public_link" {} {:uuid "abc"}))))))

(deftest create-dashboard-public-link-end-to-end-test
  (testing "create_dashboard_public_link routed through the bridge attaches an entity_changed data part"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Bridge Public Link Dashboard"}]
        (binding [scope/*current-user-scope* #{"agent:dashboard:*"}]
          (mt/with-temporary-setting-values [enable-public-sharing true]
            (let [tool   (get (bridge/endpoint-tools #{"create_dashboard_public_link"})
                              "create_dashboard_public_link")
                  result ((:fn tool) {:dashboard-id dash-id})
                  parts  (:data-parts result)]
              (is (some? (get-in result [:structured-output :uuid]))
                  "the create endpoint returns a uuid")
              (is (= 1 (count parts)))
              (is (= "entity_changed" (:data-type (first parts))))
              (is (= {:entity_type         "dashboard"
                      :id                  dash-id
                      :public_link_changed true}
                     (:data (first parts)))))))))))
